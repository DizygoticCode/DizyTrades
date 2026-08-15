import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { composeMexcPreWriteAuthority,type MexcPreWriteEvidence } from "./mexc-write-authority";

export const MEXC_EXECUTION_BASE_URL = "https://api.mexc.com" as const;
export const MEXC_ORDER_CREATE_PATH = "/api/v1/private/order/create" as const;
export const MEXC_EXTERNAL_ORDER_PATH = "/api/v1/private/order/external" as const;
/** The current Futures API expresses Recv-Window in seconds (maximum 60). */
export const MEXC_EXECUTION_RECV_WINDOW_SECONDS = 5;
export const MEXC_EXECUTION_TIMEOUT_MS = 8_000;

export type MexcExecutionCredentials = Readonly<{ accessKey: string; secretKey: string; generation: string }>;
/** Server-only, synchronous authority read performed in the writer slot. Keeping
 * this as a provider (rather than accepting snapshots in execute()) prevents a
 * queued invocation from carrying credentials or mutable authority across a wait. */
export type MexcPreTransportContext = Readonly<{
  credentials:MexcExecutionCredentials;
  environment:Readonly<Record<string,string|undefined>>;
  evidence:MexcPreWriteEvidence;
}>;
export type MexcPreTransportContextProvider = ()=>MexcPreTransportContext;
export type MexcExecutionIntent = Readonly<{
  userId:string; accountId:string; intentId:string; idempotencyKey:string; symbol:string;
  side:"long"|"short"; orderType:"limit"; positionMode:"one-way"; positionId:string;
  marginMode:"isolated"|"cross"; positionVolume:number; volume:number; price:number; referencePrice:number; estimatedNotional:number;
  leverage:number; reduceOnly:true; bindingGeneration:string; rolloutRevision:number;
  riskRevision:number; reconciliationRevision:number; writeCredentialGeneration:string;
}>;
export type MexcTransportRequest = Readonly<{url:string;method:"GET"|"POST";headers:Readonly<Record<string,string>>;body?:string;timeoutMs:number}>;
export type MexcTransportResponse = Readonly<{status:number;body:string}>;
export type MexcExecutionTransport = (request:MexcTransportRequest)=>Promise<MexcTransportResponse>;
export type MexcLifecycleState = "reserved"|"submitting"|"submitted"|"indeterminate"|"reconciled"|"quarantined";
export type MexcIntentEvidence = Readonly<{intentDigest:string;symbol:string;side:number;volume:number;positionId:string;positionMode:2;openType:1|2;bindingGeneration:string;writeCredentialGeneration:string;rolloutRevision:number;riskRevision:number;reconciliationRevision:number}>;
export type MexcLifecycleEvidence = Readonly<MexcIntentEvidence&{identityDigest:string;externalOid:string;state:MexcLifecycleState;attempt:number;orderId:string|null;errorClass:string|null;updatedAt:string}>;
export interface MexcExecutionLifecycleStore {
  read(identityDigest:string):MexcLifecycleEvidence|null;
  reserve(identityDigest:string,externalOid:string,intent:MexcIntentEvidence,at:string):MexcLifecycleEvidence;
  claim(identityDigest:string,at:string):MexcLifecycleEvidence|null;
  transition(identityDigest:string,expected:readonly MexcLifecycleState[],state:MexcLifecycleState,patch:Readonly<{orderId?:string|null;errorClass?:string|null}>,at:string):MexcLifecycleEvidence;
  quarantineAccount(userId:string,accountId:string,reason:string,at:string):void;
  isAccountQuarantined(userId:string,accountId:string):boolean;
}
export class MexcExecutionError extends Error { constructor(readonly kind:"configuration"|"validation"|"disabled"|"provider"|"indeterminate"|"quarantined"){super(`MEXC_EXECUTION_${kind.toUpperCase()}`);this.name="MexcExecutionError";} }

export function createMexcExecutionFetchTransport(fetchImplementation:typeof fetch=fetch):MexcExecutionTransport {
  return async request=>{
    if(!request.url.startsWith(`${MEXC_EXECUTION_BASE_URL}/`)||!Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<1||request.timeoutMs>MEXC_EXECUTION_TIMEOUT_MS)throw new MexcExecutionError("validation");
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),request.timeoutMs);
    try{
      const response=await fetchImplementation(request.url,{method:request.method,headers:request.headers,body:request.body,signal:controller.signal,redirect:"error",cache:"no-store"});
      if(!response.body)return Object.freeze({status:response.status,body:""});
      const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>64_000){await reader.cancel();throw new MexcExecutionError("provider");}chunks.push(value);}
      return Object.freeze({status:response.status,body:Buffer.concat(chunks).toString("utf8")});
    }finally{clearTimeout(timer);}
  };
}

