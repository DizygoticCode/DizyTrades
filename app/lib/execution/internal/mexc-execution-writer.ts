import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MEXC_EXECUTION_BASE_URL = "https://api.mexc.com" as const;
export const MEXC_ORDER_CREATE_PATH = "/api/v1/private/order/create" as const;
export const MEXC_EXTERNAL_ORDER_PATH = "/api/v1/private/order/external" as const;
export const MEXC_EXECUTION_RECV_WINDOW_MS = 5_000;
export const MEXC_EXECUTION_TIMEOUT_MS = 8_000;

export type MexcExecutionCredentials = Readonly<{ accessKey: string; secretKey: string; generation: string }>;
export type MexcExecutionIntent = Readonly<{
  userId: string; accountId: string; idempotencyKey: string; symbol: string;
  positionSide: "long" | "short"; positionMode: "hedge"; marginMode: "isolated" | "cross";
  positionVolume: number; volume: number; price: number; leverage: number; reduceOnly: true;
  bindingGeneration: string; rolloutRevision: number; riskRevision: number; reconciliationRevision: number;
}>;
export type MexcTransportRequest = Readonly<{ url: string; method: "GET" | "POST"; headers: Readonly<Record<string,string>>; body?: string; timeoutMs: number }>;
export type MexcTransportResponse = Readonly<{ status: number; body: string }>;
export type MexcExecutionTransport = (request: MexcTransportRequest) => Promise<MexcTransportResponse>;
export type MexcLifecycleState = "reserved" | "submitted" | "indeterminate" | "reconciled" | "quarantined";
export type MexcLifecycleEvidence = Readonly<{ identityDigest:string; externalOid:string; state:MexcLifecycleState; attempt:number; orderId:string|null; errorClass:string|null; updatedAt:string }>;
export interface MexcExecutionLifecycleStore {
  read(identityDigest:string):MexcLifecycleEvidence|null;
  reserve(identityDigest:string, externalOid:string, at:string):MexcLifecycleEvidence;
  transition(identityDigest:string, expected:readonly MexcLifecycleState[], state:MexcLifecycleState, patch:Readonly<{orderId?:string|null;errorClass?:string|null}>, at:string):MexcLifecycleEvidence;
  quarantineAccount(userId:string,accountId:string,reason:string,at:string):void;
  isAccountQuarantined(userId:string,accountId:string):boolean;
}

export class MexcExecutionError extends Error {
  constructor(readonly kind:"configuration"|"validation"|"disabled"|"provider"|"indeterminate"|"quarantined") { super(`MEXC_EXECUTION_${kind.toUpperCase()}`); this.name="MexcExecutionError"; }
}

/** Real server transport. Production composition must call the authority gate
 * before constructing it; deterministic tests inject a fake instead. */
export function createMexcExecutionFetchTransport(fetchImplementation:typeof fetch=fetch):MexcExecutionTransport {
  return async request=>{
    if(!request.url.startsWith(`${MEXC_EXECUTION_BASE_URL}/`)||!Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<1||request.timeoutMs>MEXC_EXECUTION_TIMEOUT_MS)throw new MexcExecutionError("validation");
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),request.timeoutMs);
    try{
      const response=await fetchImplementation(request.url,{method:request.method,headers:request.headers,body:request.body,signal:controller.signal,redirect:"error",cache:"no-store"});
      const body=await response.text();if(Buffer.byteLength(body)>64_000)throw new MexcExecutionError("provider");
      return Object.freeze({status:response.status,body});
    }finally{clearTimeout(timer);}
  };
}

const TOKEN=/^[A-Za-z0-9_-]{1,120}$/;
const SYMBOL=/^[A-Z0-9]{1,20}_USDT$/;
const ORDER_ID=/^[A-Za-z0-9_-]{1,64}$/;
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
export const mexcExecutionIdentityDigest=(intent:MexcExecutionIntent)=>sha(JSON.stringify([intent.userId,intent.accountId,intent.idempotencyKey,intent.bindingGeneration]));
export const mexcExternalOid=(intent:MexcExecutionIntent)=>`dizy_${mexcExecutionIdentityDigest(intent).slice(0,27)}`;

