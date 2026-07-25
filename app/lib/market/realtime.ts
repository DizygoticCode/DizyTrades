import type { Candle } from "../strategy.ts";
import { MEXC_INTERVALS } from "./mexc-shared.ts";
import type { CandleTimeframe } from "./types.ts";

export type MexcKline = Candle & { symbol: string; interval: string };
export type MexcDeal = { symbol: string; price: number; timeMs: number; volume: number };

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown) => {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

export function parseMexcKline(message: unknown, symbol: string, timeframe: CandleTimeframe): MexcKline | null {
  const envelope = record(message);
  if (!envelope || envelope.channel !== "push.kline") return null;
  const data = record(envelope.data);
  if (!data) return null;
  const receivedSymbol = String(data.symbol ?? envelope.symbol ?? "");
  const interval = String(data.interval ?? envelope.interval ?? "");
  if (receivedSymbol !== symbol || interval !== MEXC_INTERVALS[timeframe].api) return null;
  const [time, open, high, low, close, volume] = [data.t, data.o, data.h, data.l, data.c, data.q].map(finite);
  if ([time, open, high, low, close, volume].some((value) => value === null)) return null;
  const candle = { time: time!, open: open!, high: high!, low: low!, close: close!, volume: volume! };
  if (!Number.isInteger(candle.time) || candle.time <= 0 || candle.volume < 0 || candle.low > candle.high || candle.open < candle.low || candle.open > candle.high || candle.close < candle.low || candle.close > candle.high) return null;
  return { ...candle, symbol: receivedSymbol, interval };
}

export function parseMexcDeals(message: unknown, symbol: string): MexcDeal[] {
  const envelope = record(message);
  if (!envelope || envelope.channel !== "push.deal") return [];
  const receivedSymbol = String(envelope.symbol ?? record(envelope.data)?.symbol ?? "");
  if (receivedSymbol !== symbol) return [];
  const payload = Array.isArray(envelope.data) ? envelope.data : [envelope.data];
  return payload.flatMap((raw): MexcDeal[] => {
    const data = record(raw);
    if (!data) return [];
    const price = finite(data.p), timeMs = finite(data.t), volume = finite(data.v);
    if (price === null || timeMs === null || volume === null || price <= 0 || timeMs <= 0 || volume < 0) return [];
    return [{ symbol: receivedSymbol, price, timeMs, volume }];
  });
}

export function mergeClosedCandles(candles: Candle[], additions: Candle[], limit = 800): Candle[] {
  const map = new Map<number, Candle>();
  [...candles, ...additions].forEach((candle) => map.set(candle.time, candle));
  return [...map.values()].sort((a, b) => a.time - b.time).slice(-limit);
}

export function applyKlineUpdate(closed: Candle[], live: Candle | null, incoming: Candle, limit = 800) {
  if (live && incoming.time < live.time) return { closed, live, rolled: false };
  if (!live || incoming.time === live.time) return { closed, live: incoming, rolled: false };
  return { closed: mergeClosedCandles(closed, [live], limit), live: incoming, rolled: true };
}

export function applyDealToLiveCandle(live: Candle | null, deal: MexcDeal, timeframe: CandleTimeframe): Candle | null {
  if (!live) return null;
  const seconds = Math.floor(deal.timeMs / 1000);
  const close = nextCandleCloseTimestamp(live.time, timeframe);
  if (seconds < live.time || seconds >= close) return live;
  return { ...live, close: deal.price, high: Math.max(live.high, deal.price), low: Math.min(live.low, deal.price) };
}

export function nextCandleCloseTimestamp(startSeconds: number, timeframe: CandleTimeframe): number {
  if (timeframe !== "1M") return startSeconds + MEXC_INTERVALS[timeframe].seconds;
  const start = new Date(startSeconds * 1000);
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) / 1000;
}

export function estimateServerClockOffset(serverTimeMs: number, clientReceivedMs: number): number {
  return Number.isFinite(serverTimeMs) && Number.isFinite(clientReceivedMs) ? serverTimeMs - clientReceivedMs : 0;
}

export function formatCountdown(secondsInput: number, timeframe?: CandleTimeframe): string {
  const seconds = Math.max(0, Math.floor(secondsInput));
  if (seconds === 0) return "Closing…";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  if (days || timeframe === "1w" || timeframe === "1M") return `${days}d ${two(hours)}:${two(minutes)}:${two(remainder)}`;
  if (hours) return `${two(hours)}:${two(minutes)}:${two(remainder)}`;
  return `${two(minutes)}:${two(remainder)}`;
}

export function defaultVisibleCandleCount(width: number, available: number): number {
  const responsive = Math.round(width / 8);
  return Math.min(available, Math.max(80, Math.min(180, responsive || 120)));
}
