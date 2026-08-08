import type { Candle } from "../strategy";

export type DexChain = "solana" | "bsc";
export type DexMarket = {
  key: string; chain: DexChain; tokenAddress: string; poolAddress: string;
  symbol: string; name: string; quoteSymbol: string; dex: string; logoUrl?: string;
  createdAt?: number; priceUsd?: number; liquidityUsd?: number; volume24h?: number;
  marketCap?: number; fdv?: number; changes: Partial<Record<"m5"|"h1"|"h6"|"h24", number>>;
  buys24h?: number; sells24h?: number; labels: string[];
};
export type DexPage = { markets: DexMarket[]; nextCursor?: string; provider: string; degraded?: string; cached?: boolean; receivedAt?: number };
export interface DexProvider {
  readonly id: string;
  discover(input: { query?: string; chain?: DexChain; cursor?: string }, signal?: AbortSignal): Promise<DexPage>;
  candles(input: { chain: DexChain; poolAddress: string; tokenAddress?: string; interval: string; limit: number }, signal?: AbortSignal): Promise<Candle[]>;
}
