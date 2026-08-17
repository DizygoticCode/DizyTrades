import "server-only";

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { databaseSession, verifyAccountPassword, verifyFreshTotp } from "../../auth-db";
import { MEXC_WRITE_EGRESS_ATTESTATION } from "./write-credential-authority-store";

export const RENDER_DEDICATED_EGRESS_ATTESTATION = "render-dedicated-outbound-ip-set/v1" as const;
export const RENDER_EGRESS_OBSERVATION_ATTESTATION = "dual-https-egress-observation/v1" as const;
export const RENDER_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS = 60_000;
export const RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS = 10 * 60_000;

const VERSION=1, ID=/^[A-Za-z0-9_:@.-]{1,120}$/, SERVICE=/^srv-[a-z0-9]{8,80}$/,
  SHA256=/^[a-f0-9]{64}$/, COMMIT=/^[a-f0-9]{40}$/, INSTANCE=/^[A-Za-z0-9_.:@-]{1,160}$/,
  SESSION=/^[A-Za-z0-9_-]{43}$/;
const REPO="DizygoticCode/DizyTrades" as const, BRANCH="main" as const;
const PROBES=["https://api4.ipify.org","https://checkip.amazonaws.com"] as const;

export type RenderRegion="oregon"|"ohio"|"virginia"|"frankfurt"|"singapore";
export type RenderEgressIdentity=Readonly<{userId:string;accountId:string;writeCredentialGeneration:string}>;
export type RenderEgressStatus="unknown"|"declared"|"observed"|"allowlisted"|"revoked";
export type RenderRuntimeEvidence=Readonly<{serviceId:string;gitCommit:string;instanceId:string;serviceType:"web";repository:typeof REPO;branch:typeof BRANCH}>;
export type OwnerRenderEgressProof=Readonly<{sessionToken:string;currentPassword:string;totp:string}>;
export type RenderEgressState=Readonly<{
  revision:number;status:RenderEgressStatus;renderServiceId:string|null;renderRegion:RenderRegion|null;
  dedicatedIpv4s:readonly string[];ipSetDigestSha256:string|null;observationCount:number;
  firstObservedIp:string|null;firstObservedAt:string|null;lastObservedIp:string|null;lastObservedAt:string|null;
  lastObservedCommit:string|null;lastObservedInstanceId:string|null;
  mexcAllowlistAttestation:typeof MEXC_WRITE_EGRESS_ATTESTATION|null;allowlistedAt:string|null;revokedAt:string|null;updatedAt:string|null;
}>;

type Stored=Readonly<{
  serviceId:string;region:RenderRegion;ips:readonly [string,string,string];digest:string;count:number;
  firstIp:string|null;firstAt:string|null;lastIp:string|null;lastAt:string|null;lastCommit:string|null;lastInstance:string|null;
  mexcAllowlisted:boolean;allowlistedAt:string|null;revokedAt:string|null;
}>;
type Mutation=Readonly<{userId:string;accountId:string;writeCredentialGeneration:string;expectedRevision:number;ownerProof:OwnerRenderEgressProof}>;
type FetchLike=(url:string,init?:Record<string,unknown>)=>Promise<{ok:boolean;status:number;text():Promise<string>}>;

