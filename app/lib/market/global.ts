import type { CandleTimeframe } from "./types";

export type GlobalMarketProviderId = "twelvedata";
export type GlobalAssetClass = "stock" | "etf" | "forex" | "crypto" | "index" | "fund" | "bond" | "other";

export type GlobalMarketDescriptor = Readonly<{
  key: `twelvedata:${string}:${string}`;
  provider: GlobalMarketProviderId;
  symbol: string;
  displayName: string;
  name: string;
  exchange: string;
  micCode?: string;
  currency: string;
  country?: string;
  instrumentType: string;
  assetClass: GlobalAssetClass;
}>;

export const TWELVE_DATA_INTERVALS: Readonly<Record<CandleTimeframe, string>> = Object.freeze({
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "4h": "4h",
  "8h": "8h",
  "1d": "1day",
  "1w": "1week",
  "1M": "1month",
});

export function globalAssetClass(instrumentType: string): GlobalAssetClass {
  const type = instrumentType.toLowerCase();
  if (/exchange-traded|\betf\b/.test(type)) return "etf";
  if (/physical currency|forex|foreign exchange|currency pair/.test(type)) return "forex";
  if (/digital currency|crypto/.test(type)) return "crypto";
  if (/index/.test(type)) return "index";
  if (/fund|trust|closed-end/.test(type)) return "fund";
  if (/bond/.test(type)) return "bond";
  if (/stock|equity|depositary receipt|partnership|reit|preferred|warrant|right|unit/.test(type)) return "stock";
  return "other";
}

export function globalMarketKey(exchange: string, symbol: string) {
  return `twelvedata:${encodeURIComponent(exchange.trim().toUpperCase())}:${encodeURIComponent(symbol.trim().toUpperCase())}` as const;
}

export function globalMarketDisplayName(symbol: string, name: string) {
  const cleanSymbol = symbol.trim().toUpperCase();
  const cleanName = name.trim();
  return cleanName && cleanName.toUpperCase() !== cleanSymbol ? `${cleanSymbol} · ${cleanName}` : cleanSymbol;
}
