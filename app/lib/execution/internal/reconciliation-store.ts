import "server-only";

import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type ExecutionAccountIdentity = Readonly<{ userId: string; accountId: string }>;
export type ExpectedExecutionPosition = Readonly<{ symbol: string; side: "long" | "short"; contractVolume: number }>;
export type ReconciliationReason = "CLEAN" | "EXPECTED_POSITION_MISSING" | "UNEXPECTED_PROVIDER_POSITION"
  | "POSITION_SIDE_MISMATCH" | "POSITION_QUANTITY_MISMATCH" | "OBSERVATION_INVALID"
  | "OBSERVATION_STALE" | "IDENTITY_MISMATCH" | "POSITION_AMBIGUOUS";
export type ReconciliationState = Readonly<{ revision: number; status: "unknown" | "clean" | "quarantined"; reason: ReconciliationReason | "NOT_RECONCILED"; expected: readonly ExpectedExecutionPosition[] }>;

const VERSION = 1;
const TOKEN = /^[A-Za-z0-9_-]{1,120}$/;
const SYMBOL = /^[A-Z0-9]{1,20}_USDT$/;
const RECONCILIATION_REASONS = new Set<ReconciliationState["reason"]>([
  "NOT_RECONCILED", "CLEAN", "EXPECTED_POSITION_MISSING", "UNEXPECTED_PROVIDER_POSITION",
  "POSITION_SIDE_MISMATCH", "POSITION_QUANTITY_MISMATCH", "OBSERVATION_INVALID",
  "OBSERVATION_STALE", "IDENTITY_MISMATCH", "POSITION_AMBIGUOUS",
]);
type FileIdentity = Readonly<{ dev: number; ino: number }>;

export class ExecutionReconciliationStoreError extends Error {
  constructor(readonly code: "EXECUTION_RECONCILIATION_UNAVAILABLE" | "EXECUTION_RECONCILIATION_INVALID") {
    super("EXECUTION_RECONCILIATION_STORE_FAILURE"); this.name = "ExecutionReconciliationStoreError";
  }
}
const fail = (code: ExecutionReconciliationStoreError["code"]): never => { throw new ExecutionReconciliationStoreError(code); };
const validIdentity = (x: ExecutionAccountIdentity) => TOKEN.test(x.userId) && TOKEN.test(x.accountId);
const validPosition = (p: ExpectedExecutionPosition) => SYMBOL.test(p.symbol) && (p.side === "long" || p.side === "short") && Number.isFinite(p.contractVolume) && p.contractVolume > 0;

export interface ExecutionReconciliationStore {
  read(identity: ExecutionAccountIdentity): ReconciliationState;
  setExpected(identity: ExecutionAccountIdentity, expected: readonly ExpectedExecutionPosition[], expectedRevision: number): ReconciliationState;
  record(identity: ExecutionAccountIdentity, reason: ReconciliationReason, expectedRevision: number): ReconciliationState;
}