export class ExecutionRenderEgressProofError extends Error{
  constructor(readonly code:"EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE"|"EXECUTION_RENDER_EGRESS_PROOF_INVALID"|"EXECUTION_RENDER_EGRESS_PROOF_CONFLICT"){
    super(code);this.name="ExecutionRenderEgressProofError";
  }
}
const fail=(code:ExecutionRenderEgressProofError["code"]):never=>{throw new ExecutionRenderEgressProofError(code);};
const timestamp=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString()===v;
const validId=(x:RenderEgressIdentity)=>ID.test(x.userId)&&ID.test(x.accountId)&&ID.test(x.writeCredentialGeneration);
const identity=(r:Mutation):RenderEgressIdentity=>Object.freeze({userId:r.userId,accountId:r.accountId,writeCredentialGeneration:r.writeCredentialGeneration});
const validMutation=(r:Mutation)=>validId(r)&&Number.isSafeInteger(r.expectedRevision)&&r.expectedRevision>=0;
const parseIpv4=(v:unknown)=>{
  if(typeof v!=="string"||!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(v))return null;
  const p=v.split(".").map(Number);return p.every(x=>x>=0&&x<=255)?p:null;
};
export const isPublicIpv4=(v:unknown):v is string=>{
  const p=parseIpv4(v);if(!p)return false;const [a,b,c]=p;
  return !(a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||
    (a===192&&b===0&&c===0)||(a===192&&b===0&&c===2)||(a===192&&b===168)||(a===198&&(b===18||b===19))||
    (a===198&&b===51&&c===100)||(a===203&&b===0&&c===113)||a>=224);
};
const ipNum=(v:string)=>v.split(".").map(Number).reduce((n,x)=>n*256+x,0);
export const canonicalDedicatedIpv4s=(v:readonly string[]):readonly [string,string,string]|null=>{
  if(v.length!==3||v.some(x=>!isPublicIpv4(x)))return null;const a=[...new Set(v)];if(a.length!==3)return null;
  a.sort((l,r)=>ipNum(l)-ipNum(r));return Object.freeze(a) as readonly [string,string,string];
};
export const renderDedicatedIpSetDigestSha256=(v:readonly string[])=>{
  const a=canonicalDedicatedIpv4s(v);return a?createHash("sha256").update(a.join("\n")).digest("hex"):null;
};
const regions=new Set<RenderRegion>(["oregon","ohio","virginia","frankfurt","singapore"]);

function validateStored(v:unknown):Stored{
  if(!v||typeof v!=="object"||Array.isArray(v))return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
  const x=v as Record<string,unknown>, ips=Array.isArray(x.ips)?canonicalDedicatedIpv4s(x.ips as string[]):null;
  const firstIp=x.firstIp===null?null:String(x.firstIp), firstAt=x.firstAt===null?null:String(x.firstAt);
  const lastIp=x.lastIp===null?null:String(x.lastIp), lastAt=x.lastAt===null?null:String(x.lastAt);
  const lastCommit=x.lastCommit===null?null:String(x.lastCommit), lastInstance=x.lastInstance===null?null:String(x.lastInstance);
  const allowlistedAt=x.allowlistedAt===null?null:String(x.allowlistedAt), revokedAt=x.revokedAt===null?null:String(x.revokedAt);
  if(!SERVICE.test(String(x.serviceId))||!regions.has(String(x.region) as RenderRegion)||!ips||!SHA256.test(String(x.digest))||
    renderDedicatedIpSetDigestSha256(ips)!==x.digest||!Number.isSafeInteger(Number(x.count))||Number(x.count)<0||
    (firstIp!==null&&(!isPublicIpv4(firstIp)||!ips.includes(firstIp)))||(lastIp!==null&&(!isPublicIpv4(lastIp)||!ips.includes(lastIp)))||
    (firstAt!==null&&!timestamp(firstAt))||(lastAt!==null&&!timestamp(lastAt))||(lastCommit!==null&&!COMMIT.test(lastCommit))||
    (lastInstance!==null&&!INSTANCE.test(lastInstance))||typeof x.mexcAllowlisted!=="boolean"||
    (allowlistedAt!==null&&!timestamp(allowlistedAt))||(revokedAt!==null&&!timestamp(revokedAt)))return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
  const count=Number(x.count), observed=count>0, obsFields=firstIp&&firstAt&&lastIp&&lastAt&&lastCommit&&lastInstance;
  if((observed&&!obsFields)||(!observed&&obsFields)||(x.mexcAllowlisted===true&&(count<2||allowlistedAt===null)))return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
  return Object.freeze({serviceId:String(x.serviceId),region:String(x.region) as RenderRegion,ips,digest:String(x.digest),count,
    firstIp,firstAt,lastIp,lastAt,lastCommit,lastInstance,mexcAllowlisted:x.mexcAllowlisted,allowlistedAt,revokedAt});
}

