import type { DexChain, DexMarket } from "./types";
/* Provider payloads are runtime-validated field-by-field below. */
/* eslint-disable @typescript-eslint/no-explicit-any */

const finite = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const chain = (value: unknown): DexChain | undefined => value === "solana" ? "solana" : value === "bsc" ? "bsc" : undefined;

export function normaliseDexScreener(input: unknown): DexMarket[] {
  const pairs = Array.isArray((input as { pairs?: unknown })?.pairs) ? (input as { pairs: unknown[] }).pairs : [];
  const seen = new Set<string>();
  return pairs.flatMap((raw): DexMarket[] => {
    if (!raw || typeof raw !== "object") return [];
    const p = raw as Record<string, any>, network = chain(p.chainId);
    const tokenAddress = text(p.baseToken?.address), poolAddress = text(p.pairAddress);
    if (!network || !tokenAddress || !poolAddress) return [];
    const key = `${network}:${tokenAddress.toLowerCase()}:${poolAddress.toLowerCase()}`;
    if (seen.has(key)) return []; seen.add(key);
    const liquidity = finite(p.liquidity?.usd), createdAt = finite(p.pairCreatedAt);
    const labels = ["unverified"];
    if (liquidity !== undefined && liquidity < 10_000) labels.push("very-low-liquidity");
    if (createdAt !== undefined && Date.now() - createdAt < 86_400_000) labels.push("newly-created");
    return [{ key, chain: network, tokenAddress, poolAddress, symbol: text(p.baseToken?.symbol) || "?", name: text(p.baseToken?.name) || "Unknown token", quoteSymbol: text(p.quoteToken?.symbol) || "?", dex: text(p.dexId) || "Unknown DEX", logoUrl: text(p.info?.imageUrl) || undefined, createdAt, priceUsd: finite(p.priceUsd), liquidityUsd: liquidity, volume24h: finite(p.volume?.h24), marketCap: finite(p.marketCap), fdv: finite(p.fdv), changes: { m5: finite(p.priceChange?.m5), h1: finite(p.priceChange?.h1), h6: finite(p.priceChange?.h6), h24: finite(p.priceChange?.h24) }, buys24h: finite(p.txns?.h24?.buys), sells24h: finite(p.txns?.h24?.sells), labels }];
  });
}

export function choosePool(markets: DexMarket[], tokenAddress: string) {
  return markets.filter((m) => m.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()).sort((a,b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1))[0];
}

export function mapGeckoOhlcv(input: unknown) {
  const rows = (input as any)?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r: unknown) => Array.isArray(r) && r.length >= 6 && r.slice(0,6).every(Number.isFinite) ? [{ time:Number(r[0]), open:Number(r[1]), high:Number(r[2]), low:Number(r[3]), close:Number(r[4]), volume:Number(r[5]) }] : []).sort((a,b)=>a.time-b.time);
}
