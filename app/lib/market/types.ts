import type { Candle } from "../strategy";

export type ExchangeId = "mexc";
export type MarketType = "spot" | "futures";
export type ContractType = "spot" | "perpetual" | "delivery" | "pre-market";
export const CANDLE_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "8h", "1d", "1w", "1M"] as const;
export type CandleTimeframe = (typeof CANDLE_TIMEFRAMES)[number];

/** Exchange-neutral market identity. `sourceSymbol` is never used as identity. */
export type MarketInstrument = {
  key: `mexc:${MarketType}:${string}`;
  exchange: ExchangeId;
  marketType: MarketType;
  contractType: ContractType;
  sourceSymbol: string;
  symbol: string; // compatibility alias for older chart and paper APIs
  displayName: string;
  contractDisplayName: string;
  baseAsset: string;
  quoteAsset: string;
  settlementAsset: string;
  base: string; // compatibility aliases
  quote: string;
  fullName: string;
  status: "active";
  state: "enabled";
  pricePrecision: number;
  quantityPrecision?: number;
  priceScale?: number;
  priceUnit?: string;
  depthStepList?: string[];
  contractSize?: number;
  maxLeverage?: number;
  listedAt?: number;
  lastPrice?: number;
  change24h?: number;
  volume24h?: number;
};
export type MarketDescriptor = MarketInstrument;

export type CandleRequest = { exchange: ExchangeId; instrument: MarketInstrument; timeframe: CandleTimeframe; limit: number; end?: number };
export type CandleResult = { source: "MEXC public contract API" | "MEXC public spot API"; exchange: ExchangeId; marketKey: string; symbol: string; timeframe: CandleTimeframe; candles: Candle[]; receivedAt: number; nextEnd?: number };
export interface MarketProvider { readonly exchange: ExchangeId; getMarkets(signal?: AbortSignal): Promise<MarketInstrument[]>; getCandles(request: CandleRequest, signal?: AbortSignal): Promise<CandleResult>; }
