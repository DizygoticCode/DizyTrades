import type { Candle } from "../strategy.ts";
import type { MexcDeal } from "./realtime.ts";
import { applyDealToLiveCandle, mergeClosedCandles } from "./realtime.ts";
import type { CandleTimeframe } from "./types.ts";

export type MarketTimelineState = {
  marketKey: string;
  closed: Candle[];
  live: Candle | null;
  lastPrice: number | null;
  rolloverSequence: number;
};

export type MarketTimelineAction =
  | { type: "replaceMarket"; marketKey: string; closed: Candle[] }
  | { type: "reconcileClosed"; marketKey: string; closed: Candle[] }
  | { type: "kline"; marketKey: string; candle: Candle }
  | { type: "deal"; marketKey: string; deal: MexcDeal; timeframe: CandleTimeframe }
  | { type: "clearLive"; marketKey: string }
  | { type: "demonstrationData"; marketKey: string; closed: Candle[] };

export const isFiniteCandle = (candle: Candle) =>
  [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) &&
  candle.time > 0 && candle.volume >= 0 && candle.low <= candle.high &&
  candle.open >= candle.low && candle.open <= candle.high && candle.close >= candle.low && candle.close <= candle.high;

export function normaliseClosed(candles: Candle[], limit = 800): Candle[] {
  return mergeClosedCandles([], candles.filter(isFiniteCandle), limit);
}

/** Builds the sole timeline allowed to reach chart and drawing consumers. */
export function buildDisplayTimeline(closed: Candle[], live: Candle | null): Candle[] {
  const validLive = live && isFiniteCandle(live) ? live : null;
  const closedOnly = normaliseClosed(closed.filter(candle => candle.time !== validLive?.time));
  return validLive ? [...closedOnly.filter(candle => candle.time < validLive.time), validLive].slice(-801) : closedOnly;
}

export function marketTimelineReducer(state: MarketTimelineState, action: MarketTimelineAction): MarketTimelineState {
  if (action.type === "replaceMarket" || action.type === "demonstrationData") {
    return { marketKey: action.marketKey, closed: normaliseClosed(action.closed), live: null, lastPrice: null, rolloverSequence: 0 };
  }
  if (action.marketKey !== state.marketKey) return state;
  if (action.type === "reconcileClosed") {
    return { ...state, closed: normaliseClosed(mergeClosedCandles(state.closed, action.closed)) };
  }
  if (action.type === "clearLive") return { ...state, live: null, lastPrice: null };
  if (action.type === "deal") {
    const live = applyDealToLiveCandle(state.live, action.deal, action.timeframe);
    return live === state.live ? state : { ...state, live, lastPrice: live?.close ?? state.lastPrice };
  }
  const incoming = action.candle;
  if (!isFiniteCandle(incoming) || (state.live && incoming.time < state.live.time)) return state;
  if (!state.live || incoming.time === state.live.time) {
    return { ...state, live: incoming, lastPrice: incoming.close };
  }
  return {
    ...state,
    closed: normaliseClosed(mergeClosedCandles(state.closed, [state.live])),
    live: incoming,
    lastPrice: incoming.close,
    rolloverSequence: state.rolloverSequence + 1,
  };
}
