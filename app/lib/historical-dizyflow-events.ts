import type { DizyFlowIntelligenceSnapshot } from "./order-flow/intelligence";
import { createHistoricalFlowEvent } from "./historical-dizyflow-event";
import type { HistoricalDizyFlowEvent, HistoricalDizyFlowEventType } from "./historical-dizyflow";

type EventInput=Omit<HistoricalDizyFlowEvent,"id">;
const finding=(snapshot:DizyFlowIntelligenceSnapshot,category:string,side:"bid"|"ask"|null,price:number|null)=>snapshot.findings.find(item=>item.category===category&&(!side||item.code.includes(side.toUpperCase()))&&(price===null||item.code.endsWith(String(price))))?.code??null;
const logicalKey=(event:EventInput)=>[event.type,event.side??"none",event.price??"none",event.sourceFindingCode??"none"].join("|");

/** Adapts only typed PR #117 output; no DOM, book-level or trade-tape parsing occurs here. */
export class HistoricalDizyFlowEventAdapter {
  private identity:string|null=null;private previous:DizyFlowIntelligenceSnapshot|null=null;private priorKeys=new Set<string>();
  adapt(snapshot:DizyFlowIntelligenceSnapshot):readonly HistoricalDizyFlowEvent[]{const identity=`${snapshot.marketKey}|${snapshot.symbol}|${snapshot.marketType}|${snapshot.referencePriceSource}`,discontinuity=this.identity!==null&&this.identity!==identity;if(discontinuity){this.previous=null;this.priorKeys.clear()}this.identity=identity;const inputs:EventInput[]=[];const add=(type:HistoricalDizyFlowEventType,side:"bid"|"ask"|null,price:number|null,sourceFindingCode:string|null,confidence=snapshot.intelligenceConfidence)=>inputs.push({timeMs:snapshot.receivedTimeMs,type,side,price,sourceFindingCode,inputHash:snapshot.inputHash,confidence});
    for(const wall of snapshot.walls.candidates)add(wall.status==="new"?"visible-wall-appeared":wall.status==="persisted"?"visible-wall-persisted":wall.status==="grown"?"visible-wall-grown":"visible-wall-reduced",wall.side,wall.price,finding(snapshot,"wall",wall.side,wall.price),wall.confidence);
    for(const wall of snapshot.walls.withdrawals)add("visible-wall-withdrawn",wall.side,wall.price,finding(snapshot,"withdrawal",wall.side,wall.price));
    for(const candidate of snapshot.walls.replenishment)add("visible-replenishment-candidate",candidate.side,candidate.price,finding(snapshot,"replenishment",candidate.side,candidate.price));
    for(const candidate of snapshot.sweeps.candidates)add("visible-sweep-candidate",candidate.direction==="upward-ask"?"ask":"bid",null,finding(snapshot,"sweep",null,null));
    for(const candidate of snapshot.absorption.candidates)add("possible-absorption-candidate",candidate.side,candidate.price,finding(snapshot,"absorption",candidate.side,candidate.price));
    const previousUnhealthy=this.previous&&(!this.previous.feedQuality.connected||this.previous.feedQuality.stale||this.previous.feedQuality.sequenceContinuous===false),gap=discontinuity||!snapshot.feedQuality.connected||snapshot.feedQuality.sequenceContinuous===false||(this.previous!==null&&snapshot.receivedTimeMs-this.previous.receivedTimeMs>5_000);if(gap)add("feed-gap",null,null,null);if(snapshot.feedQuality.stale&&this.previous?.feedQuality.stale!==true)add("feed-stale",null,null,null);if(previousUnhealthy&&snapshot.feedQuality.connected&&!snapshot.feedQuality.stale&&snapshot.feedQuality.sequenceContinuous!==false)add("feed-recovered",null,null,null);
    const keys=new Set(inputs.map(logicalKey)),emitted=new Set<string>(),events=inputs.filter(event=>{const key=logicalKey(event);if(this.priorKeys.has(key)||emitted.has(key))return false;emitted.add(key);return true}).map(createHistoricalFlowEvent).sort((a,b)=>a.timeMs-b.timeMs||a.id.localeCompare(b.id));this.priorKeys=keys;this.previous=snapshot;return Object.freeze(events)}
  reset(){this.identity=null;this.previous=null;this.priorKeys.clear()}
}
