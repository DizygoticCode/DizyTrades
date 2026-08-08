import type { Candle } from "../strategy";
import type { CandleTimeframe } from "../market/types";
import type { DexChain, DexMarket } from "./types";

export const DIZY_MINT = "J9Bevbd4BS23cjoWbKazG1LGwRsAhr2iRQq6uo31BEaY";
export const DIZY_USDT_POOL = "2mH8umwN2FfEx23bzTUuTXjQZ5G9rLNuJ2VWEkgynowA";
export const DIZY_LOGO_URL = "https://gateway.irys.xyz/RAcoiCCewukn5Q9JMnHoMQK3nB8oFqrucA9GRTpNg16";

export const DIZY_USDT_MARKET: DexMarket = {
  key: `solana:${DIZY_MINT.toLowerCase()}:${DIZY_USDT_POOL.toLowerCase()}`,
  chain: "solana",
  tokenAddress: DIZY_MINT,
  poolAddress: DIZY_USDT_POOL,
  symbol: "DIZY",
  name: "DIZY",
  quoteSymbol: "USDT",
  dex: "raydium",
  logoUrl: DIZY_LOGO_URL,
  changes: {},
  labels: ["official", "canonical", "newly-created"],
};

const DEX_TIMEFRAME_SECONDS: Partial<Record<CandleTimeframe, number>> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "4h": 14_400,
  "1d": 86_400,
};

export function supportsDexChartTimeframe(timeframe: string): timeframe is CandleTimeframe {
  return Object.hasOwn(DEX_TIMEFRAME_SECONDS, timeframe);
}

export function canonicalDizyMatches(query: string, chain?: DexChain) {
  if (chain === "bsc") return false;
  const value = query.trim().toLowerCase();
  if (!value) return true;
  return [
    "dizy",
    "$dizy",
    "dizy/usdt",
    "dizy_usdt",
    DIZY_MINT.toLowerCase(),
    DIZY_USDT_POOL.toLowerCase(),
  ].some((candidate) => candidate.includes(value) || value.includes(candidate));
}

export function mergeCanonicalDizyMarkets(markets: DexMarket[], query: string, chain?: DexChain) {
  if (!canonicalDizyMatches(query, chain)) return markets;
  return [DIZY_USDT_MARKET, ...markets.filter((market) => market.poolAddress !== DIZY_USDT_POOL)];
}

/**
 * Gecko/CoinGecko OHLCV omits intervals with no trades by default. For charting,
 * represent those real quiet intervals as flat candles with zero volume, matching
 * CoinGecko's documented include_empty_intervals=true semantics. If an official
 * current pool price is available, use it only on the current interval; the next
 * OHLCV refresh will replace that provisional bar with the trade-derived candle.
 */
export function padDexOhlcv(
  candles: Candle[],
  timeframe: CandleTimeframe,
  nowMs = Date.now(),
  currentPrice?: number,
) {
  const seconds = DEX_TIMEFRAME_SECONDS[timeframe];
  if (!seconds || !candles.length) return [...candles];
  const ordered = [...candles].sort((a, b) => a.time - b.time);
  const currentBucket = Math.floor(Math.floor(nowMs / 1000) / seconds) * seconds;
  const padded: Candle[] = [];

  for (const candle of ordered) {
    const previous = padded.at(-1);
    if (previous) {
      for (let time = previous.time + seconds; time < candle.time; time += seconds) {
        padded.push({
          time,
          open: previous.close,
          high: previous.close,
          low: previous.close,
          close: previous.close,
          volume: 0,
        });
      }
    }
    padded.push(candle);
  }

  let previous = padded.at(-1)!;
  for (let time = previous.time + seconds; time <= currentBucket; time += seconds) {
    const livePrice = time === currentBucket && Number.isFinite(currentPrice)
      ? Number(currentPrice)
      : previous.close;
    const next: Candle = {
      time,
      open: previous.close,
      high: Math.max(previous.close, livePrice),
      low: Math.min(previous.close, livePrice),
      close: livePrice,
      volume: 0,
    };
    padded.push(next);
    previous = next;
  }

  if (padded.at(-1)?.time === currentBucket && Number.isFinite(currentPrice)) {
    const last = padded.at(-1)!;
    const price = Number(currentPrice);
    padded[padded.length - 1] = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    };
  }

  return padded;
}

export function splitDexOhlcv(candles: Candle[], timeframe: CandleTimeframe, nowMs = Date.now()) {
  const seconds = DEX_TIMEFRAME_SECONDS[timeframe];
  if (!seconds || !candles.length) return { closed: candles, live: null as Candle | null };
  const ordered = [...candles].sort((a, b) => a.time - b.time);
  const latest = ordered.at(-1)!;
  const live = latest.time + seconds > Math.floor(nowMs / 1000) ? latest : null;
  return { closed: live ? ordered.slice(0, -1) : ordered, live };
}
