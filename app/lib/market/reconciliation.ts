import type { Candle } from "../strategy.ts";
import { mergeClosedCandles } from "./realtime.ts";

export type MarketLoadReason = "initial" | "market-change" | "manual" | "rollover" | "reconnect";

export const isSilentReconciliation = (reason: MarketLoadReason) => reason === "rollover" || reason === "reconnect";

/** REST wins matching timestamps, while unpublished locally-finalised bars survive. */
export function reconcileClosedCandles(local: Candle[], rest: Candle[], limit = 800): Candle[] {
  return mergeClosedCandles(local, rest, limit);
}

export const isCurrentMarketResponse = (requested: string, current: string) => requested === current;