type FileIdentity=Readonly<{dev:number;ino:number}>;
export class SqliteRenderEgressProofStore{
  private database:DatabaseSync|null=null;private fileIdentity:FileIdentity|null=null;private poisoned=false;
  constructor(private readonly path=join(process.env.DATA_DIR||join(process.cwd(),".data"),"execution-render-egress-proof.sqlite")){}
  private harden(){if(this.path===":memory:")return;for(const p of [this.path,`${this.path}-wal`,`${this.path}-shm`])if(existsSync(p))chmodSync(p,0o600);}
  private currentFileIdentity(){try{const s=statSync(this.path);return {dev:s.dev,ino:s.ino};}catch{return fail("EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");}}
  private assertBacking(){if(this.poisoned)return fail("EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");if(this.path===":memory:")return;
    const n=this.currentFileIdentity();if(!this.fileIdentity||n.dev!==this.fileIdentity.dev||n.ino!==this.fileIdentity.ino){this.poisoned=true;this.close();return fail("EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");}}
  private db(){
    if(this.poisoned)return fail("EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");if(this.database){this.assertBacking();return this.database;}
    let db:DatabaseSync|null=null;try{
      if(this.path!==":memory:")mkdirSync(dirname(this.path),{recursive:true,mode:0o700});db=new DatabaseSync(this.path);
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version=Number((db.prepare("PRAGMA user_version").get() as {user_version:number|bigint}).user_version);
      if(version!==0&&version!==VERSION)return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
      if(version===0)db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE render_egress_proof(schema_version INTEGER NOT NULL CHECK(schema_version=1),user_id TEXT NOT NULL,account_id TEXT NOT NULL,
          write_generation TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),status TEXT NOT NULL CHECK(status IN ('declared','observed','allowlisted','revoked')),
          payload_json TEXT NOT NULL CHECK(length(payload_json)<=4096),updated_at TEXT NOT NULL CHECK(length(updated_at)<=64),PRIMARY KEY(user_id,account_id,write_generation));
        CREATE TABLE render_egress_proof_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,account_id TEXT NOT NULL,write_generation TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK(revision>=1),kind TEXT NOT NULL CHECK(kind IN ('declared','observed','allowlisted','revoked')),occurred_at TEXT NOT NULL CHECK(length(occurred_at)<=64));
        PRAGMA user_version=1; COMMIT;`);
      this.database=db;this.harden();if(this.path!==":memory:")this.fileIdentity=this.currentFileIdentity();return db;
    }catch(e){try{db?.close();}catch{}this.database=null;this.fileIdentity=null;if(e instanceof ExecutionRenderEgressProofError)throw e;return fail("EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");}
  }
  private row(id:RenderEgressIdentity){
    return this.db().prepare("SELECT revision,status,payload_json,updated_at FROM render_egress_proof WHERE user_id=? AND account_id=? AND write_generation=?")
      .get(id.userId,id.accountId,id.writeCredentialGeneration) as {revision:number;status:string;payload_json:string;updated_at:string}|undefined;
  }
  read(id:RenderEgressIdentity):RenderEgressState{
    if(!validId(id))return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");try{
      const row=this.row(id);if(!row)return Object.freeze({revision:0,status:"unknown",renderServiceId:null,renderRegion:null,dedicatedIpv4s:Object.freeze([]),ipSetDigestSha256:null,
        observationCount:0,firstObservedIp:null,firstObservedAt:null,lastObservedIp:null,lastObservedAt:null,lastObservedCommit:null,lastObservedInstanceId:null,
        mexcAllowlistAttestation:null,allowlistedAt:null,revokedAt:null,updatedAt:null});
      if(!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<1||!["declared","observed","allowlisted","revoked"].includes(row.status)||!timestamp(row.updated_at)||row.payload_json.length>4096)
        return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
      let parsed:unknown;try{parsed=JSON.parse(row.payload_json);}catch{return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");}const p=validateStored(parsed);
      const derived:RenderEgressStatus=p.revokedAt?"revoked":p.mexcAllowlisted?"allowlisted":p.count>0?"observed":"declared";if(derived!==row.status)return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
      this.assertBacking();return Object.freeze({revision:Number(row.revision),status:derived,renderServiceId:p.serviceId,renderRegion:p.region,dedicatedIpv4s:Object.freeze([...p.ips]),
        ipSetDigestSha256:p.digest,observationCount:p.count,firstObservedIp:p.firstIp,firstObservedAt:p.firstAt,lastObservedIp:p.lastIp,lastObservedAt:p.lastAt,
        lastObservedCommit:p.lastCommit,lastObservedInstanceId:p.lastInstance,mexcAllowlistAttestation:p.mexcAllowlisted?MEXC_WRITE_EGRESS_ATTESTATION:null,
        allowlistedAt:p.allowlistedAt,revokedAt:p.revokedAt,updatedAt:row.updated_at});
    }catch(e){if(e instanceof ExecutionRenderEgressProofError)throw e;return fail("EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");}
  }
  private mutate(id:RenderEgressIdentity,expected:number,kind:"declared"|"observed"|"allowlisted"|"revoked",at:string,build:(p:Stored|null)=>Stored){
    if(!validId(id)||!timestamp(at)||!Number.isSafeInteger(expected)||expected<0)return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");const db=this.db();
    try{db.exec("BEGIN IMMEDIATE");const row=this.row(id), current=row?validateStored(JSON.parse(row.payload_json)):null, revision=row?Number(row.revision):0;
      if(revision!==expected||row&&Date.parse(at)<Date.parse(row.updated_at))return fail("EXECUTION_RENDER_EGRESS_PROOF_CONFLICT");
      const next=build(current), nextRev=expected+1, status=next.revokedAt?"revoked":next.mexcAllowlisted?"allowlisted":next.count>0?"observed":"declared";
      const payload=JSON.stringify(next);if(payload.length>4096)return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");let changes:number;
      if(row)changes=Number(db.prepare("UPDATE render_egress_proof SET revision=?,status=?,payload_json=?,updated_at=? WHERE user_id=? AND account_id=? AND write_generation=? AND revision=?")
        .run(nextRev,status,payload,at,id.userId,id.accountId,id.writeCredentialGeneration,expected).changes);
      else changes=Number(db.prepare("INSERT INTO render_egress_proof(schema_version,user_id,account_id,write_generation,revision,status,payload_json,updated_at) VALUES(1,?,?,?,?,?,?,?)")
        .run(id.userId,id.accountId,id.writeCredentialGeneration,nextRev,status,payload,at).changes);
      if(changes!==1)return fail("EXECUTION_RENDER_EGRESS_PROOF_CONFLICT");
      db.prepare("INSERT INTO render_egress_proof_events(user_id,account_id,write_generation,revision,kind,occurred_at) VALUES(?,?,?,?,?,?)")
        .run(id.userId,id.accountId,id.writeCredentialGeneration,nextRev,kind,at);db.exec("COMMIT");this.harden();this.assertBacking();return this.read(id);
    }catch(e){try{db.exec("ROLLBACK");}catch{}if(e instanceof ExecutionRenderEgressProofError)throw e;return fail("EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");}
  }
  declare(id:RenderEgressIdentity,serviceId:string,region:RenderRegion,ips:readonly string[],at:string,expected=0){
    const canonical=canonicalDedicatedIpv4s(ips),digest=renderDedicatedIpSetDigestSha256(ips);
    if(!SERVICE.test(serviceId)||!regions.has(region)||!canonical||!digest||expected!==0)return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
    return this.mutate(id,expected,"declared",at,p=>{if(p)return fail("EXECUTION_RENDER_EGRESS_PROOF_CONFLICT");return Object.freeze({serviceId,region,ips:canonical,digest,count:0,
      firstIp:null,firstAt:null,lastIp:null,lastAt:null,lastCommit:null,lastInstance:null,mexcAllowlisted:false,allowlistedAt:null,revokedAt:null});});
  }
  observe(id:RenderEgressIdentity,serviceId:string,ip:string,commit:string,instance:string,at:string,expected:number){
    if(!SERVICE.test(serviceId)||!isPublicIpv4(ip)||!COMMIT.test(commit)||!INSTANCE.test(instance))return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
    return this.mutate(id,expected,"observed",at,p=>{if(!p||p.revokedAt||p.serviceId!==serviceId||!p.ips.includes(ip))return fail("EXECUTION_RENDER_EGRESS_PROOF_CONFLICT");
      if(p.lastAt&&Date.parse(at)-Date.parse(p.lastAt)<RENDER_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS)return fail("EXECUTION_RENDER_EGRESS_PROOF_CONFLICT");
      return Object.freeze({...p,count:p.count+1,firstIp:p.firstIp??ip,firstAt:p.firstAt??at,lastIp:ip,lastAt:at,lastCommit:commit,lastInstance:instance});});
  }
  allowlist(id:RenderEgressIdentity,digest:string,at:string,expected:number){
    if(!SHA256.test(digest))return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
    return this.mutate(id,expected,"allowlisted",at,p=>{if(!p||p.revokedAt||p.mexcAllowlisted||p.count<2||p.digest!==digest||!p.lastAt)return fail("EXECUTION_RENDER_EGRESS_PROOF_CONFLICT");
      const age=Date.parse(at)-Date.parse(p.lastAt);if(age<0||age>RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS)return fail("EXECUTION_RENDER_EGRESS_PROOF_CONFLICT");
      return Object.freeze({...p,mexcAllowlisted:true,allowlistedAt:at});});
  }
  revoke(id:RenderEgressIdentity,at:string,expected:number){
    const current=this.read(id);if(current.revision!==expected||current.status==="unknown")return fail("EXECUTION_RENDER_EGRESS_PROOF_CONFLICT");if(current.status==="revoked")return current;
    return this.mutate(id,expected,"revoked",at,p=>{if(!p||p.revokedAt)return fail("EXECUTION_RENDER_EGRESS_PROOF_CONFLICT");return Object.freeze({...p,revokedAt:at});});
  }
  events(id:RenderEgressIdentity){if(!validId(id))return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");try{
    const rows=this.db().prepare("SELECT sequence,revision,kind,occurred_at FROM render_egress_proof_events WHERE user_id=? AND account_id=? AND write_generation=? ORDER BY sequence")
      .all(id.userId,id.accountId,id.writeCredentialGeneration) as Record<string,unknown>[];const out=rows.map(r=>{const kind=String(r.kind);
        if(!Number.isSafeInteger(Number(r.sequence))||!Number.isSafeInteger(Number(r.revision))||!["declared","observed","allowlisted","revoked"].includes(kind)||!timestamp(r.occurred_at))
          return fail("EXECUTION_RENDER_EGRESS_PROOF_INVALID");
        return Object.freeze({sequence:Number(r.sequence),revision:Number(r.revision),kind,occurredAt:String(r.occurred_at)});});this.assertBacking();return Object.freeze(out);
    }catch(e){if(e instanceof ExecutionRenderEgressProofError)throw e;return fail("EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");}}
  close(){try{this.database?.close();}finally{this.database=null;this.fileIdentity=null;}}
}

async function owner(target:string,p:OwnerRenderEgressProof,now:Date){
  if(!ID.test(target)||!SESSION.test(p.sessionToken)||p.currentPassword.length<1||p.currentPassword.length>128||!/^\d{6}$/.test(p.totp)||!Number.isFinite(now.getTime()))return false;
  const a=databaseSession(p.sessionToken);if(!a||a.id!==target||a.role!=="owner"||!await verifyAccountPassword(a.id,p.currentPassword))return false;
  const b=databaseSession(p.sessionToken);if(!b||b.id!==target||b.role!=="owner"||!verifyFreshTotp(b.id,p.totp,now.getTime()))return false;
  const c=databaseSession(p.sessionToken);return Boolean(c&&c.id===target&&c.role==="owner");
}
export function renderRuntimeEvidenceFromEnvironment(env:Readonly<Record<string,string|undefined>>=process.env):RenderRuntimeEvidence|null{
  const serviceId=env.RENDER_SERVICE_ID?.trim()??"",gitCommit=env.RENDER_GIT_COMMIT?.trim()??"",instanceId=env.RENDER_INSTANCE_ID?.trim()??"";
  if(env.RENDER!=="true"||env.IS_PULL_REQUEST!=="false"||env.RENDER_SERVICE_TYPE!=="web"||env.RENDER_GIT_REPO_SLUG!==REPO||env.RENDER_GIT_BRANCH!==BRANCH||
    env.NODE_ENV!=="production"||!SERVICE.test(serviceId)||!COMMIT.test(gitCommit)||!INSTANCE.test(instanceId))return null;
  return Object.freeze({serviceId,gitCommit,instanceId,serviceType:"web",repository:REPO,branch:BRANCH});
}
async function probe(fetchImpl:FetchLike,url:string){try{
  const r=await fetchImpl(url,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5_000),headers:{accept:"text/plain"}});
  if(!r.ok||r.status<200||r.status>=300)return null;const t=(await r.text()).trim();return isPublicIpv4(t)?t:null;
}catch{return null;}}
export async function probeProductionRenderEgressIpv4(fetchImpl:FetchLike=fetch as unknown as FetchLike){
  const a=await probe(fetchImpl,PROBES[0]);if(!a)return null;const b=await probe(fetchImpl,PROBES[1]);return b===a?a:null;
}

export async function declareRenderDedicatedEgress(store:SqliteRenderEgressProofStore,r:Mutation&Readonly<{renderServiceId:string;renderRegion:RenderRegion;dedicatedIpv4s:readonly string[];renderAttestation:typeof RENDER_DEDICATED_EGRESS_ATTESTATION}>,now=new Date()){
  if(!validMutation(r)||r.expectedRevision!==0||r.renderAttestation!==RENDER_DEDICATED_EGRESS_ATTESTATION||!await owner(r.userId,r.ownerProof,now))return null;
  return store.declare(identity(r),r.renderServiceId,r.renderRegion,r.dedicatedIpv4s,now.toISOString(),0);
}
export async function observeRenderDedicatedEgress(store:SqliteRenderEgressProofStore,r:Mutation,runtime:RenderRuntimeEvidence,observedIp:string,now=new Date()){
  if(!validMutation(r)||r.expectedRevision<1||runtime.repository!==REPO||runtime.branch!==BRANCH||runtime.serviceType!=="web"||
    !SERVICE.test(runtime.serviceId)||!COMMIT.test(runtime.gitCommit)||!INSTANCE.test(runtime.instanceId)||!await owner(r.userId,r.ownerProof,now))return null;
  const current=store.read(identity(r));if(current.revision!==r.expectedRevision||current.renderServiceId!==runtime.serviceId)return null;
  return store.observe(identity(r),runtime.serviceId,observedIp,runtime.gitCommit,runtime.instanceId,now.toISOString(),r.expectedRevision);
}
export async function observeProductionRenderDedicatedEgress(r:Mutation,store=new SqliteRenderEgressProofStore(),env:Readonly<Record<string,string|undefined>>=process.env,fetchImpl:FetchLike=fetch as unknown as FetchLike,now=new Date()){
  const runtime=renderRuntimeEvidenceFromEnvironment(env);if(!runtime)return null;const ip=await probeProductionRenderEgressIpv4(fetchImpl);if(!ip)return null;
  return observeRenderDedicatedEgress(store,r,runtime,ip,now);
}
export async function attestMexcEgressAllowlisted(store:SqliteRenderEgressProofStore,r:Mutation&Readonly<{ipSetDigestSha256:string;mexcAllowlistAttestation:typeof MEXC_WRITE_EGRESS_ATTESTATION}>,now=new Date()){
  if(!validMutation(r)||r.expectedRevision<1||!SHA256.test(r.ipSetDigestSha256)||r.mexcAllowlistAttestation!==MEXC_WRITE_EGRESS_ATTESTATION||!await owner(r.userId,r.ownerProof,now))return null;
  const s=store.read(identity(r)),age=s.lastObservedAt?now.getTime()-Date.parse(s.lastObservedAt):NaN;
  if(s.revision!==r.expectedRevision||s.status!=="observed"||s.observationCount<2||s.ipSetDigestSha256!==r.ipSetDigestSha256||!Number.isFinite(age)||age<0||age>RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS)return null;
  return store.allowlist(identity(r),r.ipSetDigestSha256,now.toISOString(),r.expectedRevision);
}
export async function revokeRenderEgressProof(store:SqliteRenderEgressProofStore,r:Mutation,now=new Date()){
  if(!validMutation(r)||r.expectedRevision<1||!await owner(r.userId,r.ownerProof,now))return null;return store.revoke(identity(r),now.toISOString(),r.expectedRevision);
}
