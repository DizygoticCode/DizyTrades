import type { PaperTrade } from "./backtest";
import type { TradeSnapshot, ReplayReference } from "./journal-model";
import type { Candle } from "./strategy";
import { replayRangeForCandles } from "./replay";
import type { CandleTimeframe } from "./market/types";

export type JournalTradeContext = Readonly<{
  symbol: string;
  market: string;
  timeframe: CandleTimeframe;
  replay: Readonly<{ symbol: string; timeframe: CandleTimeframe; candles: ReadonlyArray<Candle> }>;
}>;

/** Availability describes the exact loaded identity and timestamp coverage; it never predicts fetchable history. */
export function replayReferenceForTrade(trade: PaperTrade, context: JournalTradeContext): ReplayReference {
  const identityMatches=context.symbol===context.replay.symbol&&context.timeframe===context.replay.timeframe;
  let available=false;
  if(identityMatches&&context.replay.candles.length){
    try { const range=replayRangeForCandles(context.replay.candles,context.timeframe); const entryTimeMs=trade.entryTime*1_000; available=entryTimeMs>=range.rangeStartMs&&entryTimeMs<range.rangeEndMs&&context.replay.candles.some(c=>c.time===trade.entryTime); } catch { available=false; }
  }
  return Object.freeze({sessionId:`paper-${trade.id}`,symbol:context.symbol,timeframe:context.timeframe,entryTimeMs:trade.entryTime*1_000,available});
}

/** Maps authoritative completed-trade fields only. Facts not recorded by DizyPaper remain null. */
export function tradeSnapshotFromPaper(trade: PaperTrade, context: JournalTradeContext): TradeSnapshot {
  return Object.freeze({tradeId:trade.id,symbol:context.symbol,market:context.market,timeframe:context.timeframe,direction:trade.direction,
    entry:trade.entry,exit:trade.exit,stop:trade.stop,target:trade.target??null,positionSize:trade.positionSize??null,
    riskPct:trade.riskPct??null,leverage:trade.leverage??null,marginMode:null,fees:null,pnl:trade.pnl,pnlPct:trade.pnlPct,
    rMultiple:trade.rMultiple??null,openTime:new Date(trade.entryTime*1_000).toISOString(),closeTime:new Date(trade.exitTime*1_000).toISOString(),
    closeReason:trade.exitReason,strategyVersion:null,replay:replayReferenceForTrade(trade,context),brain:null,
    signal:Number.isFinite(trade.signalTime)?Object.freeze({direction:trade.direction,signalTime:new Date(trade.signalTime*1_000).toISOString(),label:`DizySignals confirmed-candle ${trade.direction}`}):null});
}
