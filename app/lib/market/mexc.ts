import "server-only";

import type { Candle } from "../strategy";
import {
  CANDLE_TIMEFRAMES,
  type CandleRequest,
  type CandleResult,
  type CandleTimeframe,
  type MarketDescriptor,
  type MarketProvider,
} from "./types.ts";

export const MEXC_INTERVALS: Record<CandleTimeframe, { api: string; seconds: number }> = {
  "1m": { api: "Min1", seconds: 60 }, "5m": { api: "Min5", seconds: 300 },
  "15m": { api: "Min15", seconds: 900 }, "30m": { api: "Min30", seconds: 1800 },
  "1h": { api: "Min60", seconds: 3600 }, "4h": { api: "Hour4", seconds: 14_400 },
  "8h": { api: "Hour8", seconds: 28_800 }, "1d": { api: "Day1", seconds: 86_400 },
  "1w": { api: "Week1", seconds: 604_800 }, "1M": { api: "Month1", seconds: 2_592_000 },
};

export const isCandleTimeframe = (value: string): value is CandleTimeframe =>
  (CANDLE_TIMEFRAMES as readonly string[]).includes(value);

type RawMarket = Record<string, unknown>;
export function sanitiseMexcMarkets(input: unknown): MarketDescriptor[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap((raw): MarketDescriptor[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as RawMarket;
    const symbol = String(item.symbol ?? "").toUpperCase();
    const [symbolBase, symbolQuote] = symbol.split("_");
    const base = String(item.baseCoin ?? symbolBase ?? "").toUpperCase();
    const quote = String(item.quoteCoin ?? symbolQuote ?? "").toUpperCase();
    const settle = String(item.settleCoin ?? quote).toUpperCase();
    const state = Number(item.state);
    const contractType = String(item.contractType ?? item.futureType ?? "").toLowerCase();
    const hidden = item.isHidden === true || Number(item.isHidden) === 1 || item.display === false;
    const delivery = Boolean(item.deliveryTime) || /delivery|completed/.test(contractType);
    if (!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol) || !base || !quote || seen.has(symbol) || state !== 0 || hidden || delivery) return [];
    seen.add(symbol);
    const priceScale = Number(item.priceScale);
    return [{
      exchange: "mexc", marketType: "perpetual", symbol,
      displayName: `${base} / ${quote}`, base, quote, settlementCurrency: settle,
      state: "enabled", pricePrecision: Number.isInteger(priceScale) && priceScale >= 0 ? priceScale : 8,
      contractSize: Number.isFinite(Number(item.contractSize)) ? Number(item.contractSize) : undefined,
      maxLeverage: Number.isFinite(Number(item.maxLeverage)) ? Number(item.maxLeverage) : undefined,
    }];
  });
}

export function normaliseCandles(raw: unknown, nowSeconds: number, timeframe: CandleTimeframe): Candle[] {
  if (!raw || typeof raw !== "object") return [];
  const data = raw as Record<string, unknown>;
  const times = Array.isArray(data.time) ? data.time : [];
  const candles = times.flatMap((time, index): Candle[] => {
    const candle = { time: Number(time), open: Number((data.open as unknown[])?.[index]), high: Number((data.high as unknown[])?.[index]), low: Number((data.low as unknown[])?.[index]), close: Number((data.close as unknown[])?.[index]), volume: Number((data.vol as unknown[])?.[index] ?? 0) };
    const finite = Object.values(candle).every(Number.isFinite);
    if (!finite || candle.time <= 0 || candle.low > candle.high || candle.open < candle.low || candle.open > candle.high || candle.close < candle.low || candle.close > candle.high || candle.volume < 0) return [];
    if (candle.time + MEXC_INTERVALS[timeframe].seconds > nowSeconds) return [];
    return [candle];
  });
  return [...new Map(candles.sort((a, b) => a.time - b.time).map((c) => [c.time, c])).values()];
}

let cache: { markets: MarketDescriptor[]; refreshedAt: number; refresh?: Promise<MarketDescriptor[]> } = { markets: [], refreshedAt: 0 };
const CACHE_MS = 5 * 60 * 1000;

async function refreshMarkets(signal?: AbortSignal) {
  const response = await fetch("https://contract.mexc.com/api/v1/contract/detail", { headers: { accept: "application/json" }, signal, cache: "no-store" });
  if (!response.ok) throw new Error("Market directory unavailable");
  const payload = await response.json() as { success?: boolean; data?: unknown };
  const markets = payload.success ? sanitiseMexcMarkets(payload.data) : [];
  if (!markets.length) throw new Error("Market directory unavailable");
  cache = { markets, refreshedAt: Date.now() };
  return markets;
}

export async function getMexcMarkets(signal?: AbortSignal) {
  if (cache.markets.length && Date.now() - cache.refreshedAt < CACHE_MS) return cache.markets;
  cache.refresh ??= refreshMarkets(signal).finally(() => { cache.refresh = undefined; });
  try { return await cache.refresh; } catch (error) { if (cache.markets.length) return cache.markets; throw error; }
}

export function resetMexcMarketCache() { cache = { markets: [], refreshedAt: 0 }; }

export const mexcProvider: MarketProvider = {
  exchange: "mexc",
  getMarkets: getMexcMarkets,
  async getCandles(request: CandleRequest, signal?: AbortSignal): Promise<CandleResult> {
    const interval = MEXC_INTERVALS[request.timeframe];
    const end = request.end ?? Math.floor(Date.now() / 1000);
    const url = new URL(`https://contract.mexc.com/api/v1/contract/kline/${request.symbol}`);
    url.searchParams.set("interval", interval.api);
    url.searchParams.set("start", String(Math.max(0, end - interval.seconds * request.limit)));
    url.searchParams.set("end", String(end));
    const response = await fetch(url, { headers: { accept: "application/json" }, signal, cache: "no-store" });
    if (!response.ok) throw new Error("Candle feed unavailable");
    const payload = await response.json() as { success?: boolean; data?: unknown };
    const candles = payload.success ? normaliseCandles(payload.data, Math.floor(Date.now() / 1000), request.timeframe).slice(-request.limit) : [];
    if (!candles.length) throw new Error("Candle feed unavailable");
    return { source: "MEXC public contract API", exchange: "mexc", symbol: request.symbol, timeframe: request.timeframe, candles, receivedAt: Date.now(), nextEnd: candles[0].time - 1 };
  },
};