export function readMexcExecutionCredentials(environment:Readonly<Record<string,string|undefined>>):MexcExecutionCredentials {
  const accessKey=environment.MEXC_EXECUTION_ACCESS_KEY,secretKey=environment.MEXC_EXECUTION_SECRET_KEY,generation=environment.MEXC_EXECUTION_CREDENTIAL_GENERATION;
  if(!accessKey||!secretKey||!generation||accessKey.length>256||secretKey.length>512||!TOKEN.test(generation)||accessKey===environment.OWNER_MEXC_READONLY_API_KEY||secretKey===environment.OWNER_MEXC_READONLY_API_SECRET)throw new MexcExecutionError("configuration");
  return Object.freeze({accessKey,secretKey,generation});
}
export function mexcWriterEnabled(environment:Readonly<Record<string,string|undefined>>){
  return environment.MEXC_WRITE_PROVIDER_ENABLED==="true"&&environment.LIVE_TRADING_ENABLED==="true";
}
export type MexcWriteAuthority = Readonly<{callerAssured:boolean;ownerBound:boolean;ownershipFresh:boolean;reconciliationClean:boolean;riskEnabled:boolean;rolloutArmed:boolean;killSwitchesClear:boolean;networkAllowlisted:boolean}>;
export function assertMexcWriteAuthority(environment:Readonly<Record<string,string|undefined>>, authority:MexcWriteAuthority){
  if(!mexcWriterEnabled(environment)||!Object.values(authority).every(value=>value===true))throw new MexcExecutionError("disabled");
}
function validate(intent:MexcExecutionIntent,credentials:MexcExecutionCredentials){
  if(!TOKEN.test(intent.userId)||!TOKEN.test(intent.accountId)||!TOKEN.test(intent.idempotencyKey)||!SYMBOL.test(intent.symbol)||intent.positionMode!=="hedge"||!["long","short"].includes(intent.positionSide)||!["isolated","cross"].includes(intent.marginMode)||intent.reduceOnly!==true||credentials.generation!==intent.bindingGeneration||![intent.volume,intent.positionVolume,intent.price,intent.leverage].every(Number.isFinite)||intent.volume<=0||intent.volume>intent.positionVolume||intent.price<=0||intent.leverage<=0||!Number.isSafeInteger(intent.rolloutRevision)||!Number.isSafeInteger(intent.riskRevision)||!Number.isSafeInteger(intent.reconciliationRevision))throw new MexcExecutionError("validation");
}
function canonicalBody(intent:MexcExecutionIntent,externalOid:string){
  return JSON.stringify({symbol:intent.symbol,price:intent.price,vol:intent.volume,side:intent.positionSide==="long"?2:1,type:1,openType:intent.marginMode==="isolated"?1:2,leverage:intent.leverage,externalOid,reduceOnly:true});
}
function headers(credentials:MexcExecutionCredentials,time:string,target:string){return Object.freeze({"Content-Type":"application/json",ApiKey:credentials.accessKey,"Request-Time":time,"Recv-Window":String(MEXC_EXECUTION_RECV_WINDOW_MS),Signature:createHmac("sha256",credentials.secretKey).update(credentials.accessKey+time+target).digest("hex")});}
function parseOrderId(response:MexcTransportResponse):string|null { if(response.status<200||response.status>=300||Buffer.byteLength(response.body)>64_000)return null; try{const x=JSON.parse(response.body),id=x?.data?.orderId??x?.data;return (x?.success===true||x?.code===0)&&typeof id==="string"&&ORDER_ID.test(id)?id:null;}catch{return null;} }
function safeClass(error:unknown){if(error instanceof Error&&error.name==="AbortError")return "timeout";return "network";}

