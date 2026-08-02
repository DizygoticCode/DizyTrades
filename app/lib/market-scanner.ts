import type { MarketDescriptor } from "./market/types";
import type { Candle, StrategyAnalysis } from "./strategy";

export const SCANNER_MARKET_LIMIT = 24;
export const SCANNER_SIGNAL_FRESH_BARS = 20;

export type ScannerRow = Readonly<{
  marketKey: string;
  symbol: string;
  displayName: string;
  marketType: "spot" | "futures";
  timeframe: string;
  lastPrice: number | null;
  change24h: number | null;
  volume24h: number | null;
  bias: StrategyAnalysis["bias"];
  phase: string;
  scoreLong: number;
  scoreShort: number;
  setupScore: number;
  setupDirection: "long" | "short" | "neutral";
  latestSignal: "buy" | "sell" | null;
  latestSignalConfluence: number | null;
  signalAgeBars: number | null;
  candleCount: number;
  finalCandleTime: number | null;
}>;

export type ScannerSort = "setup" | "signal" | "change" | "volume" | "market";

const finiteOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function scannerUniverse(
  markets: readonly MarketDescriptor[],
  favourites: readonly string[],
  limit = SCANNER_MARKET_LIMIT,
): MarketDescriptor[] {
  const active = markets.filter(market => market.status === "active");
  const byKey = new Map(active.map(market => [market.key, market]));
  const selected = favourites.map(key => byKey.get(key)).filter((market): market is MarketDescriptor => Boolean(market));
  const fallback = [...active]
    .filter(market => market.marketType === "futures")
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
  const combined = selected.length ? [...selected, ...fallback] : fallback;
  return [...new Map(combined.map(market => [market.key, market])).values()].slice(0, Math.max(1, Math.min(SCANNER_MARKET_LIMIT, limit)));
}

export function buildScannerRow(
  market: MarketDescriptor,
  candles: readonly Candle[],
  analysis: StrategyAnalysis,
  timeframe: string,
): ScannerRow {
  const latestSignal = analysis.tradeSignals.at(-1) ?? null;
  const signalIndex = latestSignal ? candles.findLastIndex(candle => candle.time === latestSignal.time) : -1;
  const signalAgeBars = signalIndex >= 0 ? Math.max(0, candles.length - 1 - signalIndex) : null;
  const signalFresh = signalAgeBars !== null && signalAgeBars <= SCANNER_SIGNAL_FRESH_BARS;
  const setupDirection = analysis.scoreLong > analysis.scoreShort
    ? "long"
    : analysis.scoreShort > analysis.scoreLong
      ? "short"
      : "neutral";
  return Object.freeze({
    marketKey: market.key,
    symbol: market.sourceSymbol,
    displayName: market.displayName,
    marketType: market.marketType,
    timeframe,
    lastPrice: finiteOrNull(market.lastPrice ?? candles.at(-1)?.close),
    change24h: finiteOrNull(market.change24h),
    volume24h: finiteOrNull(market.volume24h),
    bias: analysis.bias,
    phase: analysis.phase,
    scoreLong: analysis.scoreLong,
    scoreShort: analysis.scoreShort,
    setupScore: Math.max(analysis.scoreLong, analysis.scoreShort),
    setupDirection,
    latestSignal: signalFresh ? latestSignal?.direction ?? null : null,
    latestSignalConfluence: signalFresh ? latestSignal?.confluence ?? null : null,
    signalAgeBars: signalFresh ? signalAgeBars : null,
    candleCount: candles.length,
    finalCandleTime: candles.at(-1)?.time ?? null,
  });
}

export function sortScannerRows(rows: readonly ScannerRow[], sort: ScannerSort, descending = true): ScannerRow[] {
  const direction = descending ? -1 : 1;
  const signalRank = (row: ScannerRow) => row.latestSignal ? Math.max(0, 100 - (row.signalAgeBars ?? 100)) + (row.latestSignalConfluence ?? 0) * 10 : -1;
  const value = (row: ScannerRow): number | string => {
    switch (sort) {
      case "setup": return row.setupScore;
      case "signal": return signalRank(row);
      case "change": return row.change24h ?? Number.NEGATIVE_INFINITY;
      case "volume": return row.volume24h ?? Number.NEGATIVE_INFINITY;
      case "market": return row.displayName;
    }
  };
  return [...rows].sort((a, b) => {
    const av = value(a), bv = value(b);
    const result = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
    return result * direction || a.displayName.localeCompare(b.displayName);
  });
}

export function normaliseWatchlist(keys: readonly string[], markets: readonly MarketDescriptor[]): string[] {
  const valid = new Set(markets.map(market => market.key));
  return [...new Set(keys.filter(key => valid.has(key)))].slice(0, SCANNER_MARKET_LIMIT);
}
