import { CANDLE_TIMEFRAMES, type CandleTimeframe } from "./types.ts";

/** Public MEXC contract interval metadata. Safe to import in browser bundles. */
export const MEXC_INTERVALS: Record<CandleTimeframe, { api: string; seconds: number }> = {
  "1m": { api: "Min1", seconds: 60 },
  "5m": { api: "Min5", seconds: 300 },
  "15m": { api: "Min15", seconds: 900 },
  "30m": { api: "Min30", seconds: 1_800 },
  "1h": { api: "Min60", seconds: 3_600 },
  "4h": { api: "Hour4", seconds: 14_400 },
  "8h": { api: "Hour8", seconds: 28_800 },
  "1d": { api: "Day1", seconds: 86_400 },
  "1w": { api: "Week1", seconds: 604_800 },
  // Only REST lookback uses this nominal value. Calendar close logic does not.
  "1M": { api: "Month1", seconds: 2_592_000 },
};

export const isCandleTimeframe = (value: string): value is CandleTimeframe =>
  (CANDLE_TIMEFRAMES as readonly string[]).includes(value);

