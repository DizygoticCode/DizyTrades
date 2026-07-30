import type { MarketInstrument } from "./types.ts";

export type MarketTab = "favorites" | "all" | "spot" | "futures" | "perpetual" | "delivery" | "pre-market" | "new" | "hot";
export function searchMarkets(markets: MarketInstrument[], query: string, tab: MarketTab, quote: string, favorites: ReadonlySet<string>, now = Date.now()) {
  const words = query.trim().toUpperCase().split(/\s+/).filter(Boolean);
  return markets.filter((market) => {
    if (tab === "favorites" && !favorites.has(market.key)) return false;
    if (tab === "spot" && market.marketType !== "spot") return false;
    if (tab === "futures" && market.marketType !== "futures") return false;
    if (["perpetual", "delivery", "pre-market"].includes(tab) && market.contractType !== tab) return false;
    if (tab === "new" && (!market.listedAt || now - market.listedAt > 30 * 86_400_000)) return false;
    if (tab === "hot" && !(market.volume24h && market.volume24h > 0)) return false;
    if (quote !== "All" && (quote === "Other" ? ["USDT", "USDC", "BTC", "ETH", "MX"].includes(market.settlementAsset || market.quoteAsset) : (market.settlementAsset || market.quoteAsset) !== quote)) return false;
    const haystack = [market.sourceSymbol, market.displayName, market.contractDisplayName, market.fullName, market.baseAsset, market.quoteAsset].join(" ").toUpperCase();
    return words.every((word) => haystack.includes(word));
  }).sort((a, b) => Number(favorites.has(b.key)) - Number(favorites.has(a.key)) || (b.volume24h ?? 0) - (a.volume24h ?? 0) || a.displayName.localeCompare(b.displayName));
}

export const marketBadge = (market: MarketInstrument) => market.contractType === "spot" ? "SPOT" : market.contractType === "perpetual" ? "PERP" : market.contractType === "delivery" ? "DELIVERY" : "PRE-MARKET";
export const marketSubtitle = (market: MarketInstrument) => market.marketType === "spot" ? `${market.fullName} · Spot market quoted in ${market.quoteAsset}` : `${market.fullName} · ${market.settlementAsset}-settled ${market.contractType}`;
