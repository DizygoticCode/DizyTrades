import {appendFile, mkdir, readdir, readFile, rm, stat} from "node:fs/promises";
import path from "node:path";
import {EventEmitter} from "node:events";
import type {DepthSnapshot} from "./types.ts";

const int=(name:string,fallback:number,min:number,max:number)=>Math.min(max,Math.max(min,Math.floor(Number(process.env[name])||fallback)));
export const HEATMAP_RETENTION_MINUTES=int("DIZYFLOW_HEATMAP_RETENTION_MINUTES",360,5,24*60);
export const HEATMAP_SAMPLE_MS=int("DIZYFLOW_HEATMAP_SAMPLE_MS",5_000,1_000,60_000);
export const HEATMAP_MAX_MEMORY_RECORDS=int("DIZYFLOW_HEATMAP_MAX_MEMORY_RECORDS",20_000,500,100_000);
export const HEATMAP_MAX_DISK_MB=int("DIZYFLOW_HEATMAP_MAX_DISK_MB",64,4,512);
const CHECKPOINT_MS=int("DIZYFLOW_HEATMAP_CHECKPOINT_MINUTES",15,1,60)*60_000;
const ROTATE_BYTES=int("DIZYFLOW_HEATMAP_ROTATE_MB",4,1,16)*1_048_576;
const FLUSH_MS=int("DIZYFLOW_HEATMAP_FLUSH_MS",5_000,1_000,30_000),MAX_BATCH=1_000;
export type CompactLiquidityChange={timestampMs:number;priceTick:number;bidContracts:number;askContracts:number};
type DiskBatch={kind:"changes"|"checkpoint";symbol:string;priceStep:number;at:number;records:CompactLiquidityChange[]};
export type LiquidityCoverage={captureStartMs:number|null;captureEndMs:number|null;archiveStartMs:number|null;archiveEndMs:number|null;hasGaps:boolean;historyGapCount:number};
const safeSymbol=(value:string)=>value.replace(/[^A-Z0-9_]/g,"_");
const dataRoot=()=>path.join(process.env.DATA_DIR||path.join(process.cwd(),"data"),"dizyflow","heatmap");