const TOKEN=/^[A-Za-z0-9_-]{1,120}$/,SYMBOL=/^[A-Z0-9]{1,20}_USDT$/,ORDER_ID=/^[A-Za-z0-9_-]{1,64}$/,POSITION_ID=/^[1-9][0-9]{0,30}$/;
const CREDENTIAL=/^[\x21-\x7e]+$/;
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
export const mexcExecutionIdentityDigest=(intent:MexcExecutionIntent)=>sha(JSON.stringify([intent.userId,intent.accountId,intent.idempotencyKey]));
export const mexcExternalOid=(intent:MexcExecutionIntent)=>`dizy_${mexcExecutionIdentityDigest(intent).slice(0,27)}`;
/** DizyTrades `side` is order direction: long/buy closes a short, short/sell closes a long. */
const side=(intent:MexcExecutionIntent)=>intent.side==="long"?2:4;
const openType=(intent:MexcExecutionIntent):1|2=>intent.marginMode==="isolated"?1:2;
function canonicalBody(intent:MexcExecutionIntent,externalOid:string){return JSON.stringify({symbol:intent.symbol,price:intent.price,vol:intent.volume,side:side(intent),type:1,openType:openType(intent),leverage:intent.leverage,externalOid,positionId:intent.positionId,positionMode:2,reduceOnly:true});}
function intentEvidence(intent:MexcExecutionIntent,externalOid:string):MexcIntentEvidence {const body=canonicalBody(intent,externalOid);return Object.freeze({intentDigest:sha(body),symbol:intent.symbol,side:side(intent),volume:intent.volume,positionId:intent.positionId,positionMode:2,openType:openType(intent),bindingGeneration:intent.bindingGeneration,writeCredentialGeneration:intent.writeCredentialGeneration,rolloutRevision:intent.rolloutRevision,riskRevision:intent.riskRevision,reconciliationRevision:intent.reconciliationRevision});}
function sameEvidence(actual:MexcLifecycleEvidence,expected:MexcIntentEvidence,externalOid:string){return actual.externalOid===externalOid&&actual.intentDigest===expected.intentDigest&&actual.symbol===expected.symbol&&actual.side===expected.side&&actual.volume===expected.volume&&actual.positionId===expected.positionId&&actual.positionMode===expected.positionMode&&actual.openType===expected.openType&&actual.bindingGeneration===expected.bindingGeneration&&actual.writeCredentialGeneration===expected.writeCredentialGeneration&&actual.rolloutRevision===expected.rolloutRevision&&actual.riskRevision===expected.riskRevision&&actual.reconciliationRevision===expected.reconciliationRevision;}

