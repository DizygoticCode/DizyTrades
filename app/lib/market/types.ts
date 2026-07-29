import type { Candle } from "../strategy";

export type ExchangeId = "mexc";
export type MarketType = "perpetual";
export const CANDLE_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "8h", "1d", "1w", "1M"] as const;
export type CandleTimeframe = (typeof CANDLE_TIMEFRAMES)[number];

export type MarketDescriptor = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  displayName: string;
  base: string;
  quote: string;
  settlementCurrency: string;
  state: "enabled";
  pricePrecision: number;
  priceScale?: number;
  priceUnit?: string;
  depthStepList?: string[];
  contractSize?: number;
  maxLeverage?: number;
};

export type CandleRequest = {
  exchange: ExchangeId;
  symbol: string;
  timeframe: CandleTimeframe;
  limit: number;
  end?: number;
};

export type CandleResult = {
  source: "MEXC public contract API";
  exchange: ExchangeId;
  symbol: string;
  timeframe: CandleTimeframe;
  candles: Candle[];
  receivedAt: number;
  nextEnd?: number;
};

export interface MarketProvider {
  readonly exchange: ExchangeId;
  getMarkets(signal?: AbortSignal): Promise<MarketDescriptor[]>;
  getCandles(request: CandleRequest, signal?: AbortSignal): Promise<CandleResult>;
}
