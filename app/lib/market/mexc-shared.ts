import { CANDLE_TIMEFRAMES, type CandleTimeframe } from "./types.ts";

/**
 * Canonical public MEXC transport origins.
 *
 * MEXC moved Futures HTTPS REST traffic to api.mexc.com, while the Futures
 * WebSocket remains on contract.mexc.com/edge. Keep these constants together
 * so a REST-host migration can never silently rewrite the socket again.
 */
export const MEXC_REST_ORIGIN = "https://api.mexc.com" as const;
export const MEXC_FUTURES_WS_URL = "wss://contract.mexc.com/edge" as const;
export const MEXC_SPOT_WS_URL = "wss://wbs-api.mexc.com/ws" as const;

export function parseMexcRestOrigin(value?: string) {
  const candidate = (value ?? MEXC_REST_ORIGIN).trim();
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "api.mexc.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["", "/"].includes(url.pathname)
    ) return MEXC_REST_ORIGIN;
    return MEXC_REST_ORIGIN;
  } catch {
    return MEXC_REST_ORIGIN;
  }
}

export function parseMexcFuturesWsUrl(value?: string) {
  const candidate = (value ?? MEXC_FUTURES_WS_URL).trim();
  try {
    const url = new URL(candidate);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (
      url.protocol !== "wss:" ||
      url.hostname !== "contract.mexc.com" ||
      path !== "/edge" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) return MEXC_FUTURES_WS_URL;
    return MEXC_FUTURES_WS_URL;
  } catch {
    return MEXC_FUTURES_WS_URL;
  }
}

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
