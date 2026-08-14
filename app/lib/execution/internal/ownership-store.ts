import "server-only";

import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MEXC_PROVIDER_READBACK_MAX_AGE_MS, MEXC_PROVIDER_READBACK_VERSION, type MexcProviderAccountRiskReadback } from "../../mexc-provider-readback";
import type { AuthenticatedExecutionCaller } from "../types";
import type { ExecutionAccountIdentity } from "./reconciliation-store";

const VERSION = 1;
const TOKEN = /^[A-Za-z0-9_-]{1,120}$/;
type FileIdentity = Readonly<{ dev: number; ino: number }>;
export type ExecutionOwnershipStatus = "unknown" | "proved" | "active" | "revoked";
export type ExecutionOwnershipState = Readonly<{
  revision: number; status: ExecutionOwnershipStatus; proofObservedAt: string | null;
  activatedAt: string | null; revokedAt: string | null;
}>;

export class ExecutionOwnershipStoreError extends Error {
  constructor(readonly code: "EXECUTION_OWNERSHIP_UNAVAILABLE" | "EXECUTION_OWNERSHIP_INVALID") {
    super("EXECUTION_OWNERSHIP_STORE_FAILURE"); this.name = "ExecutionOwnershipStoreError";
  }
}
const fail = (code: ExecutionOwnershipStoreError["code"]): never => { throw new ExecutionOwnershipStoreError(code); };
const validIdentity = (x: ExecutionAccountIdentity) => TOKEN.test(x.userId) && TOKEN.test(x.accountId);
const validIso = (x: unknown): x is string => typeof x === "string" && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;

export interface ExecutionOwnershipStore {
  read(identity: ExecutionAccountIdentity): ExecutionOwnershipState;
  recordProof(identity: ExecutionAccountIdentity, observedAt: string, expectedRevision: number): ExecutionOwnershipState;
  activate(identity: ExecutionAccountIdentity, expectedRevision: number, now?: Date): ExecutionOwnershipState;
  revoke(identity: ExecutionAccountIdentity, expectedRevision: number, now?: Date): ExecutionOwnershipState;
}

