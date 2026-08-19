import "server-only";
import type { Candle } from "../strategy";
import {
  globalAssetClass,
  globalMarketDisplayName,
  globalMarketKey,
  TWELVE_DATA_INTERVALS,
  type GlobalMarketDescriptor,
} from "./global";
import type { CandleTimeframe } from "./types";

type Raw = Record<string, unknown>;
type SearchCacheEntry = { markets: GlobalMarketDescriptor[]; receivedAt: number };

const SEARCH_TTL_MS = 60_000;
const SEARCH_CACHE_LIMIT = 200;
const searchCache = new Map<string, SearchCacheEntry>();

function apiKey() {
  const value = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!value) throw new Error("Twelve Data API key is not configured");
  return value;
}

function clean(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function providerHeaders() {
  return {
    accept: "application/json",
    authorization: `apikey ${apiKey()}`,
  };
}

function providerError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const message = clean((payload as Raw).message, 200);
    if (message) return new Error(message);
  }
  return new Error(fallback);
}

function normaliseSearchRows(input: unknown): GlobalMarketDescriptor[] {
  const rows = input && typeof input === "object" && Array.isArray((input as Raw).data)
    ? (input as { data: unknown[] }).data
    : [];
  const seen = new Set<string>();
  return rows.flatMap((value): GlobalMarketDescriptor[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Raw;
    const symbol = clean(row.symbol, 60).toUpperCase();
    if (!symbol || !/^[A-Z0-9./:_-]+$/.test(symbol)) return [];
    const exchange = clean(row.exchange, 80) || "GLOBAL";
    const instrumentType = clean(row.instrument_type, 80) || "Other";
    const name = clean(row.instrument_name, 140) || symbol;
    const currency = clean(row.currency, 24).toUpperCase() || "USD";
    const micCode = clean(row.mic_code, 24).toUpperCase() || undefined;
    const country = clean(row.country, 80) || undefined;
    const key = globalMarketKey(exchange, symbol);
    if (seen.has(key)) return [];
    seen.add(key);
    return [Object.freeze({
      key,
      provider: "twelvedata" as const,
      symbol,
      displayName: globalMarketDisplayName(symbol, name),
      name,
      exchange,
      ...(micCode ? { micCode } : {}),
      currency,
      ...(country ? { country } : {}),
      instrumentType,
      assetClass: globalAssetClass(instrumentType),
    })];
  });
}

export async function searchTwelveDataMarkets(query: string, signal?: AbortSignal) {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 80);
  if (normalized.length < 2) return { markets: [] as GlobalMarketDescriptor[], receivedAt: Date.now(), cached: false };
  const cacheKey = normalized.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.receivedAt < SEARCH_TTL_MS)
    return { ...cached, cached: true };

  const url = new URL("https://api.twelvedata.com/symbol_search");
  url.searchParams.set("symbol", normalized);
  url.searchParams.set("outputsize", "30");
  const response = await fetch(url, {
    headers: providerHeaders(),
    signal,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload && typeof payload === "object" && (payload as Raw).status === "error"))
    throw providerError(payload, "Global market search is unavailable");
  const entry = { markets: normaliseSearchRows(payload), receivedAt: Date.now() };
  if (searchCache.size >= SEARCH_CACHE_LIMIT) searchCache.delete(searchCache.keys().next().value ?? "");
  searchCache.set(cacheKey, entry);
  return { ...entry, cached: false };
}

function parseProviderTime(value: unknown) {
  const raw = clean(value, 32);
  if (!raw) return NaN;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00Z`
    : `${raw.replace(" ", "T")}Z`;
  return Math.floor(Date.parse(iso) / 1000);
}

function candleCloseTime(openSeconds: number, timeframe: CandleTimeframe) {
  if (timeframe === "1M") {
    const open = new Date(openSeconds * 1000);
    return Date.UTC(open.getUTCFullYear(), open.getUTCMonth() + 1, 1) / 1000;
  }
  const seconds: Record<Exclude<CandleTimeframe, "1M">, number> = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14_400,
    "8h": 28_800,
    "1d": 86_400,
    "1w": 604_800,
  };
  return openSeconds + seconds[timeframe];
}

export function normaliseTwelveDataCandles(input: unknown, timeframe: CandleTimeframe, nowSeconds = Math.floor(Date.now() / 1000)) {
  const values = input && typeof input === "object" && Array.isArray((input as Raw).values)
    ? (input as { values: unknown[] }).values
    : [];
  const candles = values.flatMap((value): Candle[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Raw;
    const candle: Candle = {
      time: parseProviderTime(row.datetime),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: row.volume == null || row.volume === "" ? 0 : Number(row.volume),
    };
    if (!Object.values(candle).every(Number.isFinite)) return [];
    if (candle.time <= 0 || candle.low > candle.high || candle.open < candle.low || candle.open > candle.high || candle.close < candle.low || candle.close > candle.high || candle.volume < 0) return [];
    if (candleCloseTime(candle.time, timeframe) > nowSeconds) return [];
    return [candle];
  });
  return [...new Map(candles.sort((a, b) => a.time - b.time).map(candle => [candle.time, candle])).values()];
}

export async function getTwelveDataCandles({
  symbol,
  exchange,
  micCode,
  timeframe,
  limit,
  signal,
}: {
  symbol: string;
  exchange?: string;
  micCode?: string;
  timeframe: CandleTimeframe;
  limit: number;
  signal?: AbortSignal;
}) {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", TWELVE_DATA_INTERVALS[timeframe]);
  url.searchParams.set("outputsize", String(Math.min(5000, limit + 2)));
  url.searchParams.set("order", "asc");
  url.searchParams.set("timezone", "UTC");
  if (micCode) url.searchParams.set("mic_code", micCode);
  else if (exchange && exchange !== "GLOBAL") url.searchParams.set("exchange", exchange);
  const response = await fetch(url, {
    headers: providerHeaders(),
    signal,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload && typeof payload === "object" && (payload as Raw).status === "error"))
    throw providerError(payload, "Global candle feed is unavailable");
  const candles = normaliseTwelveDataCandles(payload, timeframe).slice(-limit);
  if (!candles.length) throw new Error("Global candle feed is unavailable");
  return {
    source: "Twelve Data REST API",
    provider: "twelvedata" as const,
    symbol,
    exchange: exchange || "GLOBAL",
    timeframe,
    candles,
    receivedAt: Date.now(),
  };
}

export function resetTwelveDataSearchCache() {
  searchCache.clear();
}
