import type { PaperTrade } from "./backtest";
import type { TradeSnapshot, ReplayReference } from "./journal-model";
import type { Candle } from "./strategy";
import { replayRangeForCandles } from "./replay";
import type { CandleTimeframe } from "./market/types";

export type JournalTradeContext = Readonly<{
  symbol: string;
  market: string;
  marketKey: string;
  timeframe: CandleTimeframe;
  replay: Readonly<{ marketKey: string; symbol: string; timeframe: CandleTimeframe; candles: ReadonlyArray<Candle> }>;
}>;

const identityPart=(value:string)=>`${value.length}:${value}`;
/** Length-prefixed components make the identifier deterministic without delimiter ambiguity. */
export function journalTradeId(trade:PaperTrade,context:Pick<JournalTradeContext,"marketKey"|"symbol"|"timeframe">):string {
  return `jt1|${[context.marketKey,context.symbol,context.timeframe,trade.id].map(identityPart).join("|")}`;
}

/** Availability describes the exact loaded identity and timestamp coverage; it never predicts fetchable history. */
export function replayReferenceForTrade(trade: PaperTrade, context: JournalTradeContext): ReplayReference {
  const identityMatches=context.marketKey===context.replay.marketKey&&context.symbol===context.replay.symbol&&context.timeframe===context.replay.timeframe;
  let available=false;
  if(identityMatches&&context.replay.candles.length){
    try { const range=replayRangeForCandles(context.replay.candles,context.timeframe); const entryTimeMs=trade.entryTime*1_000; available=entryTimeMs>=range.rangeStartMs&&entryTimeMs<range.rangeEndMs&&context.replay.candles.some(c=>c.time===trade.entryTime); } catch { available=false; }
  }
  return Object.freeze({sessionId:`journal-replay|${journalTradeId(trade,context)}`,marketKey:context.marketKey,symbol:context.symbol,timeframe:context.timeframe,entryTimeMs:trade.entryTime*1_000,available,source:available?"rolling-history" as const:"unavailable" as const,memoryId:null,capturedRangeStartMs:null,capturedRangeEndMs:null,candleCount:null,integrityWarnings:Object.freeze([]),brainAvailable:false,flowAvailability:"unavailable" as const});
}

export type JournalReplayLaunch = Readonly<{marketKey:string;symbol:string;timeframe:CandleTimeframe;timestampMs:number}>;
export function journalReplayCursor(request:JournalReplayLaunch,loaded:{marketKey:string;symbol:string;timeframe:CandleTimeframe;candles:ReadonlyArray<Candle>}):number|null {
  if(request.marketKey!==loaded.marketKey||request.symbol!==loaded.symbol||request.timeframe!==loaded.timeframe||!Number.isFinite(request.timestampMs)||!loaded.candles.length)return null;
  const first=loaded.candles[0].time*1_000,last=loaded.candles.at(-1)!.time*1_000;
  if(request.timestampMs<first||request.timestampMs>last)return null;
  const index=loaded.candles.findIndex(c=>c.time*1_000>=request.timestampMs);
  return index<0?null:index;
}

/** Maps authoritative completed-trade fields only. Facts not recorded by DizyPaper remain null. */
export function tradeSnapshotFromPaper(trade: PaperTrade, context: JournalTradeContext): TradeSnapshot {
  return Object.freeze({tradeId:journalTradeId(trade,context),symbol:context.symbol,market:context.market,timeframe:context.timeframe,direction:trade.direction,
    entry:trade.entry,exit:trade.exit,stop:trade.stop,target:trade.target??null,positionSize:trade.positionSize??null,
    riskPct:trade.riskPct??null,leverage:trade.leverage??null,marginMode:null,fees:null,pnl:trade.pnl,pnlPct:trade.pnlPct,
    rMultiple:trade.rMultiple??null,openTime:new Date(trade.entryTime*1_000).toISOString(),closeTime:new Date(trade.exitTime*1_000).toISOString(),
    closeReason:trade.exitReason,strategyVersion:null,replay:replayReferenceForTrade(trade,context),brain:null,
    signal:Number.isFinite(trade.signalTime)?Object.freeze({direction:trade.direction,signalTime:new Date(trade.signalTime*1_000).toISOString(),label:`DizySignals confirmed-candle ${trade.direction}`}):null,dizyBrainReview:Object.freeze({available:false,reviewId:null,engineVersion:null,generatedAt:null,generatedFromHash:null,reviewConfidence:null}),historicalDizyFlow:Object.freeze({available:false,memoryId:null,captureStartMs:null,captureEndMs:null,sampleCount:0,eventCount:0,averageConfidence:null,coveragePct:null,limitations:Object.freeze(["capture-unavailable"])})});
}

export type JournalReplaySource = "retained-memory"|"rolling-history"|"unavailable"|"cancelled";
export type JournalReplayCandidate = Readonly<{source:Exclude<JournalReplaySource,"unavailable"|"cancelled">;candles:ReadonlyArray<Candle>;cursor:number}>;
/** One-shot source coordinator. Retained validation failure falls through directly; cancellation never launches. */
export async function coordinateJournalReplayLaunch(input:{signal:AbortSignal;loadRetained?:()=>Promise<ReadonlyArray<Candle>>;rollingCandles:ReadonlyArray<Candle>;request:JournalReplayLaunch;identity:{marketKey:string;symbol:string;timeframe:CandleTimeframe}}):Promise<JournalReplayCandidate|Readonly<{source:"unavailable"}>|Readonly<{source:"cancelled"}>> {
  if(input.signal.aborted)return Object.freeze({source:"cancelled"});
  if(input.loadRetained){try{const candles=await input.loadRetained();if(input.signal.aborted)return Object.freeze({source:"cancelled"});const cursor=journalReplayCursor(input.request,{...input.identity,candles});if(cursor!==null)return Object.freeze({source:"retained-memory",candles,cursor});}catch(reason){if(input.signal.aborted||(reason as Error).name==="AbortError")return Object.freeze({source:"cancelled"});}}
  if(input.signal.aborted)return Object.freeze({source:"cancelled"});const cursor=journalReplayCursor(input.request,{...input.identity,candles:input.rollingCandles});return cursor===null?Object.freeze({source:"unavailable"}):Object.freeze({source:"rolling-history",candles:input.rollingCandles,cursor});
}

/** Separates an abortable attempt from a final handled result. Tokens reject stale completions. */
export class JournalReplayLaunchLifecycle {
  private generation=0;
  private activeToken:number|null=null;
  private final=false;
  begin(){if(this.final||this.activeToken!==null)return null;this.activeToken=++this.generation;return this.activeToken;}
  cancel(token:number){if(this.activeToken!==token)return false;this.activeToken=null;return true;}
  complete(token:number){if(this.activeToken!==token||this.final)return false;this.activeToken=null;this.final=true;return true;}
  isCurrent(token:number){return !this.final&&this.activeToken===token;}
  get launchInFlight(){return this.activeToken!==null;}
  get launchHandled(){return this.final;}
}