export class ModernMexcReduceOnlyWriter {
  private chain:Promise<unknown>=Promise.resolve(); private lastStarted=0;
  constructor(private readonly transport:MexcExecutionTransport,private readonly store:MexcExecutionLifecycleStore,private readonly now=()=>Date.now(),private readonly minimumIntervalMs=250){}
  execute(intent:MexcExecutionIntent,credentials:MexcExecutionCredentials){const run=this.chain.then(()=>this.executeSerial(intent,credentials));this.chain=run.catch(()=>undefined);return run;}
  private async executeSerial(intent:MexcExecutionIntent,credentials:MexcExecutionCredentials):Promise<MexcLifecycleEvidence>{
    validate(intent,credentials); if(this.store.isAccountQuarantined(intent.userId,intent.accountId))throw new MexcExecutionError("quarantined");
    const digest=mexcExecutionIdentityDigest(intent),externalOid=mexcExternalOid(intent); let evidence=this.store.read(digest);
    if(evidence&&evidence.externalOid!==externalOid){this.quarantine(intent,"idempotency-divergence");throw new MexcExecutionError("quarantined");}
    if(evidence?.state==="reconciled")return evidence;
    if(!evidence)evidence=this.store.reserve(digest,externalOid,new Date(this.now()).toISOString());
    if(evidence.state==="submitted"||evidence.state==="indeterminate"||evidence.attempt>0)return this.reconcile(intent,credentials,evidence);
    const delay=Math.max(0,this.minimumIntervalMs-(this.now()-this.lastStarted));if(delay)await new Promise(r=>setTimeout(r,delay));this.lastStarted=this.now();
    const body=canonicalBody(intent,externalOid),time=String(this.now());
    try{
      const response=await this.transport({url:MEXC_EXECUTION_BASE_URL+MEXC_ORDER_CREATE_PATH,method:"POST",headers:headers(credentials,time,body),body,timeoutMs:MEXC_EXECUTION_TIMEOUT_MS});
      const orderId=parseOrderId(response); evidence=this.store.transition(digest,["reserved"],orderId?"submitted":"indeterminate",{orderId,errorClass:orderId?null:(response.status>=500?"provider-5xx":"invalid-response")},new Date(this.now()).toISOString());
    }catch(error){evidence=this.store.transition(digest,["reserved"],"indeterminate",{errorClass:safeClass(error)},new Date(this.now()).toISOString());}
    return this.reconcile(intent,credentials,evidence);
  }
  private async reconcile(intent:MexcExecutionIntent,credentials:MexcExecutionCredentials,evidence:MexcLifecycleEvidence){
    const path=`${MEXC_EXTERNAL_ORDER_PATH}/${encodeURIComponent(intent.symbol)}/${encodeURIComponent(evidence.externalOid)}`,time=String(this.now()),query="";
    let response:MexcTransportResponse;try{response=await this.transport({url:MEXC_EXECUTION_BASE_URL+path,method:"GET",headers:headers(credentials,time,query),timeoutMs:MEXC_EXECUTION_TIMEOUT_MS});}catch{throw new MexcExecutionError("indeterminate");}
    const found=parseOrderId(response);if(!found)throw new MexcExecutionError("indeterminate");
    if(evidence.orderId&&evidence.orderId!==found){this.quarantine(intent,"order-id-divergence");this.store.transition(evidence.identityDigest,[evidence.state],"quarantined",{errorClass:"order-id-divergence"},new Date(this.now()).toISOString());throw new MexcExecutionError("quarantined");}
    return this.store.transition(evidence.identityDigest,["submitted","indeterminate","reserved"],"reconciled",{orderId:found,errorClass:null},new Date(this.now()).toISOString());
  }
  private quarantine(intent:MexcExecutionIntent,reason:string){this.store.quarantineAccount(intent.userId,intent.accountId,reason,new Date(this.now()).toISOString());}
}

/** Constant-time helper used by activation composition to bind an independently loaded account digest. */
export function exactAccountBindingMatches(expected:string,actual:string){const a=Buffer.from(expected),b=Buffer.from(actual);return a.length===b.length&&timingSafeEqual(a,b);}
