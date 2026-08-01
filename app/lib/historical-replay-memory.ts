import { createHash } from "node:crypto";
import type { Candle } from "./strategy";
import { CANDLE_TIMEFRAMES, type CandleTimeframe } from "./market/types";
import { detectReplayGaps, prepareReplayCandles } from "./replay";

export const HISTORICAL_REPLAY_MEMORY_SCHEMA_VERSION = 1 as const;
export const REPLAY_MEMORY_BEFORE_CANDLES = 100;
export const REPLAY_MEMORY_AFTER_CANDLES = 20;
export const MAX_REPLAY_MEMORY_CANDLES = 500;
export const MAX_REPLAY_MEMORY_BYTES = 512_000;
export const MAX_REPLAY_MEMORIES_PER_USER = 2_000;
export const MAX_REPLAY_MEMORY_BYTES_PER_USER = 256 * 1024 * 1024;
export type HistoricalFlowAvailability = "available"|"partially-available"|"unavailable"|"capture-not-supported"|"error";
export type HistoricalReplayIntegrity = Readonly<{candleCount:number;closedCandlesOnly:true;sorted:true;deduplicated:true;containsEntry:boolean;containsExit:boolean;gapCount:number;truncatedBefore:boolean;truncatedAfter:boolean;captureComplete:boolean;warnings:readonly string[]}>;
export type HistoricalReplayMemory = Readonly<{id:string;schemaVersion:1;createdAt:string;source:"paper-trade";tradeId:string;marketKey:string;symbol:string;timeframe:CandleTimeframe;signalTimeMs:number|null;entryTimeMs:number;exitTimeMs:number;rangeStartMs:number;rangeEndMs:number;candles:ReadonlyArray<Candle>;strategyContext:Readonly<{version:string|null}>|null;signalContext:Readonly<{direction:"long"|"short";signalTimeMs:number}>|null;brainContext:null;chartContext:null;flowAvailability:HistoricalFlowAvailability;integrity:HistoricalReplayIntegrity}>;
export class ReplayMemoryValidationError extends Error { constructor(public code:string,message:string){super(message);} }
const fail=(code:string,message:string):never=>{throw new ReplayMemoryValidationError(code,message);};
const intervalSeconds:Record<CandleTimeframe,number>={"1m":60,"5m":300,"15m":900,"30m":1800,"1h":3600,"4h":14400,"8h":28800,"1d":86400,"1w":604800,"1M":2592000};
const validMarket=(value:string)=>/^mexc:(?:spot|futures):[A-Z0-9_]{1,40}$/.test(value);
export function replayMemoryId(input:{tradeId:string;marketKey:string;symbol:string;timeframe:string;entryTimeMs:number}) { return `hrm1_${createHash("sha256").update(JSON.stringify({tradeId:input.tradeId,marketKey:input.marketKey,symbol:input.symbol,timeframe:input.timeframe,entryTimeMs:input.entryTimeMs})).digest("hex").slice(0,40)}`; }

