import "server-only";

import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serverExecutionPolicy } from "./policy";

export const EXECUTION_RISK_POLICY_VERSION = "execution-risk-policy/1.0.0" as const;
const DATABASE_VERSION = 1;
const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const SYMBOL = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
type FileIdentity = { dev: number; ino: number };

export type ExecutionRiskPolicy = Readonly<{
  policyVersion: typeof EXECUTION_RISK_POLICY_VERSION;
  userId: string; accountId: string; revision: number; enabled: boolean;
  reviewAt: string; allowedSymbols: readonly string[];
  maximumLeverage: number; maximumOrderNotional: number; maximumGrossNotional: number;
  maximumDailyDrawdownUsdt?: number; maximumDailyDrawdownFraction?: number;
  maximumOrderMarginFractionOfAvailable: number; updatedAt: string;
}>;
export type ExecutionRiskPolicyInput = Omit<ExecutionRiskPolicy, "policyVersion" | "revision" | "updatedAt">;

export class ExecutionRiskStoreError extends Error {
  constructor(readonly code: "EXECUTION_RISK_UNAVAILABLE" | "EXECUTION_RISK_INVALID" | "EXECUTION_RISK_CONFLICT") {
    super("EXECUTION_RISK_STORE_FAILURE"); this.name = "ExecutionRiskStoreError";
  }
}
const fail = (code: ExecutionRiskStoreError["code"]): never => { throw new ExecutionRiskStoreError(code); };
const date = (v: unknown) => typeof v === "string" && v.length <= 64 && Number.isFinite(Date.parse(v));
const finitePositive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;

export function validateExecutionRiskPolicy(value: unknown): ExecutionRiskPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("EXECUTION_RISK_INVALID");
  const v = value as Record<string, unknown>; const global = serverExecutionPolicy();
  const allowedKeys = new Set(["policyVersion","userId","accountId","revision","enabled","reviewAt","allowedSymbols","maximumLeverage","maximumOrderNotional","maximumGrossNotional","maximumDailyDrawdownUsdt","maximumDailyDrawdownFraction","maximumOrderMarginFractionOfAvailable","updatedAt"]);
  if (Object.keys(v).some(k => !allowedKeys.has(k)) || v.policyVersion !== EXECUTION_RISK_POLICY_VERSION
    || typeof v.userId !== "string" || !ID.test(v.userId) || typeof v.accountId !== "string" || !ID.test(v.accountId)
    || !Number.isSafeInteger(v.revision) || (v.revision as number) < 1 || typeof v.enabled !== "boolean"
    || !date(v.reviewAt) || !date(v.updatedAt)
    || !Array.isArray(v.allowedSymbols) || v.allowedSymbols.length < 1 || v.allowedSymbols.length > global.allowedSymbols.length
    || new Set(v.allowedSymbols).size !== v.allowedSymbols.length || !v.allowedSymbols.every(s => typeof s === "string" && SYMBOL.test(s) && global.allowedSymbols.includes(s))
    || !Number.isInteger(v.maximumLeverage) || (v.maximumLeverage as number) < 1 || (v.maximumLeverage as number) > global.maximumLeverage
    || !finitePositive(v.maximumOrderNotional) || (v.maximumOrderNotional as number) > global.maximumOrderNotional
    || !finitePositive(v.maximumGrossNotional)
    || (v.maximumDailyDrawdownUsdt === undefined && v.maximumDailyDrawdownFraction === undefined)
    || (v.maximumDailyDrawdownUsdt !== undefined && !finitePositive(v.maximumDailyDrawdownUsdt))
    || (v.maximumDailyDrawdownFraction !== undefined && (!finitePositive(v.maximumDailyDrawdownFraction) || (v.maximumDailyDrawdownFraction as number) > 1))
    || !finitePositive(v.maximumOrderMarginFractionOfAvailable) || (v.maximumOrderMarginFractionOfAvailable as number) > 1) fail("EXECUTION_RISK_INVALID");
  return Object.freeze({ ...(v as ExecutionRiskPolicy), allowedSymbols: Object.freeze([...(v.allowedSymbols as string[])]) });
}

export interface ExecutionRiskStore { read(userId: string, accountId: string): ExecutionRiskPolicy | null; replace(expectedRevision: number, next: ExecutionRiskPolicyInput, now?: Date): ExecutionRiskPolicy; }
export const executionRiskDatabasePath = () => join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-risk.sqlite");

