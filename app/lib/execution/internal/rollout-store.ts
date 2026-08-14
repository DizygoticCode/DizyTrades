import "server-only";

import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const EXECUTION_ROLLOUT_POLICY_VERSION = "restricted-rollout/1.0.0" as const;
export const EXECUTION_ROLLOUT_MAX_AGE_MS = 15 * 60 * 1000;
const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const HASH = /^[a-f0-9]{64}$/;
const SYMBOL = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const VERSION = 1;

export type RolloutStatus = "unknown" | "approved" | "armed" | "disarmed" | "revoked";
export type RestrictedRolloutPolicy = Readonly<{
  policyVersion: typeof EXECUTION_ROLLOUT_POLICY_VERSION;
  allowedSymbols: readonly string[];
  maximumOrderNotional: number;
  maximumLeverage: number;
  maximumDailyLoss: number;
  reduceOnly: boolean;
}>;
export type ExecutionRolloutState = Readonly<{
  revision: number; status: RolloutStatus; bindingDigest: string | null;
  riskRevision: number | null; policy: RestrictedRolloutPolicy | null;
  approvedAt: string | null; armedAt: string | null; terminalAt: string | null; updatedAt: string | null;
}>;
export type ExecutionRolloutEvent = Readonly<{ sequence:number; userId:string; accountId:string; revision:number; kind:"approved"|"armed"|"disarmed"|"revoked"; occurredAt:string }>;
type Identity = Readonly<{userId:string;accountId:string}>;

export class ExecutionRolloutStoreError extends Error {
  constructor(readonly code:"EXECUTION_ROLLOUT_UNAVAILABLE"|"EXECUTION_ROLLOUT_INVALID"|"EXECUTION_ROLLOUT_CONFLICT") { super("EXECUTION_ROLLOUT_STORE_FAILURE"); this.name="ExecutionRolloutStoreError"; }
}
const fail=(code:ExecutionRolloutStoreError["code"]):never=>{throw new ExecutionRolloutStoreError(code)};
const timestamp=(v:unknown):v is string=>typeof v==="string"&&new Date(v).toISOString()===v;
const identity=(v:Identity)=>ID.test(v.userId)&&ID.test(v.accountId);

export function validateRestrictedRolloutPolicy(value:unknown):RestrictedRolloutPolicy {
  if(!value||typeof value!=="object"||Array.isArray(value))return fail("EXECUTION_ROLLOUT_INVALID");
  const v=value as Record<string,unknown>, keys=Object.keys(v);
  if(keys.length!==6||keys.some(k=>!["policyVersion","allowedSymbols","maximumOrderNotional","maximumLeverage","maximumDailyLoss","reduceOnly"].includes(k))
    ||v.policyVersion!==EXECUTION_ROLLOUT_POLICY_VERSION||!Array.isArray(v.allowedSymbols)||v.allowedSymbols.length<1||v.allowedSymbols.length>2
    ||new Set(v.allowedSymbols).size!==v.allowedSymbols.length||!v.allowedSymbols.every(s=>typeof s==="string"&&SYMBOL.test(s))
    ||typeof v.maximumOrderNotional!=="number"||!Number.isFinite(v.maximumOrderNotional)||v.maximumOrderNotional<=0||v.maximumOrderNotional>100
    ||!Number.isInteger(v.maximumLeverage)||Number(v.maximumLeverage)<1||Number(v.maximumLeverage)>2
    ||typeof v.maximumDailyLoss!=="number"||!Number.isFinite(v.maximumDailyLoss)||v.maximumDailyLoss<=0||v.maximumDailyLoss>50
    ||v.reduceOnly!==true)return fail("EXECUTION_ROLLOUT_INVALID");
  return Object.freeze({...v,allowedSymbols:Object.freeze([...v.allowedSymbols])}) as RestrictedRolloutPolicy;
}