export class SqliteExecutionOwnershipStore implements ExecutionOwnershipStore {
  private database: DatabaseSync | null = null;
  private identity: FileIdentity | null = null;
  constructor(private readonly path = join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-ownership.sqlite")) {}
  private current(): FileIdentity { try { const s=statSync(this.path); return {dev:s.dev,ino:s.ino}; } catch { return fail("EXECUTION_OWNERSHIP_UNAVAILABLE"); } }
  private assertBacking() { if(this.path===":memory:")return; const x=this.current(); if(!this.identity||x.dev!==this.identity.dev||x.ino!==this.identity.ino){this.close();fail("EXECUTION_OWNERSHIP_UNAVAILABLE");} }
  private harden() { if(this.path===":memory:")return; for(const p of [this.path,`${this.path}-wal`,`${this.path}-shm`])if(existsSync(p))chmodSync(p,0o600); }
  private db() {
    if(this.database){this.assertBacking();return this.database;} let db:DatabaseSync|null=null;
    try {
      if(this.path!==":memory:")mkdirSync(dirname(this.path),{recursive:true,mode:0o700});
      db=new DatabaseSync(this.path); db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const row=db.prepare("PRAGMA user_version").get() as {user_version:number};
      if(row.user_version!==0&&row.user_version!==VERSION)fail("EXECUTION_OWNERSHIP_INVALID");
      if(row.user_version===0)db.exec(`BEGIN IMMEDIATE; CREATE TABLE ownership_state(
        schema_version INTEGER NOT NULL CHECK(schema_version=1), user_id TEXT NOT NULL CHECK(length(user_id) BETWEEN 1 AND 120),
        account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 120), revision INTEGER NOT NULL CHECK(revision>0),
        status TEXT NOT NULL CHECK(status IN ('proved','active','revoked')), proof_observed_at TEXT NOT NULL CHECK(length(proof_observed_at)<=64),
        activated_at TEXT CHECK(activated_at IS NULL OR length(activated_at)<=64), revoked_at TEXT CHECK(revoked_at IS NULL OR length(revoked_at)<=64),
        updated_at TEXT NOT NULL CHECK(length(updated_at)<=64), PRIMARY KEY(user_id,account_id)); PRAGMA user_version=1; COMMIT;`);
      this.database=db;this.harden();if(this.path!==":memory:")this.identity=this.current();return db;
    } catch(e){try{db?.close();}catch{}this.database=null;this.identity=null;if(e instanceof ExecutionOwnershipStoreError)throw e;return fail("EXECUTION_OWNERSHIP_UNAVAILABLE");}
  }
  private parse(row:Record<string,unknown>|undefined,id:ExecutionAccountIdentity):ExecutionOwnershipState {
    if(!row)return Object.freeze({revision:0,status:"unknown",proofObservedAt:null,activatedAt:null,revokedAt:null});
    const status=String(row.status) as ExecutionOwnershipStatus;
    const proof=String(row.proof_observed_at), activated=row.activated_at===null?null:String(row.activated_at), revoked=row.revoked_at===null?null:String(row.revoked_at);
    const semantic=(status==="proved"&&activated===null&&revoked===null)||(status==="active"&&activated!==null&&revoked===null)||(status==="revoked"&&revoked!==null);
    if(row.schema_version!==VERSION||row.user_id!==id.userId||row.account_id!==id.accountId||!validIdentity(id)
      ||!Number.isSafeInteger(row.revision)||(row.revision as number)<1||!["proved","active","revoked"].includes(status)||!semantic
      ||!validIso(proof)||(activated!==null&&!validIso(activated))||(revoked!==null&&!validIso(revoked))||!validIso(row.updated_at))fail("EXECUTION_OWNERSHIP_INVALID");
    return Object.freeze({revision:row.revision as number,status,proofObservedAt:proof,activatedAt:activated,revokedAt:revoked});
  }
  read(id:ExecutionAccountIdentity){if(!validIdentity(id))return fail("EXECUTION_OWNERSHIP_INVALID");const db=this.db();try{const value=this.parse(db.prepare("SELECT * FROM ownership_state WHERE user_id=? AND account_id=?").get(id.userId,id.accountId) as Record<string,unknown>|undefined,id);this.assertBacking();return value;}catch(e){if(e instanceof ExecutionOwnershipStoreError)throw e;return fail("EXECUTION_OWNERSHIP_UNAVAILABLE");}}
  recordProof(id:ExecutionAccountIdentity,observedAt:string,revision:number){if(!validIso(observedAt))return fail("EXECUTION_OWNERSHIP_INVALID");return this.write(id,"proved",observedAt,null,null,revision);}
  activate(id:ExecutionAccountIdentity,revision:number,now=new Date()){const old=this.read(id);if(old.revision!==revision||old.status!=="proved"||!old.proofObservedAt||now.getTime()-Date.parse(old.proofObservedAt)<0||now.getTime()-Date.parse(old.proofObservedAt)>MEXC_PROVIDER_READBACK_MAX_AGE_MS)return fail("EXECUTION_OWNERSHIP_INVALID");return this.write(id,"active",old.proofObservedAt,now.toISOString(),null,revision);}
  revoke(id:ExecutionAccountIdentity,revision:number,now=new Date()){const old=this.read(id);if(old.revision!==revision||old.status==="unknown"||old.status==="revoked")return fail("EXECUTION_OWNERSHIP_INVALID");return this.write(id,"revoked",old.proofObservedAt!,old.activatedAt,now.toISOString(),revision);}
  private write(id:ExecutionAccountIdentity,status:Exclude<ExecutionOwnershipStatus,"unknown">,proof:string,activated:string|null,revoked:string|null,revision:number){if(!validIdentity(id)||!Number.isSafeInteger(revision)||revision<0)return fail("EXECUTION_OWNERSHIP_INVALID");const db=this.db();try{db.exec("BEGIN IMMEDIATE");const current=db.prepare("SELECT revision FROM ownership_state WHERE user_id=? AND account_id=?").get(id.userId,id.accountId) as {revision:number}|undefined;if((current?.revision??0)!==revision)return fail("EXECUTION_OWNERSHIP_INVALID");db.prepare(`INSERT INTO ownership_state VALUES(1,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,account_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,proof_observed_at=excluded.proof_observed_at,activated_at=excluded.activated_at,revoked_at=excluded.revoked_at,updated_at=excluded.updated_at`).run(id.userId,id.accountId,revision+1,status,proof,activated,revoked,new Date().toISOString());db.exec("COMMIT");this.harden();this.assertBacking();return this.read(id);}catch(e){try{db.exec("ROLLBACK")}catch{}if(e instanceof ExecutionOwnershipStoreError)throw e;return fail("EXECUTION_OWNERSHIP_UNAVAILABLE");}}
  close(){try{this.database?.close();}finally{this.database=null;this.identity=null;}}
  databasePath(){return this.path;}
}

/** Server-only proof transition: authenticated identity plus fresh Radar output, never a client claim. */
export async function proveExecutionOwnership(store:ExecutionOwnershipStore,caller:AuthenticatedExecutionCaller,readback:()=>Promise<MexcProviderAccountRiskReadback>,expectedRevision:number,now=new Date()) {
  if(!validIdentity(caller))return fail("EXECUTION_OWNERSHIP_INVALID");
  const observation=await readback();
  const age=now.getTime()-Date.parse(observation.observedAt);
  if(observation.version!==MEXC_PROVIDER_READBACK_VERSION||observation.provider!=="mexc"||observation.userId!==caller.userId||observation.accountId!==caller.accountId||observation.settlementCurrency!=="USDT"||!Number.isFinite(age)||age<0||age>MEXC_PROVIDER_READBACK_MAX_AGE_MS)return fail("EXECUTION_OWNERSHIP_INVALID");
  return store.recordProof(Object.freeze({userId:caller.userId,accountId:caller.accountId}),observation.observedAt,expectedRevision);
}

export const createProductionExecutionOwnershipStore=()=>new SqliteExecutionOwnershipStore();