export function captureHistoricalReplayMemory(input:{tradeId:string;marketKey:string;symbol:string;timeframe:CandleTimeframe;signalTimeMs:number|null;entryTimeMs:number;exitTimeMs:number;direction:"long"|"short";strategyVersion:string|null;candles:unknown;capturedAtMs?:number}):HistoricalReplayMemory {
  if(!input.tradeId||!validMarket(input.marketKey)||!input.symbol||!CANDLE_TIMEFRAMES.includes(input.timeframe))fail("INVALID_IDENTITY","Invalid replay-memory identity.");
  if(!Number.isSafeInteger(input.entryTimeMs)||!Number.isSafeInteger(input.exitTimeMs)||input.exitTimeMs<input.entryTimeMs)fail("INVALID_TRADE_RANGE","Invalid completed-trade range.");
  const capturedAt=input.capturedAtMs??Date.now(); if(!Number.isSafeInteger(capturedAt)||capturedAt<input.exitTimeMs)fail("FUTURE_TRADE","Trade exit was not available at capture time.");
  if(!Array.isArray(input.candles)||input.candles.length>MAX_REPLAY_MEMORY_CANDLES*4)fail("TOO_MANY_CANDLES","Replay-memory capture payload has too many candles.");
  const all=prepareReplayCandles(input.candles,{symbol:input.symbol,timeframe:input.timeframe});
  if(all.length>MAX_REPLAY_MEMORY_CANDLES*4)fail("TOO_MANY_CANDLES","Replay-memory capture payload has too many candles.");
  const interval=intervalSeconds[input.timeframe]*1_000;
  const closed=all.filter(c=>c.time*1_000+interval<=capturedAt);
  const entryIndex=closed.findIndex(c=>c.time*1_000===input.entryTimeMs),exitIndex=closed.findIndex(c=>c.time*1_000===input.exitTimeMs);
  if(entryIndex<0)fail("ENTRY_NOT_COVERED","Authoritative closed history does not contain the trade entry candle.");
  if(exitIndex<0)fail("EXIT_NOT_COVERED","Authoritative closed history does not contain the trade exit candle.");
  const anchor=input.signalTimeMs===null?entryIndex:closed.findIndex(c=>c.time*1_000===input.signalTimeMs);
  const start=Math.max(0,(anchor<0?entryIndex:anchor)-REPLAY_MEMORY_BEFORE_CANDLES),desiredEnd=exitIndex+REPLAY_MEMORY_AFTER_CANDLES+1;
  let selected=closed.slice(start,Math.min(closed.length,desiredEnd));
  let truncatedBefore=start>0,truncatedAfter=desiredEnd<closed.length;
  if(selected.length>MAX_REPLAY_MEMORY_CANDLES){const entryIn=entryIndex-start,exitIn=exitIndex-start;const windowStart=Math.max(0,Math.min(entryIn,selected.length-MAX_REPLAY_MEMORY_CANDLES));if(exitIn-windowStart>=MAX_REPLAY_MEMORY_CANDLES)fail("TRADE_TOO_LONG","Trade cannot fit in the bounded replay-memory window.");selected=selected.slice(windowStart,windowStart+MAX_REPLAY_MEMORY_CANDLES);truncatedBefore=true;truncatedAfter=true;}
  const candles=Object.freeze(selected.map(c=>Object.freeze({...c}))),warnings:string[]=[];
  if(desiredEnd>closed.length)warnings.push("Optional post-exit candles were not available at capture time.");
  if(truncatedBefore)warnings.push("Earlier context was deterministically truncated to the bounded capture window.");
  if(truncatedAfter)warnings.push("Later context was deterministically truncated to the bounded capture window.");
  const gaps=detectReplayGaps(candles,input.timeframe);if(gaps.length)warnings.push(`${gaps.length} candle gap${gaps.length===1?" was":"s were"} detected; missing candles were not fabricated.`);
  const integrity=Object.freeze({candleCount:candles.length,closedCandlesOnly:true as const,sorted:true as const,deduplicated:true as const,containsEntry:true,containsExit:true,gapCount:gaps.length,truncatedBefore,truncatedAfter,captureComplete:true,warnings:Object.freeze(warnings)});
  const memory=Object.freeze({id:replayMemoryId(input),schemaVersion:HISTORICAL_REPLAY_MEMORY_SCHEMA_VERSION,createdAt:new Date(capturedAt).toISOString(),source:"paper-trade" as const,tradeId:input.tradeId,marketKey:input.marketKey,symbol:input.symbol,timeframe:input.timeframe,signalTimeMs:input.signalTimeMs,entryTimeMs:input.entryTimeMs,exitTimeMs:input.exitTimeMs,rangeStartMs:candles[0].time*1000,rangeEndMs:candles.at(-1)!.time*1000+interval,candles,strategyContext:input.strategyVersion?Object.freeze({version:input.strategyVersion}):null,signalContext:input.signalTimeMs===null?null:Object.freeze({direction:input.direction,signalTimeMs:input.signalTimeMs}),brainContext:null,chartContext:null,flowAvailability:"capture-not-supported" as const,integrity});
  if(Buffer.byteLength(JSON.stringify(memory))>MAX_REPLAY_MEMORY_BYTES)fail("MEMORY_TOO_LARGE","Replay memory exceeds the serialized size limit."); return memory;
}

export function validateHistoricalReplayMemory(value:unknown):HistoricalReplayMemory {
  if(!value||typeof value!=="object")fail("MALFORMED_MEMORY","Malformed replay memory.");const v=value as HistoricalReplayMemory;
  if(v.schemaVersion!==1||v.source!=="paper-trade"||v.id!==replayMemoryId(v)||!Array.isArray(v.candles))fail("MALFORMED_MEMORY","Malformed replay memory metadata.");
  const rebuilt=captureHistoricalReplayMemory({...v,candles:v.candles,capturedAtMs:Date.parse(v.createdAt),direction:v.signalContext?.direction??"long",strategyVersion:v.strategyContext?.version??null});
  if(rebuilt.id!==v.id||rebuilt.rangeStartMs!==v.rangeStartMs||rebuilt.rangeEndMs!==v.rangeEndMs)fail("MALFORMED_MEMORY","Replay memory integrity validation failed.");return Object.freeze({...rebuilt,createdAt:v.createdAt});
}