export interface ExecutionRolloutStore { read(id:Identity):ExecutionRolloutState; approve(id:Identity,bindingDigest:string,riskRevision:number,policy:RestrictedRolloutPolicy,at:string,expectedRevision:number):ExecutionRolloutState; arm(id:Identity,at:string,expectedRevision:number):ExecutionRolloutState; disarm(id:Identity,at:string,expectedRevision:number):ExecutionRolloutState; revoke(id:Identity,at:string,expectedRevision:number):ExecutionRolloutState; events(id:Identity):readonly ExecutionRolloutEvent[]; }
export class SqliteExecutionRolloutStore implements ExecutionRolloutStore {
  private database:DatabaseSync|null=null; private file:{dev:number;ino:number}|null=null; private poisoned=false;
  constructor(private readonly path=join(process.env.DATA_DIR||join(process.cwd(),".data"),"execution-rollout.sqlite")){}
  private harden(){if(this.path!==":memory:")for(const p of [this.path,`${this.path}-wal`,`${this.path}-shm`])if(existsSync(p))chmodSync(p,0o600)}
  private current(){try{const s=statSync(this.path);return{dev:s.dev,ino:s.ino}}catch{return fail("EXECUTION_ROLLOUT_UNAVAILABLE")}}
  private assertFile(){if(this.poisoned)return fail("EXECUTION_ROLLOUT_UNAVAILABLE");if(this.path===":memory:")return;const c=this.current();if(!this.file||c.dev!==this.file.dev||c.ino!==this.file.ino){this.poisoned=true;this.close();fail("EXECUTION_ROLLOUT_UNAVAILABLE")}}
  private db(){if(this.poisoned)return fail("EXECUTION_ROLLOUT_UNAVAILABLE");if(this.database){this.assertFile();return this.database}let db:DatabaseSync|null=null;try{if(this.path!==":memory:")mkdirSync(dirname(this.path),{recursive:true,mode:0o700});db=new DatabaseSync(this.path);db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");const version=(db.prepare("PRAGMA user_version").get() as {user_version:number}).user_version;if(version!==0&&version!==VERSION)fail("EXECUTION_ROLLOUT_INVALID");if(version===0)db.exec(`BEGIN IMMEDIATE; CREATE TABLE rollout_state(schema_version INTEGER NOT NULL CHECK(schema_version=1),user_id TEXT NOT NULL,account_id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('approved','armed','disarmed','revoked')),binding_digest TEXT NOT NULL,risk_revision INTEGER NOT NULL,policy_json TEXT NOT NULL,approved_at TEXT NOT NULL,armed_at TEXT,terminal_at TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,account_id)); CREATE TABLE rollout_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,account_id TEXT NOT NULL,revision INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('approved','armed','disarmed','revoked')),occurred_at TEXT NOT NULL); PRAGMA user_version=1; COMMIT;`);this.database=db;this.harden();if(this.path!==":memory:")this.file=this.current();return db}catch(e){try{db?.close()}catch{}this.database=null;this.file=null;if(e instanceof ExecutionRolloutStoreError)throw e;return fail("EXECUTION_ROLLOUT_UNAVAILABLE")}}
  read(id:Identity):ExecutionRolloutState{if(!identity(id))return fail("EXECUTION_ROLLOUT_INVALID");try{const row=this.db().prepare("SELECT * FROM rollout_state WHERE user_id=? AND account_id=?").get(id.userId,id.accountId) as Record<string,unknown>|undefined;this.assertFile();if(!row)return Object.freeze({revision:0,status:"unknown",bindingDigest:null,riskRevision:null,policy:null,approvedAt:null,armedAt:null,terminalAt:null,updatedAt:null});const status=String(row.status) as RolloutStatus;let raw;try{raw=JSON.parse(String(row.policy_json))}catch{return fail("EXECUTION_ROLLOUT_INVALID")}const policy=validateRestrictedRolloutPolicy(raw);if(row.schema_version!==1||row.user_id!==id.userId||row.account_id!==id.accountId||!Number.isSafeInteger(row.revision)||Number(row.revision)<1||!["approved","armed","disarmed","revoked"].includes(status)||!HASH.test(String(row.binding_digest))||!Number.isSafeInteger(row.risk_revision)||Number(row.risk_revision)<1||!timestamp(row.approved_at)||!timestamp(row.updated_at)||(row.armed_at!==null&&!timestamp(row.armed_at))||(row.terminal_at!==null&&!timestamp(row.terminal_at))||(status==="approved"&&(row.armed_at!==null||row.terminal_at!==null))||(status==="armed"&&(row.armed_at===null||row.terminal_at!==null))||(["disarmed","revoked"].includes(status)&&row.terminal_at===null))return fail("EXECUTION_ROLLOUT_INVALID");return Object.freeze({revision:Number(row.revision),status,bindingDigest:String(row.binding_digest),riskRevision:Number(row.risk_revision),policy,approvedAt:String(row.approved_at),armedAt:row.armed_at===null?null:String(row.armed_at),terminalAt:row.terminal_at===null?null:String(row.terminal_at),updatedAt:String(row.updated_at)})}catch(e){if(e instanceof ExecutionRolloutStoreError)throw e;return fail("EXECUTION_ROLLOUT_UNAVAILABLE")}}
  approve(id:Identity,digest:string,riskRevision:number,policy:RestrictedRolloutPolicy,at:string,expected:number){validateRestrictedRolloutPolicy(policy);if(!identity(id)||!HASH.test(digest)||!Number.isSafeInteger(riskRevision)||riskRevision<1||!timestamp(at))return fail("EXECUTION_ROLLOUT_INVALID");if(expected!==0||this.read(id).status!=="unknown")return fail("EXECUTION_ROLLOUT_CONFLICT");return this.write(id,"approved",digest,riskRevision,policy,at,null,null,at,expected,"approved")}
  arm(id:Identity,at:string,expected:number){const s=this.read(id);if(!timestamp(at)||s.revision!==expected||s.status!=="approved"||!s.policy||!s.bindingDigest||!s.approvedAt||!s.riskRevision)return fail("EXECUTION_ROLLOUT_CONFLICT");return this.write(id,"armed",s.bindingDigest,s.riskRevision,s.policy,s.approvedAt,at,null,at,expected,"armed")}
  disarm(id:Identity,at:string,expected:number){return this.terminal(id,at,expected,"disarmed")}
  revoke(id:Identity,at:string,expected:number){return this.terminal(id,at,expected,"revoked")}
  private terminal(id:Identity,at:string,expected:number,status:"disarmed"|"revoked"){const s=this.read(id);if(!timestamp(at)||s.revision!==expected||s.status==="unknown")return fail("EXECUTION_ROLLOUT_CONFLICT");if(s.status==="disarmed"||s.status==="revoked")return s;return this.write(id,status,s.bindingDigest!,s.riskRevision!,s.policy!,s.approvedAt!,s.armedAt,at,at,expected,status)}
  private write(id:Identity,status:Exclude<RolloutStatus,"unknown">,digest:string,risk:number,policy:RestrictedRolloutPolicy,approved:string,armed:string|null,terminal:string|null,at:string,expected:number,kind:ExecutionRolloutEvent["kind"]){const db=this.db();try{db.exec("BEGIN IMMEDIATE");let changes;if(expected===0)changes=db.prepare("INSERT OR IGNORE INTO rollout_state VALUES(1,?,?,?,?,?,?,?,?,?,?,?)").run(id.userId,id.accountId,1,status,digest,risk,JSON.stringify(policy),approved,armed,terminal,at).changes;else changes=db.prepare("UPDATE rollout_state SET revision=?,status=?,binding_digest=?,risk_revision=?,policy_json=?,approved_at=?,armed_at=?,terminal_at=?,updated_at=? WHERE user_id=? AND account_id=? AND revision=?").run(expected+1,status,digest,risk,JSON.stringify(policy),approved,armed,terminal,at,id.userId,id.accountId,expected).changes;if(changes!==1){db.exec("ROLLBACK");return fail("EXECUTION_ROLLOUT_CONFLICT")}db.prepare("INSERT INTO rollout_events(user_id,account_id,revision,kind,occurred_at) VALUES(?,?,?,?,?)").run(id.userId,id.accountId,expected+1,kind,at);db.exec("COMMIT");this.harden();this.assertFile();return this.read(id)}catch(e){try{db.exec("ROLLBACK")}catch{}if(e instanceof ExecutionRolloutStoreError)throw e;return fail("EXECUTION_ROLLOUT_UNAVAILABLE")}}
  events(id:Identity){if(!identity(id))return fail("EXECUTION_ROLLOUT_INVALID");try{return Object.freeze((this.db().prepare("SELECT * FROM rollout_events WHERE user_id=? AND account_id=? ORDER BY sequence").all(id.userId,id.accountId) as Record<string,unknown>[]).map(r=>{if(!Number.isSafeInteger(r.sequence)||!Number.isSafeInteger(r.revision)||r.user_id!==id.userId||r.account_id!==id.accountId||!["approved","armed","disarmed","revoked"].includes(String(r.kind))||!timestamp(r.occurred_at))return fail("EXECUTION_ROLLOUT_INVALID");return Object.freeze({sequence:Number(r.sequence),userId:id.userId,accountId:id.accountId,revision:Number(r.revision),kind:String(r.kind) as ExecutionRolloutEvent["kind"],occurredAt:String(r.occurred_at)})}))}catch(e){if(e instanceof ExecutionRolloutStoreError)throw e;return fail("EXECUTION_ROLLOUT_UNAVAILABLE")}}
  close(){try{this.database?.close()}finally{this.database=null;this.file=null}}
}
export const createProductionExecutionRolloutStore=()=>new SqliteExecutionRolloutStore();
