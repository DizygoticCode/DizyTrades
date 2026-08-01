import type { Candle } from "./strategy.ts";
import { analyzeStrategy, type StrategyAnalysis, type StrategySettings } from "./strategy.ts";
import type { RiskSettings } from "./config.ts";
import { createDizyBrainSnapshot, type DizyBrainSnapshot } from "./dizybrain-snapshot.ts";
import { CANDLE_TIMEFRAMES, type CandleTimeframe } from "./market/types.ts";

export const MAX_REPLAY_CANDLES = 2_000;
export type ReplayStatus = "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "error";
export type ReplaySpeed = "step" | 1 | 2 | 5 | 10;
export type ReplayDataAvailability = "available" | "partially-available" | "unavailable" | "loading" | "error";
export type ReplaySession = Readonly<{ id:string; symbol:string; timeframe:CandleTimeframe; status:ReplayStatus; startedAt:number; rangeStartMs:number; rangeEndMs:number; cursorIndex:number; cursorTimeMs:number|null; speed:ReplaySpeed; candlesLoaded:number; visibleCandles:number; error:string|null }>;
export type ReplaySnapshot = Readonly<{ sessionId:string; symbol:string; timeframe:CandleTimeframe; cursorIndex:number; cursorTimeMs:number|null; candlesVisible:number; latestCandle:Candle|null; signalAnalysis:StrategyAnalysis; dizyBrainSnapshot:DizyBrainSnapshot|null; orderFlowAvailability:ReplayDataAvailability }>;

const intervalSeconds: Record<CandleTimeframe, number> = {"1m":60,"5m":300,"15m":900,"30m":1800,"1h":3600,"4h":14400,"8h":28800,"1d":86400,"1w":604800,"1M":2592000};
export const replayDelayMs = (speed:ReplaySpeed) => speed === "step" ? null : 1_000 / speed;
export function validateReplayRange(startMs:number,endMs:number) { return Number.isSafeInteger(startMs)&&Number.isSafeInteger(endMs)&&startMs>=0&&endMs>startMs; }
export function clampReplayCursor(index:number,count:number) { return count ? Math.max(0,Math.min(Math.trunc(index),count-1)) : -1; }

export function prepareReplayCandles(input:unknown, identity:{symbol:string;timeframe:CandleTimeframe}, received?:{symbol?:string;timeframe?:string}):ReadonlyArray<Candle> {
  if (!identity.symbol || !CANDLE_TIMEFRAMES.includes(identity.timeframe)) throw new Error("Invalid replay identity.");
  if (received?.symbol && received.symbol !== identity.symbol || received?.timeframe && received.timeframe !== identity.timeframe) throw new Error("Replay history identity mismatch.");
  if (!Array.isArray(input)) throw new Error("Malformed replay history.");
  const byTime=new Map<number,Candle>();
  for(const value of input){
    if(!value||typeof value!=="object") throw new Error("Malformed replay candle.");
    const c=value as Candle;
    if(![c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||!Number.isInteger(c.time)||c.time<=0||c.low>c.high||c.open<c.low||c.open>c.high||c.close<c.low||c.close>c.high||c.volume<0) throw new Error("Malformed replay candle.");
    byTime.set(c.time,Object.freeze({...c}));
  }
  return Object.freeze([...byTime.values()].sort((a,b)=>a.time-b.time).slice(-MAX_REPLAY_CANDLES));
}
export function detectReplayGaps(candles:ReadonlyArray<Candle>,timeframe:CandleTimeframe){const expected=intervalSeconds[timeframe];return candles.flatMap((c,i)=>i&&c.time-candles[i-1].time>expected?[{afterTime:candles[i-1].time,beforeTime:c.time,missingIntervals:Math.max(1,Math.floor((c.time-candles[i-1].time)/expected)-1)}]:[]);}
export function createReplaySession(input:{id:string;symbol:string;timeframe:CandleTimeframe;rangeStartMs:number;rangeEndMs:number;startedAt:number;speed?:ReplaySpeed;candles:ReadonlyArray<Candle>}):ReplaySession{
  if(!input.id||!validateReplayRange(input.rangeStartMs,input.rangeEndMs))throw new Error("Invalid replay range.");
  const cursor=input.candles.length?0:-1;
  return Object.freeze({id:input.id,symbol:input.symbol,timeframe:input.timeframe,status:input.candles.length?"ready":"ended",startedAt:input.startedAt,rangeStartMs:input.rangeStartMs,rangeEndMs:input.rangeEndMs,cursorIndex:cursor,cursorTimeMs:cursor<0?null:input.candles[0].time*1000,speed:input.speed??1,candlesLoaded:input.candles.length,visibleCandles:cursor+1,error:null});
}
export const replayPrefix=(candles:ReadonlyArray<Candle>,cursor:number):ReadonlyArray<Candle>=>Object.freeze(candles.slice(0,clampReplayCursor(cursor,candles.length)+1));
export function jumpReplay(session:ReplaySession,candles:ReadonlyArray<Candle>,index:number):ReplaySession{const cursor=clampReplayCursor(index,candles.length),ended=cursor===candles.length-1;return Object.freeze({...session,cursorIndex:cursor,cursorTimeMs:cursor<0?null:candles[cursor].time*1000,visibleCandles:cursor+1,status:ended?"ended":"paused"});}
export const stepReplay=(s:ReplaySession,c:ReadonlyArray<Candle>,delta:1|-1)=>jumpReplay(s,c,s.cursorIndex+delta);
export const jumpReplayToTimestamp=(s:ReplaySession,c:ReadonlyArray<Candle>,ms:number)=>{let index=c.findIndex(x=>x.time*1000>=ms);if(index<0)index=c.length-1;return jumpReplay(s,c,index);};
export const progressReplay=(s:ReplaySession,c:ReadonlyArray<Candle>)=>s.status!=="playing"?s:stepReplay(s,c,1);
export function createReplaySnapshot(input:{session:ReplaySession;candles:ReadonlyArray<Candle>;strategy:StrategySettings;risk:RiskSettings;orderFlowAvailability?:ReplayDataAvailability}):ReplaySnapshot{
  const prefix=replayPrefix(input.candles,input.session.cursorIndex), latest=prefix.at(-1)??null, analysis=analyzeStrategy([...prefix],input.strategy);
  const brain=latest?createDizyBrainSnapshot({analysis,strategy:input.strategy,risk:input.risk,latestClosedCandleTime:latest.time,provenance:{source:"replay",sessionId:input.session.id,replayTimestampMs:latest.time*1000}}):null;
  return Object.freeze({sessionId:input.session.id,symbol:input.session.symbol,timeframe:input.session.timeframe,cursorIndex:input.session.cursorIndex,cursorTimeMs:latest?latest.time*1000:null,candlesVisible:prefix.length,latestCandle:latest?Object.freeze({...latest}):null,signalAnalysis:analysis,dizyBrainSnapshot:brain,orderFlowAvailability:input.orderFlowAvailability??"unavailable"});
}
export class ReplayRequestGate { private generation=0; begin(){return ++this.generation;} cancel(){this.generation+=1;} accept(id:number,identity:string,currentIdentity:string){return id===this.generation&&identity===currentIdentity;} }
