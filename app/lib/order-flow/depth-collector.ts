import "server-only";
import { EventEmitter } from "node:events";
import { parseRawMexcDepthLevels } from "./mexc-depth.ts";
import type { DepthSnapshot } from "./types.ts";

const REST_BASE=(process.env.MEXC_FUTURES_REST_BASE_URL??"https://api.mexc.com").replace(/\/$/,"");
export const DEPTH_STALE_MS=5_000;
const POLL_MS=1_000,TIMEOUT_MS=5_000,HISTORY_MS=30*60_000,MAX_HISTORY=1_800;
const symbolPattern=/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
export function normalizeDepthSymbol(value:string){const symbol=value.trim().toUpperCase().replace(/[-/]/g,"_");return symbolPattern.test(symbol)?symbol:null;}

type Fetcher=typeof fetch;
export type CollectorDiagnostic={symbol:string;running:boolean;lastSuccessfulSnapshot:number|null;snapshotAgeMs:number|null;lastVersion:number|null;bids:number;asks:number;consecutiveFailures:number;lastError:string|null;subscribers:number};
const safeError=(error:unknown)=>error instanceof Error?error.message.slice(0,180):"Public depth request failed";
export function normalizeMexcSnapshot(raw:unknown,symbol:string):DepthSnapshot{
 const root=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null,data=root?.data&&typeof root.data==="object"&&!Array.isArray(root.data)?root.data as Record<string,unknown>:null;
 if(!root||root.success!==true||!(root.code===0||root.code==="0"||root.code==null)||!data)throw Error("Invalid MEXC depth envelope");
 const version=Number(data.version),engineTimeMs=Number(data.timestamp);if(!Number.isInteger(version)||version<0||!Number.isFinite(engineTimeMs)||engineTimeMs<=0)throw Error("Invalid MEXC depth version or timestamp");
 const bids=parseRawMexcDepthLevels(data.bids),asks=parseRawMexcDepthLevels(data.asks);if(!Array.isArray(data.bids)||!Array.isArray(data.asks)||!bids.length||!asks.length||bids.length!==data.bids.length||asks.length!==data.asks.length)throw Error("Invalid MEXC depth levels");
 return {symbol,version,engineTimeMs,bids:bids.sort((a,b)=>b.price-a.price),asks:asks.sort((a,b)=>a.price-b.price)};
}

export class DepthCollector{
 private timer:ReturnType<typeof setTimeout>|null=null;private inFlight=false;private failures=0;private error:string|null=null;private latest:DepthSnapshot|null=null;private lastSuccessAt:number|null=null;private history:{snapshot:DepthSnapshot;receivedAt:number}[]=[];private emitter=new EventEmitter();private running=false;private connectionState="stopped";
 readonly symbol:string;private fetcher:Fetcher;private now:()=>number;
 constructor(symbol:string,fetcher:Fetcher=fetch,now=()=>Date.now()){this.symbol=symbol;this.fetcher=fetcher;this.now=now;}
 private transition(state:string){if(state===this.connectionState)return;this.connectionState=state;const detail={symbol:this.symbol,state};if(state==="live")console.info("DizyFlow depth collector state",detail);else console.warn("DizyFlow depth collector state",detail);}
 start(){if(this.running)return;this.running=true;this.transition("connecting");void this.poll();}
 stop(){this.running=false;if(this.timer)clearTimeout(this.timer);this.timer=null;}
 async poll(){if(this.inFlight)return false;this.inFlight=true;let delay=POLL_MS;try{const response=await this.fetcher(`${REST_BASE}/api/v1/contract/depth/${encodeURIComponent(this.symbol)}?limit=100`,{cache:"no-store",signal:AbortSignal.timeout(TIMEOUT_MS),headers:{accept:"application/json"}});if(!response.ok)throw Error(`MEXC depth HTTP ${response.status}`);const snapshot=normalizeMexcSnapshot(await response.json(),this.symbol),receivedAt=this.now();this.latest=snapshot;this.lastSuccessAt=receivedAt;this.failures=0;this.error=null;this.transition("live");this.history.push({snapshot,receivedAt});const cutoff=receivedAt-HISTORY_MS;while(this.history.length>MAX_HISTORY||this.history[0]?.receivedAt<cutoff)this.history.shift();this.emitter.emit("snapshot",snapshot);}catch(error){this.failures++;this.error=safeError(error);this.transition(this.latest?"degraded":"error");delay=Math.min(30_000,POLL_MS*2**Math.min(this.failures,5));}finally{this.inFlight=false;if(this.running)this.timer=setTimeout(()=>void this.poll(),delay);}return true;}
 getLatest(){return this.latest;}
 getHistory(){return this.history.map(value=>value.snapshot);}
 subscribe(listener:(snapshot:DepthSnapshot)=>void){this.emitter.on("snapshot",listener);return()=>this.emitter.off("snapshot",listener);}
 diagnostic():CollectorDiagnostic{return{symbol:this.symbol,running:this.running,lastSuccessfulSnapshot:this.lastSuccessAt,snapshotAgeMs:this.lastSuccessAt===null?null:Math.max(0,this.now()-this.lastSuccessAt),lastVersion:this.latest?.version??null,bids:this.latest?.bids.length??0,asks:this.latest?.asks.length??0,consecutiveFailures:this.failures,lastError:this.error,subscribers:this.emitter.listenerCount("snapshot")};}
}
const collectors=new Map<string,DepthCollector>();
export function getDepthCollector(symbol:string){let value=collectors.get(symbol);if(!value){value=new DepthCollector(symbol);collectors.set(symbol,value);}value.start();return value;}