export class SqliteExecutionRiskStore implements ExecutionRiskStore {
  private database: DatabaseSync | null = null; private identity: FileIdentity | null = null;
  constructor(private readonly path = executionRiskDatabasePath(), private readonly clock = () => new Date()) {}
  private harden() { if (this.path !== ":memory:") for (const p of [this.path,`${this.path}-wal`,`${this.path}-shm`]) if (existsSync(p)) chmodSync(p, 0o600); }
  private current(): FileIdentity { try { const s=statSync(this.path); return {dev:s.dev,ino:s.ino}; } catch { return fail("EXECUTION_RISK_UNAVAILABLE"); } }
  private assertFile() { if (this.path === ":memory:") return; const c=this.current(); if (!this.identity || c.dev!==this.identity.dev || c.ino!==this.identity.ino) { try { this.database?.close(); } catch {} this.database=null; this.identity=null; fail("EXECUTION_RISK_UNAVAILABLE"); } }
  private db(): DatabaseSync {
    if (this.database) { this.assertFile(); return this.database; } let db: DatabaseSync | null=null;
    try { if (this.path !== ":memory:") mkdirSync(dirname(this.path),{recursive:true,mode:0o700}); db=new DatabaseSync(this.path); db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version=(db.prepare("PRAGMA user_version").get() as {user_version:number}).user_version; if (version!==0 && version!==DATABASE_VERSION) fail("EXECUTION_RISK_INVALID");
      if (version===0) db.exec(`BEGIN IMMEDIATE; CREATE TABLE execution_risk (user_id TEXT NOT NULL, account_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0), document TEXT NOT NULL CHECK(length(document) BETWEEN 2 AND 8192), PRIMARY KEY(user_id,account_id)); PRAGMA user_version=${DATABASE_VERSION}; COMMIT;`);
      this.database=db; this.harden(); if(this.path!==":memory:") this.identity=this.current(); return db;
    } catch(e) { try{db?.close();}catch{} this.database=null; this.identity=null; if(e instanceof ExecutionRiskStoreError) throw e; return fail("EXECUTION_RISK_UNAVAILABLE"); }
  }
  read(userId:string, accountId:string) { try { if(!ID.test(userId)||!ID.test(accountId)) fail("EXECUTION_RISK_INVALID"); const row=this.db().prepare("SELECT revision,document FROM execution_risk WHERE user_id=? AND account_id=?").get(userId,accountId) as {revision:number,document:string}|undefined; this.assertFile(); if(!row)return null; if(Buffer.byteLength(row.document)>8192)fail("EXECUTION_RISK_INVALID"); let parsed; try{parsed=JSON.parse(row.document);}catch{return fail("EXECUTION_RISK_INVALID");} const policy=validateExecutionRiskPolicy(parsed); if(policy.userId!==userId||policy.accountId!==accountId||policy.revision!==row.revision)fail("EXECUTION_RISK_INVALID"); return policy; } catch(e){if(e instanceof ExecutionRiskStoreError)throw e;return fail("EXECUTION_RISK_UNAVAILABLE");} }
  replace(expectedRevision:number,next:ExecutionRiskPolicyInput,now=this.clock()) { const candidate=validateExecutionRiskPolicy({...next,policyVersion:EXECUTION_RISK_POLICY_VERSION,revision:expectedRevision+1,updatedAt:now.toISOString()}); try { const db=this.db(); const json=JSON.stringify(candidate); let changes:number; if(expectedRevision===0) changes=Number(db.prepare("INSERT OR IGNORE INTO execution_risk(user_id,account_id,revision,document) VALUES(?,?,1,?)").run(candidate.userId,candidate.accountId,json).changes); else changes=Number(db.prepare("UPDATE execution_risk SET revision=?,document=? WHERE user_id=? AND account_id=? AND revision=?").run(candidate.revision,json,candidate.userId,candidate.accountId,expectedRevision).changes); if(changes!==1)fail("EXECUTION_RISK_CONFLICT"); this.assertFile();this.harden();this.assertFile();return candidate; } catch(e){if(e instanceof ExecutionRiskStoreError)throw e;return fail("EXECUTION_RISK_UNAVAILABLE");} }
}
export const createProductionExecutionRiskStore=()=>new SqliteExecutionRiskStore();
