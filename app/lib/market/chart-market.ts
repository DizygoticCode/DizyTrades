import type { DexMarket } from "../dex/types";
import { splitDexOhlcv, supportsDexChartTimeframe } from "../dex/dizy";
import type { Candle } from "../strategy";
import type { GlobalAssetClass, GlobalMarketDescriptor } from "./global";
import {
  CANDLE_TIMEFRAMES,
  type CandleTimeframe,
  type MarketDescriptor,
  type MarketType,
} from "./types";

export type ChartMarketProviderId = "mexc" | "dizydex" | "twelvedata";
export type ChartMarketKind = MarketType | "pool" | "global";
export type ChartMarketRealtimeMode = "stream" | "refresh";

export type ChartMarketProviderMetadata = Readonly<{
  id: ChartMarketProviderId;
  label: string;
  venue: string;
  network?: string;
}>;

export type ChartMarketCapabilities = Readonly<{
  timeframes: readonly CandleTimeframe[];
  realtime: ChartMarketRealtimeMode;
  refreshMs: number | null;
  executedTrades: boolean;
  orderBook: boolean;
  minimumHistory: number;
}>;

export type ChartMarketInstrument = Readonly<{
  key: string;
  provider: ChartMarketProviderMetadata;
  providerSymbol: string;
  kind: ChartMarketKind;
  displayName: string;
  baseAsset: string;
  quoteAsset: string;
  marketType?: MarketType;
  contractSize: number;
  poolAddress?: string;
  tokenAddress?: string;
  chain?: string;
  exchange?: string;
  micCode?: string;
  assetClass?: GlobalAssetClass;
  capabilities: ChartMarketCapabilities;
}>;

const MEXC_TIMEFRAMES = Object.freeze([...CANDLE_TIMEFRAMES]);
const DEX_TIMEFRAMES = Object.freeze(
  CANDLE_TIMEFRAMES.filter((timeframe) => supportsDexChartTimeframe(timeframe)),
);
const GLOBAL_TIMEFRAMES = Object.freeze([...CANDLE_TIMEFRAMES]);

export function createMexcChartMarket(
  market: MarketDescriptor | undefined,
  fallbackSymbol: string,
): ChartMarketInstrument {
  const marketType = market?.marketType ?? "futures";
  const providerSymbol = market?.sourceSymbol ?? fallbackSymbol;
  return Object.freeze({
    key: market?.key ?? `mexc:${marketType}:${providerSymbol}`,
    provider: Object.freeze({
      id: "mexc" as const,
      label: "MEXC",
      venue: marketType === "spot" ? "Spot" : "Futures",
    }),
    providerSymbol,
    kind: marketType,
    displayName: market?.displayName ?? providerSymbol.replace("_", " / "),
    baseAsset: market?.baseAsset ?? providerSymbol.split("_")[0] ?? providerSymbol,
    quoteAsset: market?.quoteAsset ?? providerSymbol.split("_")[1] ?? "USDT",
    marketType,
    contractSize: market?.contractSize ?? 1,
    capabilities: Object.freeze({
      timeframes: MEXC_TIMEFRAMES,
      realtime: marketType === "futures" ? "stream" as const : "refresh" as const,
      refreshMs: marketType === "spot" ? 10_000 : null,
      executedTrades: marketType === "futures",
      orderBook: marketType === "futures",
      minimumHistory: 20,
    }),
  });
}

export function createDexChartMarket(market: DexMarket): ChartMarketInstrument {
  return Object.freeze({
    key: `dex:${market.key}`,
    provider: Object.freeze({
      id: "dizydex" as const,
      label: "DizyDEX",
      venue: market.dex,
      network: market.chain,
    }),
    providerSymbol: market.poolAddress,
    kind: "pool" as const,
    displayName: `${market.symbol} / ${market.quoteSymbol}`,
    baseAsset: market.symbol,
    quoteAsset: market.quoteSymbol,
    contractSize: 1,
    poolAddress: market.poolAddress,
    tokenAddress: market.tokenAddress,
    chain: market.chain,
    capabilities: Object.freeze({
      timeframes: DEX_TIMEFRAMES,
      realtime: "refresh" as const,
      refreshMs: 65_000,
      executedTrades: false,
      orderBook: false,
      minimumHistory: 1,
    }),
  });
}

export function createGlobalChartMarket(market: GlobalMarketDescriptor): ChartMarketInstrument {
  return Object.freeze({
    key: market.key,
    provider: Object.freeze({
      id: "twelvedata" as const,
      label: "Twelve Data",
      venue: market.exchange,
    }),
    providerSymbol: market.symbol,
    kind: "global" as const,
    displayName: market.displayName,
    baseAsset: market.symbol,
    quoteAsset: market.currency,
    contractSize: 1,
    exchange: market.exchange,
    micCode: market.micCode,
    assetClass: market.assetClass,
    capabilities: Object.freeze({
      timeframes: GLOBAL_TIMEFRAMES,
      realtime: "refresh" as const,
      refreshMs: 30_000,
      executedTrades: false,
      orderBook: false,
      minimumHistory: 20,
    }),
  });
}

export function chartMarketSupportsTimeframe(
  market: ChartMarketInstrument,
  timeframe: string,
): timeframe is CandleTimeframe {
  return market.capabilities.timeframes.includes(timeframe as CandleTimeframe);
}

export function chartMarketCandleEndpoint(
  market: ChartMarketInstrument,
  timeframe: CandleTimeframe,
  limit: number,
) {
  if (!chartMarketSupportsTimeframe(market, timeframe))
    throw new Error("Unsupported chart timeframe");
  if (market.provider.id === "mexc") {
    const params = new URLSearchParams({
      exchange: "mexc",
      marketType: market.marketType ?? "futures",
      symbol: market.providerSymbol,
      timeframe,
      limit: String(limit),
    });
    return `/api/market?${params.toString()}`;
  }
  if (market.provider.id === "twelvedata") {
    const params = new URLSearchParams({
      symbol: market.providerSymbol,
      exchange: market.exchange ?? market.provider.venue,
      timeframe,
      limit: String(Math.min(limit, 2000)),
    });
    if (market.micCode) params.set("mic", market.micCode);
    return `/api/global-markets/candles?${params.toString()}`;
  }
  if (!market.poolAddress || !market.chain)
    throw new Error("Incomplete DEX chart market identity");
  const params = new URLSearchParams({
    chain: market.chain,
    pool: market.poolAddress,
    interval: timeframe,
    limit: String(Math.min(limit, 1000)),
  });
  return `/api/dex/ohlcv?${params.toString()}`;
}

export function chartMarketTimeline(
  market: ChartMarketInstrument,
  candles: Candle[],
  timeframe: CandleTimeframe,
) {
  return market.provider.id === "dizydex"
    ? splitDexOhlcv(candles, timeframe)
    : { closed: candles, live: null as Candle | null };
}