export function readMexcExecutionCredentials(environment:Readonly<Record<string,string|undefined>>):MexcExecutionCredentials {
  const accessKey=environment.MEXC_EXECUTION_ACCESS_KEY,secretKey=environment.MEXC_EXECUTION_SECRET_KEY,generation=environment.MEXC_EXECUTION_CREDENTIAL_GENERATION;
  const exposed=Object.entries(environment).some(([key,value])=>/^(NEXT_PUBLIC_|PUBLIC_).*MEXC.*EXECUTION.*(KEY|SECRET|PRIVATE|CREDENTIAL|GENERATION)/i.test(key)&&Boolean(value));
  if(!accessKey||!secretKey||!generation||accessKey.length<16||secretKey.length<16||accessKey.length>256||secretKey.length>512||!CREDENTIAL.test(accessKey)||!CREDENTIAL.test(secretKey)||!TOKEN.test(generation)||exposed||accessKey===environment.OWNER_MEXC_READONLY_API_KEY||secretKey===environment.OWNER_MEXC_READONLY_API_SECRET)throw new MexcExecutionError("configuration");
  return Object.freeze({accessKey,secretKey,generation});
}
export function mexcWriterEnabled(environment:Readonly<Record<string,string|undefined>>){return environment.MEXC_WRITE_PROVIDER_ENABLED==="true"&&environment.LIVE_TRADING_ENABLED==="true";}
const AUTHORITY_KEYS=["callerAssured","ownerBound","ownershipFresh","reconciliationClean","riskEnabled","rolloutArmed","killSwitchesClear","airlockPrepared","networkAllowlisted"] as const;
export type MexcWriteAuthority = Readonly<Record<(typeof AUTHORITY_KEYS)[number],boolean>>;
export function assertMexcWriteAuthority(environment:Readonly<Record<string,string|undefined>>,authority:MexcWriteAuthority){
  if(!mexcWriterEnabled(environment)||!authority||typeof authority!=="object"||Object.keys(authority).length!==AUTHORITY_KEYS.length||!AUTHORITY_KEYS.every(key=>Object.hasOwn(authority,key)&&authority[key]===true))throw new MexcExecutionError("disabled");
}
function validateIntent(intent:MexcExecutionIntent){if(!TOKEN.test(intent.userId)||!TOKEN.test(intent.accountId)||!TOKEN.test(intent.intentId)||!TOKEN.test(intent.idempotencyKey)||!SYMBOL.test(intent.symbol)||intent.positionMode!=="one-way"||intent.orderType!=="limit"||!POSITION_ID.test(intent.positionId)||!['long','short'].includes(intent.side)||!['isolated','cross'].includes(intent.marginMode)||intent.reduceOnly!==true||!TOKEN.test(intent.bindingGeneration)||!TOKEN.test(intent.writeCredentialGeneration)||![intent.volume,intent.positionVolume,intent.price,intent.referencePrice,intent.estimatedNotional,intent.leverage].every(Number.isFinite)||intent.volume<=0||intent.volume>intent.positionVolume||intent.price<=0||intent.referencePrice<=0||intent.estimatedNotional<=0||intent.leverage<=0||![intent.rolloutRevision,intent.riskRevision,intent.reconciliationRevision].every(x=>Number.isSafeInteger(x)&&x>=0))throw new MexcExecutionError("validation");}
function validateContextCredentials(context:MexcPreTransportContext,intent:MexcExecutionIntent,requireIntentGeneration:boolean){
  if(!context||typeof context!=="object"||!context.credentials||!context.environment)throw new MexcExecutionError("validation");
  let credentials:MexcExecutionCredentials;
  try{
    credentials=readMexcExecutionCredentials(Object.freeze({
      ...context.environment,
      MEXC_EXECUTION_ACCESS_KEY:context.credentials.accessKey,
      MEXC_EXECUTION_SECRET_KEY:context.credentials.secretKey,
      MEXC_EXECUTION_CREDENTIAL_GENERATION:context.credentials.generation,
    }));
  }catch{throw new MexcExecutionError("validation");}
  if(requireIntentGeneration&&credentials.generation!==intent.writeCredentialGeneration)throw new MexcExecutionError("validation");
  return credentials;
}
function headers(credentials:MexcExecutionCredentials,time:string,target:string){return Object.freeze({"Content-Type":"application/json",ApiKey:credentials.accessKey,"Request-Time":time,"Recv-Window":String(MEXC_EXECUTION_RECV_WINDOW_SECONDS),Signature:createHmac("sha256",credentials.secretKey).update(credentials.accessKey+time+target).digest("hex")});}
function parseResponse(response:MexcTransportResponse):unknown {if(response.status<200||response.status>=300||Buffer.byteLength(response.body)>64_000)return null;try{const x=JSON.parse(response.body);return (x?.success===true||x?.code===0)?x?.data:null;}catch{return null;}}
function createOrderId(response:MexcTransportResponse):string|null {const data=parseResponse(response),id=typeof data==="object"&&data?Reflect.get(data,"orderId"):data;return typeof id==="string"&&ORDER_ID.test(id)?id:null;}
function reconciledOrder(response:MexcTransportResponse,e:MexcIntentEvidence,externalOid:string):string|null {const x=parseResponse(response) as Record<string,unknown>|null;if(!x||typeof x!=="object")return null;const id=x.orderId;return typeof id==="string"&&ORDER_ID.test(id)&&x.externalOid===externalOid&&x.symbol===e.symbol&&x.side===e.side&&x.vol===e.volume&&String(x.positionId)===e.positionId&&x.positionMode===e.positionMode&&x.openType===e.openType?id:null;}
function safeClass(error:unknown){return error instanceof Error&&error.name==="AbortError"?"timeout":"network";}