/** A fixed-capacity sparse transition tape. It owns no full depth envelopes. */
export class LiquidityTape{
 private ring=new Array<CompactLiquidityChange|undefined>(HEATMAP_MAX_MEMORY_RECORDS);private head=0;private count=0;
 private state=new Map<number,{bid:number;ask:number}>();private emitter=new EventEmitter();private pending:CompactLiquidityChange[]=[];
 private timer:ReturnType<typeof setTimeout>|null=null;private initialized=false;private initializing:Promise<void>|null=null;private flushing:Promise<void>|null=null;private lastCheckpoint=0;
 private priceStep=0;private captureStart:number|null=null;private captureEnd:number|null=null;private archiveStart:number|null=null;private archiveEnd:number|null=null;
 private gaps=0;private dropped=0;private checkpoints=0;private bytes=0;private file="";private fileBytes=0;
 readonly symbol:string;private root:string;
 constructor(symbol:string,root=dataRoot()){this.symbol=symbol;this.root=root}
 private push(record:CompactLiquidityChange){const at=(this.head+this.count)%this.ring.length;if(this.count<this.ring.length){this.ring[at]=record;this.count++}else{this.ring[this.head]=record;this.head=(this.head+1)%this.ring.length;this.dropped++}}
 records(fromMs=-Infinity){const out:CompactLiquidityChange[]=[];for(let i=0;i<this.count;i++){const v=this.ring[(this.head+i)%this.ring.length];if(v&&v.timestampMs>=fromMs)out.push(v)}return out}
 getPriceStep(){return this.priceStep||Number(process.env.DIZYFLOW_DEFAULT_PRICE_STEP)||.1}
 private inferStep(snapshot:DepthSnapshot){const prices=[...snapshot.bids,...snapshot.asks].map(v=>v.price).sort((a,b)=>a-b);let step=Infinity;for(let i=1;i<prices.length;i++){const d=prices[i]-prices[i-1];if(d>1e-12)step=Math.min(step,d)}if(!Number.isFinite(step))step=Number(process.env.DIZYFLOW_DEFAULT_PRICE_STEP)||.1;return Math.max(1e-8,Number(step.toPrecision(10)))}
 async initialize(){if(this.initialized)return;if(this.initializing)return this.initializing;this.initializing=this.loadRecent().finally(()=>{this.initialized=true;this.initializing=null});return this.initializing}
 capture(snapshot:DepthSnapshot,timestampMs:number){if(!Number.isFinite(timestampMs)||timestampMs<=0||this.captureEnd!==null&&timestampMs-this.captureEnd<HEATMAP_SAMPLE_MS)return[];this.priceStep||=this.inferStep(snapshot);const next=new Map<number,{bid:number;ask:number}>();for(const [side,levels] of [["bid",snapshot.bids],["ask",snapshot.asks]] as const)for(const level of levels){const tick=Math.round(level.price/this.priceStep),v=next.get(tick)??{bid:0,ask:0};v[side]+=level.contractQuantity;next.set(tick,v)}
  const changed:CompactLiquidityChange[]=[];for(const tick of new Set([...this.state.keys(),...next.keys()])){const old=this.state.get(tick)??{bid:0,ask:0},value=next.get(tick)??{bid:0,ask:0};if(old.bid!==value.bid||old.ask!==value.ask)changed.push({timestampMs,priceTick:tick,bidContracts:value.bid,askContracts:value.ask})}
  changed.sort((a,b)=>a.priceTick-b.priceTick);for(const record of changed)this.push(record);this.state=next;this.captureStart??=timestampMs;if(this.captureEnd&&timestampMs-this.captureEnd>HEATMAP_SAMPLE_MS*3)this.gaps++;this.captureEnd=timestampMs;this.archiveStart??=timestampMs;this.archiveEnd=timestampMs;this.pending.push(...changed);this.prune(timestampMs);if(changed.length){this.emitter.emit("changes",changed);this.scheduleFlush()}return changed}
 private prune(now:number){const cutoff=now-HEATMAP_RETENTION_MINUTES*60_000;while(this.count&&(this.ring[this.head]?.timestampMs??Infinity)<cutoff){this.ring[this.head]=undefined;this.head=(this.head+1)%this.ring.length;this.count--;this.dropped++}}
 private scheduleFlush(){if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;void this.flush()},this.pending.length>=MAX_BATCH?0:FLUSH_MS)}
 async flush(){if(this.flushing)return this.flushing;this.flushing=this.flushBatch();try{await this.flushing}finally{this.flushing=null}}
 private async flushBatch(){if(this.timer){clearTimeout(this.timer);this.timer=null}if(!this.pending.length)return;await this.initialize();const records=this.pending.splice(0,MAX_BATCH);const checkpoint=!this.lastCheckpoint||records.at(-1)!.timestampMs-this.lastCheckpoint>=CHECKPOINT_MS;const batch:DiskBatch={kind:"changes",symbol:this.symbol,priceStep:this.priceStep,at:records.at(-1)!.timestampMs,records};await this.append(batch);if(checkpoint){const saved:DiskBatch={kind:"checkpoint",symbol:this.symbol,priceStep:this.priceStep,at:batch.at,records:[...this.state].map(([priceTick,v])=>({timestampMs:batch.at,priceTick,bidContracts:v.bid,askContracts:v.ask}))};this.lastCheckpoint=batch.at;this.checkpoints++;await this.append(saved)}if(this.pending.length)this.scheduleFlush()}
 private async append(batch:DiskBatch){const dir=path.join(this.root,safeSymbol(this.symbol));await mkdir(dir,{recursive:true});if(!this.file||this.fileBytes>=ROTATE_BYTES){this.file=path.join(dir,`${String(batch.at).padStart(13,"0")}.ndjson`);this.fileBytes=0}const line=JSON.stringify(batch)+"\n";await appendFile(this.file,line);this.fileBytes+=Buffer.byteLength(line);this.bytes+=Buffer.byteLength(line);await this.enforceDisk(dir,batch.at)}
 private async files(dir:string){const names=(await readdir(dir).catch(()=>[])).filter(v=>v.endsWith(".ndjson")).sort();return Promise.all(names.map(async name=>{const file=path.join(dir,name);return{file,name,size:(await stat(file)).size,at:Number.parseInt(name,10)||0}}))}
 private async enforceDisk(dir:string,now:number){let files=await this.files(dir),total=files.reduce((n,v)=>n+v.size,0);const cutoff=now-HEATMAP_RETENTION_MINUTES*60_000,max=HEATMAP_MAX_DISK_MB*1_048_576;for(const entry of files){if(files.length<=1)break;if(entry.at>=cutoff&&total<=max)break;await rm(entry.file,{force:true});total-=entry.size;files=files.slice(1)}this.bytes=total}
 private async loadRecent(){const dir=path.join(this.root,safeSymbol(this.symbol)),files=await this.files(dir);this.bytes=files.reduce((n,v)=>n+v.size,0);const cutoff=Date.now()-HEATMAP_RETENTION_MINUTES*60_000;for(const entry of files.filter(v=>v.at>=cutoff-CHECKPOINT_MS).slice(-8)){const content=await readFile(entry.file,"utf8").catch(()=>"");for(const line of content.split("\n")){if(!line)continue;let batch:DiskBatch;try{batch=JSON.parse(line)}catch{this.gaps++;continue}if(batch.symbol!==this.symbol||!Array.isArray(batch.records))continue;this.priceStep=batch.priceStep||this.priceStep;if(batch.kind==="checkpoint"){this.state.clear();this.checkpoints++}for(const record of batch.records){if(!Number.isFinite(record.timestampMs)||record.timestampMs<cutoff)continue;this.push(record);this.state.set(record.priceTick,{bid:record.bidContracts,ask:record.askContracts});this.archiveStart=this.archiveStart===null?record.timestampMs:Math.min(this.archiveStart,record.timestampMs);this.archiveEnd=Math.max(this.archiveEnd??0,record.timestampMs)}}}this.file=files.at(-1)?.file??"";this.fileBytes=files.at(-1)?.size??0}
 subscribe(listener:(changes:CompactLiquidityChange[])=>void){this.emitter.on("changes",listener);return()=>this.emitter.off("changes",listener)}
 coverage():LiquidityCoverage{return{captureStartMs:this.captureStart,captureEndMs:this.captureEnd,archiveStartMs:this.archiveStart,archiveEndMs:this.archiveEnd,hasGaps:this.gaps>0,historyGapCount:this.gaps}}
 diagnostic(){return{archiveFirstTimestamp:this.archiveStart,archiveLastTimestamp:this.archiveEnd,coverageDurationMs:this.archiveStart&&this.archiveEnd?this.archiveEnd-this.archiveStart:0,compactRecordsInMemory:this.count,archiveBytesOnDisk:this.bytes,checkpointCount:this.checkpoints,droppedPrunedRecordCount:this.dropped,historyGapCount:this.gaps}}
 async close(){if(this.timer){clearTimeout(this.timer);this.timer=null}if(this.flushing)await this.flushing;while(this.pending.length)await this.flush();if(this.timer){clearTimeout(this.timer);this.timer=null}this.emitter.removeAllListeners()}
}
const tapes=new Map<string,LiquidityTape>();
export function getLiquidityTape(symbol:string){let tape=tapes.get(symbol);if(!tape){tape=new LiquidityTape(symbol);tapes.set(symbol,tape);void tape.initialize()}return tape}
export const liquidityTapeDiagnostics=()=>[...tapes.values()].map(v=>({symbol:v.symbol,...v.diagnostic()}));
