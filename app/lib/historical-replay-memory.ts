import { createHash } from "node:crypto";
import type { Candle } from "./strategy";
import { CANDLE_TIMEFRAMES, type CandleTimeframe } from "./market/types";

export const HISTORICAL_REPLAY_MEMORY_SCHEMA_VERSION = 1 as const;
export const REPLAY_MEMORY_VALIDATION_VERSION = 2 as const;
export const REPLAY_MEMORY_BEFORE_CANDLES = 100;
export const REPLAY_MEMORY_AFTER_CANDLES = 20;
export const MAX_REPLAY_MEMORY_CANDLES = 500;
export const MAX_REPLAY_MEMORY_SUBMITTED_CANDLES = 2_000;
export const MAX_REPLAY_MEMORY_BYTES = 512_000;
export const MAX_REPLAY_MEMORIES_PER_USER = 2_000;
export const MAX_REPLAY_MEMORY_BYTES_PER_USER = 256 * 1024 * 1024;
export type HistoricalFlowAvailability = "available"|"partially-available"|"unavailable"|"capture-not-supported"|"error";
export type ReplayMemoryCaptureProvenance = Readonly<{
  source:"terminal-closed-candle-buffer";serverVerified:true;validationVersion:2;capturedAt:string;
  submittedCandleCount:number;requestedPreEntryCandles:number;requestedPostExitCandles:number;
  sourceRangeStartMs:number;sourceRangeEndMs:number;selectedRangeStartMs:number;selectedRangeEndMs:number;
  optionalPostExitShortage:boolean;
}>;
export type HistoricalReplayIntegrity = Readonly<{
  contentHash:string;candleCount:number;closedCandlesOnly:true;sorted:true;deduplicated:true;
  containsEntry:true;containsExit:true;gapCount:number;truncatedBefore:boolean;truncatedAfter:boolean;
  captureComplete:true;warnings:readonly string[];
}>;
export type HistoricalReplayMemory = Readonly<{
  id:string;schemaVersion:1;createdAt:string;source:"paper-trade";tradeId:string;marketKey:string;symbol:string;
  timeframe:CandleTimeframe;signalTimeMs:number|null;entryTimeMs:number;exitTimeMs:number;entryPrice:number;exitPrice:number;
  rangeStartMs:number;rangeEndMs:number;candles:ReadonlyArray<Candle>;strategyContext:Readonly<{version:string}>|null;
  signalContext:Readonly<{direction:"long"|"short";signalTimeMs:number}>|null;brainContext:null;chartContext:null;
  flowAvailability:HistoricalFlowAvailability;captureProvenance:ReplayMemoryCaptureProvenance;integrity:HistoricalReplayIntegrity;
}>;
export class ReplayMemoryValidationError extends Error { constructor(public code:string,message:string){super(message);} }
const fail=(code:string,message:string):never=>{throw new ReplayMemoryValidationError(code,message);};
const intervalSeconds:Record<CandleTimeframe,number>={"1m":60,"5m":300,"15m":900,"30m":1800,"1h":3600,"4h":14400,"8h":28800,"1d":86400,"1w":604800,"1M":2592000};
const validMarket=(value:string)=>/^mexc:(?:spot|futures):[A-Z0-9_]{1,40}$/.test(value);
const finitePrice=(value:number)=>Number.isFinite(value)&&value>0;
const hashCandles=(candles:ReadonlyArray<Candle>)=>createHash("sha256").update(JSON.stringify(candles.map(c=>[c.time,c.open,c.high,c.low,c.close,c.volume]))).digest("hex");
export function replayMemoryId(input:{tradeId:string;marketKey:string;symbol:string;timeframe:string;entryTimeMs:number}) {
  return `hrm1_${createHash("sha256").update(JSON.stringify({tradeId:input.tradeId,marketKey:input.marketKey,symbol:input.symbol,timeframe:input.timeframe,entryTimeMs:input.entryTimeMs})).digest("hex").slice(0,40)}`;
}
function validateIdentity(input:{tradeId:string;marketKey:string;symbol:string;timeframe:CandleTimeframe;entryTimeMs:number;exitTimeMs:number;entryPrice:number;exitPrice:number}) {
  if(!input.tradeId||!validMarket(input.marketKey)||!input.symbol||!CANDLE_TIMEFRAMES.includes(input.timeframe))fail("INVALID_IDENTITY","Invalid replay-memory identity.");
  if(!Number.isSafeInteger(input.entryTimeMs)||!Number.isSafeInteger(input.exitTimeMs)||input.exitTimeMs<input.entryTimeMs)fail("INVALID_TRADE_RANGE","Invalid completed-trade range.");
  if(!finitePrice(input.entryPrice)||!finitePrice(input.exitPrice))fail("INVALID_TRADE_PRICE","Invalid completed-trade price.");
}
function validateCandle(value:unknown,interval:number):Candle {
  if(!value||typeof value!=="object")fail("MALFORMED_CANDLE","Malformed replay candle.");const c=value as Candle;
  if(![c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||!Number.isSafeInteger(c.time)||c.time<=0||c.time%interval!==0||c.low>c.high||c.open<c.low||c.open>c.high||c.close<c.low||c.close>c.high||c.volume<0)fail("MALFORMED_CANDLE","Malformed or timeframe-misaligned replay candle.");
  return Object.freeze({time:c.time,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume});
}
function normaliseCandles(input:unknown,interval:number){
  if(!Array.isArray(input)||input.length===0||input.length>MAX_REPLAY_MEMORY_SUBMITTED_CANDLES)fail("TOO_MANY_CANDLES","Replay-memory capture payload has an invalid candle count.");
  const values=input as unknown[],byTime=new Map<number,Candle>();for(const raw of values){const candle=validateCandle(raw,interval);byTime.set(candle.time,candle);}
  return Object.freeze([...byTime.values()].sort((a,b)=>a.time-b.time));
}
function gapCount(candles:ReadonlyArray<Candle>,interval:number){let gaps=0;for(let i=1;i<candles.length;i+=1)if(candles[i].time-candles[i-1].time>interval)gaps+=1;return gaps;}
const containsPrice=(c:Candle,price:number)=>price>=c.low&&price<=c.high;
export function captureHistoricalReplayMemory(input:{tradeId:string;replaySessionId:string;marketKey:string;symbol:string;timeframe:CandleTimeframe;signalTimeMs:number|null;entryTimeMs:number;exitTimeMs:number;entryPrice:number;exitPrice:number;direction:"long"|"short";strategyVersion:string|null;candles:unknown;capturedAtMs?:number}):HistoricalReplayMemory {
  validateIdentity(input);if(input.replaySessionId!==`journal-replay|${input.tradeId}`)fail("REPLAY_IDENTITY_MISMATCH","Trade and replay identities do not match.");
  const capturedAtMs=input.capturedAtMs??Date.now();if(!Number.isSafeInteger(capturedAtMs)||capturedAtMs<input.exitTimeMs)fail("INVALID_CAPTURE_TIME","Capture time predates the completed trade.");
  const interval=intervalSeconds[input.timeframe],intervalMs=interval*1_000,submitted=Array.isArray(input.candles)?input.candles.length:0;
  const normalised=normaliseCandles(input.candles,interval);if(normalised.some(c=>c.time*1_000>capturedAtMs))fail("FUTURE_CANDLE","Replay-memory payload contains a candle after capture time.");const closed=normalised.filter(c=>c.time*1_000+intervalMs<=capturedAtMs);
  const entryIndex=closed.findIndex(c=>c.time*1_000===input.entryTimeMs),exitIndex=closed.findIndex(c=>c.time*1_000===input.exitTimeMs);
  if(entryIndex<0)fail("ENTRY_NOT_COVERED","Closed history does not contain the trade entry candle.");if(exitIndex<0)fail("EXIT_NOT_COVERED","Closed history does not contain the trade exit candle.");
  if(!containsPrice(closed[entryIndex],input.entryPrice))fail("ENTRY_PRICE_MISMATCH","Trade entry price is outside its submitted candle range.");if(!containsPrice(closed[exitIndex],input.exitPrice))fail("EXIT_PRICE_MISMATCH","Trade exit price is outside its submitted candle range.");
  const signalIndex=input.signalTimeMs===null?-1:closed.findIndex(c=>c.time*1_000===input.signalTimeMs),anchor=signalIndex<0?entryIndex:signalIndex;
  const desiredStart=Math.max(0,anchor-REPLAY_MEMORY_BEFORE_CANDLES),desiredEnd=exitIndex+REPLAY_MEMORY_AFTER_CANDLES+1;
  let selected=closed.slice(desiredStart,Math.min(closed.length,desiredEnd)),truncatedBefore=desiredStart>0,truncatedAfter=desiredEnd<closed.length;
  if(selected.length>MAX_REPLAY_MEMORY_CANDLES){const relativeExit=exitIndex-desiredStart,windowStart=Math.max(0,relativeExit-MAX_REPLAY_MEMORY_CANDLES+1);if(entryIndex-desiredStart<windowStart)fail("TRADE_TOO_LONG","Trade cannot fit in the bounded replay-memory window.");selected=selected.slice(windowStart,windowStart+MAX_REPLAY_MEMORY_CANDLES);truncatedBefore=true;truncatedAfter=true;}
  truncatedBefore=selected[0].time>closed[0].time;truncatedAfter=selected.at(-1)!.time<closed.at(-1)!.time;
  const candles=Object.freeze(selected.map(c=>Object.freeze({...c}))),optionalPostExitShortage=desiredEnd>closed.length,warnings:string[]=[];
  if(optionalPostExitShortage)warnings.push("Optional post-exit candles were not available at capture time.");if(truncatedBefore)warnings.push("Earlier context was deterministically truncated.");if(truncatedAfter)warnings.push("Later context was deterministically truncated.");
  const gaps=gapCount(candles,interval);if(gaps)warnings.push(`${gaps} candle gap${gaps===1?" was":"s were"} detected; missing candles were not fabricated.`);
  const rangeStartMs=candles[0].time*1_000,rangeEndMs=candles.at(-1)!.time*1_000+intervalMs,contentHash=hashCandles(candles),createdAt=new Date(capturedAtMs).toISOString();
  const captureProvenance=Object.freeze({source:"terminal-closed-candle-buffer" as const,serverVerified:true as const,validationVersion:REPLAY_MEMORY_VALIDATION_VERSION,capturedAt:createdAt,submittedCandleCount:submitted,requestedPreEntryCandles:REPLAY_MEMORY_BEFORE_CANDLES,requestedPostExitCandles:REPLAY_MEMORY_AFTER_CANDLES,sourceRangeStartMs:closed[0].time*1_000,sourceRangeEndMs:closed.at(-1)!.time*1_000+intervalMs,selectedRangeStartMs:rangeStartMs,selectedRangeEndMs:rangeEndMs,optionalPostExitShortage});
  const integrity=Object.freeze({contentHash,candleCount:candles.length,closedCandlesOnly:true as const,sorted:true as const,deduplicated:true as const,containsEntry:true as const,containsExit:true as const,gapCount:gaps,truncatedBefore,truncatedAfter,captureComplete:true as const,warnings:Object.freeze(warnings)});
  const memory=Object.freeze({id:replayMemoryId(input),schemaVersion:HISTORICAL_REPLAY_MEMORY_SCHEMA_VERSION,createdAt,source:"paper-trade" as const,tradeId:input.tradeId,marketKey:input.marketKey,symbol:input.symbol,timeframe:input.timeframe,signalTimeMs:input.signalTimeMs,entryTimeMs:input.entryTimeMs,exitTimeMs:input.exitTimeMs,entryPrice:input.entryPrice,exitPrice:input.exitPrice,rangeStartMs,rangeEndMs,candles,strategyContext:input.strategyVersion?Object.freeze({version:input.strategyVersion}):null,signalContext:input.signalTimeMs===null?null:Object.freeze({direction:input.direction,signalTimeMs:input.signalTimeMs}),brainContext:null,chartContext:null,flowAvailability:"capture-not-supported" as const,captureProvenance,integrity});
  if(Buffer.byteLength(JSON.stringify(memory))>MAX_REPLAY_MEMORY_BYTES)fail("MEMORY_TOO_LARGE","Replay memory exceeds the serialized size limit.");return memory;
}
export function validateHistoricalReplayMemory(value:unknown):HistoricalReplayMemory {
  if(!value||typeof value!=="object")fail("MALFORMED_MEMORY","Malformed replay memory.");const v=value as HistoricalReplayMemory;validateIdentity(v);
  if(v.schemaVersion!==1||v.source!=="paper-trade"||v.id!==replayMemoryId(v)||v.captureProvenance?.source!=="terminal-closed-candle-buffer"||v.captureProvenance.serverVerified!==true||v.captureProvenance.validationVersion!==2||v.createdAt!==v.captureProvenance.capturedAt)fail("MALFORMED_MEMORY","Malformed replay-memory provenance.");
  const capturedAtMs=Date.parse(v.captureProvenance.capturedAt);if(!Number.isSafeInteger(capturedAtMs))fail("INVALID_CAPTURE_TIME","Invalid replay-memory capture time.");const interval=intervalSeconds[v.timeframe],intervalMs=interval*1_000,candles=normaliseCandles(v.candles,interval);
  if(candles.length!==v.candles.length||candles.some((c,i)=>c.time!==v.candles[i].time))fail("INTEGRITY_MISMATCH","Stored candles are not sorted and unique.");if(candles.some(c=>c.time*1_000+intervalMs>capturedAtMs))fail("FUTURE_CANDLE","Stored memory contains a future or forming candle.");
  const entry=candles.find(c=>c.time*1_000===v.entryTimeMs),exit=candles.find(c=>c.time*1_000===v.exitTimeMs);if(!entry||!containsPrice(entry,v.entryPrice)||!exit||!containsPrice(exit,v.exitPrice))fail("INTEGRITY_MISMATCH","Stored memory no longer covers authoritative trade facts.");
  const expected={contentHash:hashCandles(candles),candleCount:candles.length,gapCount:gapCount(candles,interval),rangeStartMs:candles[0].time*1_000,rangeEndMs:candles.at(-1)!.time*1_000+intervalMs};
  if(v.integrity.contentHash!==expected.contentHash||v.integrity.candleCount!==expected.candleCount||v.integrity.gapCount!==expected.gapCount||!v.integrity.closedCandlesOnly||!v.integrity.sorted||!v.integrity.deduplicated||!v.integrity.containsEntry||!v.integrity.containsExit||!v.integrity.captureComplete||v.rangeStartMs!==expected.rangeStartMs||v.rangeEndMs!==expected.rangeEndMs||v.captureProvenance.selectedRangeStartMs!==expected.rangeStartMs||v.captureProvenance.selectedRangeEndMs!==expected.rangeEndMs)fail("INTEGRITY_MISMATCH","Stored replay-memory integrity metadata is inconsistent.");
  const expectedPostShortage=v.captureProvenance.sourceRangeEndMs<v.exitTimeMs+(REPLAY_MEMORY_AFTER_CANDLES+1)*intervalMs;if(v.captureProvenance.optionalPostExitShortage!==expectedPostShortage||v.captureProvenance.requestedPreEntryCandles!==REPLAY_MEMORY_BEFORE_CANDLES||v.captureProvenance.requestedPostExitCandles!==REPLAY_MEMORY_AFTER_CANDLES||v.captureProvenance.submittedCandleCount<candles.length||v.captureProvenance.sourceRangeStartMs>v.rangeStartMs||v.captureProvenance.sourceRangeEndMs<v.rangeEndMs)fail("INTEGRITY_MISMATCH","Stored replay-memory capture provenance is inconsistent.");
  const expectedBefore=v.captureProvenance.sourceRangeStartMs<v.rangeStartMs,expectedAfter=v.captureProvenance.sourceRangeEndMs>v.rangeEndMs;if(v.integrity.truncatedBefore!==expectedBefore||v.integrity.truncatedAfter!==expectedAfter)fail("INTEGRITY_MISMATCH","Stored truncation metadata is inconsistent.");return Object.freeze({...v,candles:Object.freeze(candles)});
}