export class ModernMexcReduceOnlyWriter {
  private chain:Promise<unknown>=Promise.resolve();private lastStarted=0;
  constructor(private readonly transport:MexcExecutionTransport,private readonly store:MexcExecutionLifecycleStore,private readonly now=()=>Date.now(),private readonly minimumIntervalMs=250){}
  execute(intent:MexcExecutionIntent,contextProvider:MexcPreTransportContextProvider){const run=this.chain.then(()=>this.executeSerial(intent,contextProvider));this.chain=run.catch(()=>undefined);return run;}
  private async executeSerial(intent:MexcExecutionIntent,contextProvider:MexcPreTransportContextProvider):Promise<MexcLifecycleEvidence>{
    validateIntent(intent);
    const digest=mexcExecutionIdentityDigest(intent),externalOid=mexcExternalOid(intent),expected=intentEvidence(intent,externalOid);let evidence=this.store.read(digest);
    if(evidence&&!sameEvidence(evidence,expected,externalOid)){this.quarantine(intent,"authority-divergence");throw new MexcExecutionError("quarantined");}
    if(evidence?.state==="reconciled")return evidence;
    if(!evidence)evidence=this.store.reserve(digest,externalOid,expected,new Date(this.now()).toISOString());
    if(!sameEvidence(evidence,expected,externalOid)){this.quarantine(intent,"authority-divergence");throw new MexcExecutionError("quarantined");}
    // Potentially delivered lifecycle state must be reconciled even if write
    // authority, kill switches or credential generation changed after the POST.
    if(evidence.state!=="reserved"||evidence.attempt>0)return this.reconcile(intent,contextProvider,evidence);
    const delay=Math.max(0,this.minimumIntervalMs-(this.now()-this.lastStarted));if(delay)await new Promise(r=>setTimeout(r,delay));this.lastStarted=this.now();
    // This synchronous read is intentionally after every queue/rate-limit wait.
    // No async boundary is permitted between the final checks, claim, signing and
    // initiation of transport for a brand-new POST.
    const context=contextProvider();
    const credentials=validateContextCredentials(context,intent,true);
    assertMexcWriteAuthority(context.environment,composeMexcPreWriteAuthority(intent,context.evidence,this.now()));
    if(this.store.isAccountQuarantined(intent.userId,intent.accountId))throw new MexcExecutionError("quarantined");
    const claimed=this.store.claim(digest,new Date(this.now()).toISOString());
    if(!claimed)return this.reconcile(intent,contextProvider,this.store.read(digest)!);
    evidence=claimed;
    const body=canonicalBody(intent,externalOid),time=String(this.now());
    try{const response=await this.transport({url:MEXC_EXECUTION_BASE_URL+MEXC_ORDER_CREATE_PATH,method:"POST",headers:headers(credentials,time,body),body,timeoutMs:MEXC_EXECUTION_TIMEOUT_MS});const current=this.store.read(digest);if(current?.state==="reconciled")return current;const orderId=createOrderId(response);evidence=this.store.transition(digest,["submitting"],orderId?"submitted":"indeterminate",{orderId,errorClass:orderId?null:(response.status>=500?"provider-5xx":"invalid-response")},new Date(this.now()).toISOString());}
    catch(error){evidence=this.store.transition(digest,["submitting"],"indeterminate",{errorClass:safeClass(error)},new Date(this.now()).toISOString());}
    return this.reconcile(intent,contextProvider,evidence);
  }
  private async reconcile(intent:MexcExecutionIntent,contextProvider:MexcPreTransportContextProvider,evidence:MexcLifecycleEvidence){
    // Recovery is GET-only. It must remain available after emergency disablement,
    // quarantine or credential-generation rotation so ambiguous delivery can be
    // resolved without authorising another POST.
    const context=contextProvider();
    const credentials=validateContextCredentials(context,intent,false);
    const path=`${MEXC_EXTERNAL_ORDER_PATH}/${encodeURIComponent(intent.symbol)}/${encodeURIComponent(evidence.externalOid)}`,time=String(this.now());let response:MexcTransportResponse;
    try{response=await this.transport({url:MEXC_EXECUTION_BASE_URL+path,method:"GET",headers:headers(credentials,time,""),timeoutMs:MEXC_EXECUTION_TIMEOUT_MS});}catch{throw new MexcExecutionError("indeterminate");}
    const found=reconciledOrder(response,evidence,evidence.externalOid);if(!found){if(parseResponse(response)!==null){this.quarantine(intent,"order-intent-divergence");this.store.transition(evidence.identityDigest,[evidence.state],"quarantined",{errorClass:"order-intent-divergence"},new Date(this.now()).toISOString());throw new MexcExecutionError("quarantined");}throw new MexcExecutionError("indeterminate");}
    if(evidence.orderId&&evidence.orderId!==found){this.quarantine(intent,"order-id-divergence");this.store.transition(evidence.identityDigest,[evidence.state],"quarantined",{errorClass:"order-id-divergence"},new Date(this.now()).toISOString());throw new MexcExecutionError("quarantined");}
    return this.store.transition(evidence.identityDigest,["submitting","submitted","indeterminate","reserved"],"reconciled",{orderId:found,errorClass:null},new Date(this.now()).toISOString());
  }
  private quarantine(intent:MexcExecutionIntent,reason:string){this.store.quarantineAccount(intent.userId,intent.accountId,reason,new Date(this.now()).toISOString());}
}
export function exactAccountBindingMatches(expected:string,actual:string){const a=Buffer.from(expected),b=Buffer.from(actual);return a.length===b.length&&timingSafeEqual(a,b);}