export class SqliteExecutionReconciliationStore implements ExecutionReconciliationStore {
  private database: DatabaseSync | null = null;
  private identity: FileIdentity | null = null;
  constructor(private readonly path = join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-reconciliation.sqlite")) {}
  private current(): FileIdentity { try { const s = statSync(this.path); return { dev:s.dev, ino:s.ino }; } catch { return fail("EXECUTION_RECONCILIATION_UNAVAILABLE"); } }
  private assertBacking() { if (this.path === ":memory:") return; const x=this.current(); if (!this.identity || x.dev!==this.identity.dev || x.ino!==this.identity.ino) { this.close(); fail("EXECUTION_RECONCILIATION_UNAVAILABLE"); } }
  private harden() { if(this.path === ":memory:") return; for(const p of [this.path,`${this.path}-wal`,`${this.path}-shm`]) if(existsSync(p)) chmodSync(p,0o600); }
  private db() {
    if (this.database) { this.assertBacking(); return this.database; }
    let db: DatabaseSync | null=null;
    try {
      if(this.path!==":memory:") mkdirSync(dirname(this.path),{recursive:true,mode:0o700});
      db=new DatabaseSync(this.path); db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const row=db.prepare("PRAGMA user_version").get() as {user_version:number};
      if(row.user_version!==0 && row.user_version!==VERSION) fail("EXECUTION_RECONCILIATION_INVALID");
      if(row.user_version===0) db.exec(`BEGIN IMMEDIATE; CREATE TABLE reconciliation_state(
        schema_version INTEGER NOT NULL CHECK(schema_version=1), user_id TEXT NOT NULL CHECK(length(user_id) BETWEEN 1 AND 120),
        account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 120), revision INTEGER NOT NULL CHECK(revision>=0),
        status TEXT NOT NULL CHECK(status IN ('unknown','clean','quarantined')), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 48),
        expected_json TEXT NOT NULL CHECK(length(expected_json)<=8192), updated_at TEXT NOT NULL CHECK(length(updated_at)<=64),
        PRIMARY KEY(user_id,account_id)); PRAGMA user_version=1; COMMIT;`);
      this.database=db; this.harden(); if(this.path!==":memory:") this.identity=this.current(); return db;
    } catch(e) { try{db?.close();}catch{} this.database=null; this.identity=null; if(e instanceof ExecutionReconciliationStoreError) throw e; return fail("EXECUTION_RECONCILIATION_UNAVAILABLE"); }
  }
  private parse(row: Record<string,unknown> | undefined, identity:ExecutionAccountIdentity): ReconciliationState {
    if(!row) return Object.freeze({revision:0,status:"unknown",reason:"NOT_RECONCILED",expected:Object.freeze([])});
    const status=String(row.status);
    const reason=String(row.reason) as ReconciliationState["reason"];
    const updatedAt=String(row.updated_at);
    const validStatusReason=(status==="unknown"&&reason==="NOT_RECONCILED")
      ||(status==="clean"&&reason==="CLEAN")
      ||(status==="quarantined"&&reason!=="CLEAN"&&reason!=="NOT_RECONCILED");
    if(row.schema_version!==VERSION || row.user_id!==identity.userId || row.account_id!==identity.accountId
      || !validIdentity({userId:String(row.user_id),accountId:String(row.account_id)})
      || !Number.isSafeInteger(row.revision) || (row.revision as number)<0
      || !["unknown","clean","quarantined"].includes(status) || !RECONCILIATION_REASONS.has(reason)
      || !validStatusReason || !Number.isFinite(Date.parse(updatedAt)) || new Date(updatedAt).toISOString()!==updatedAt) fail("EXECUTION_RECONCILIATION_INVALID");
    let expected: unknown; try{expected=JSON.parse(String(row.expected_json));}catch{return fail("EXECUTION_RECONCILIATION_INVALID");}
    if(!Array.isArray(expected)||expected.length>200||!expected.every(validPosition)
      ||new Set(expected.map(position=>position.symbol)).size!==expected.length) fail("EXECUTION_RECONCILIATION_INVALID");
    const positions = expected as ExpectedExecutionPosition[];
    return Object.freeze({revision:row.revision as number,status:status as ReconciliationState["status"],reason,expected:Object.freeze(positions.map(x=>Object.freeze({...x})))});
  }
  read(id:ExecutionAccountIdentity) { if(!validIdentity(id)) return fail("EXECUTION_RECONCILIATION_INVALID"); const db=this.db(); try { const result=this.parse(db.prepare("SELECT * FROM reconciliation_state WHERE user_id=? AND account_id=?").get(id.userId,id.accountId) as Record<string,unknown>|undefined,id); this.assertBacking(); return result; } catch(e){if(e instanceof ExecutionReconciliationStoreError)throw e;return fail("EXECUTION_RECONCILIATION_UNAVAILABLE");} }
  setExpected(id:ExecutionAccountIdentity, expected:readonly ExpectedExecutionPosition[], revision:number) {
    if(!validIdentity(id)||expected.length>200||!expected.every(validPosition)||new Set(expected.map(p=>p.symbol)).size!==expected.length) return fail("EXECUTION_RECONCILIATION_INVALID");
    return this.write(id,"unknown","NOT_RECONCILED",expected,revision);
  }
  record(id:ExecutionAccountIdentity, reason:ReconciliationReason, revision:number) { const old=this.read(id); if(old.revision!==revision)return fail("EXECUTION_RECONCILIATION_INVALID"); if(old.status==="quarantined") return old; return this.write(id,reason==="CLEAN"?"clean":"quarantined",reason,old.expected,revision); }
  private write(id:ExecutionAccountIdentity,status:ReconciliationState["status"],reason:ReconciliationState["reason"],expected:readonly ExpectedExecutionPosition[],revision:number) {
    const db=this.db(); const json=JSON.stringify(expected); if(Buffer.byteLength(json)>8192)return fail("EXECUTION_RECONCILIATION_INVALID");
    try { db.exec("BEGIN IMMEDIATE"); const current=db.prepare("SELECT revision FROM reconciliation_state WHERE user_id=? AND account_id=?").get(id.userId,id.accountId) as {revision:number}|undefined; if((current?.revision??0)!==revision)return fail("EXECUTION_RECONCILIATION_INVALID"); db.prepare(`INSERT INTO reconciliation_state VALUES(1,?,?,?,?,?,?,?) ON CONFLICT(user_id,account_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,reason=excluded.reason,expected_json=excluded.expected_json,updated_at=excluded.updated_at`).run(id.userId,id.accountId,revision+1,status,reason,json,new Date().toISOString()); db.exec("COMMIT"); this.harden(); this.assertBacking(); return this.read(id); } catch(e){try{db.exec("ROLLBACK")}catch{} if(e instanceof ExecutionReconciliationStoreError)throw e;return fail("EXECUTION_RECONCILIATION_UNAVAILABLE");}
  }
  close(){try{this.database?.close();}finally{this.database=null;this.identity=null;}}
  databasePath(){return this.path;}
}

export const createProductionExecutionReconciliationStore=()=>new SqliteExecutionReconciliationStore();
