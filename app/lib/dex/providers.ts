import "server-only";
import { BoundedTtlCache } from "./cache";
import { mapGeckoOhlcv, normaliseDexScreener } from "./normalise";
import type { DexPage, DexProvider } from "./types";
/* GeckoTerminal's sparse JSON:API relationships are normalised immediately. */
/* eslint-disable @typescript-eslint/no-explicit-any */

const DEXSCREENER_URL=process.env.DEXSCREENER_API_URL ?? "https://api.dexscreener.com";
const GECKO_URL=process.env.GECKOTERMINAL_API_URL ?? "https://api.geckoterminal.com/api/v2";
const cache=new BoundedTtlCache<DexPage>(80,30_000);
/** Preserve the /api/v2 base path: leading-slash URL paths silently dropped it and caused GeckoTerminal 404s. */
export const geckoUrl=(path:string)=>new URL(`${GECKO_URL.replace(/\/$/,"")}/${path.replace(/^\//,"")}`);
export const documentedDexProvider: DexProvider = {
  id:"DEX Screener + GeckoTerminal",
  async discover({query="",chain,cursor},signal){
    const page=Math.max(1,Math.min(20,Number(cursor)||1));
    const key=`${query}|${chain}|${page}`, hit=cache.get(key); if(hit)return {...hit,cached:true};
    // Search is exact-contract capable. Empty discovery is intentionally page-sized,
    // delegated to GeckoTerminal rather than accumulating a global token directory.
    const url=query ? new URL("/latest/dex/search",DEXSCREENER_URL) : geckoUrl(`networks/${chain === "bsc" ? "bsc" : "solana"}/pools`);
    if(query) url.searchParams.set("q",query); else url.searchParams.set("page",String(page));
    const response=await fetch(url,{headers:{accept:"application/json",...(process.env.GECKOTERMINAL_API_KEY?{"x-cg-pro-api-key":process.env.GECKOTERMINAL_API_KEY}:{})},signal,cache:"no-store"});
    if(!response.ok) throw new Error(`${query?"DEX Screener":"GeckoTerminal"} returned ${response.status}`);
    const payload=await response.json();
    // Gecko discovery is adapted into the same documented pair shape.
    const shaped=query?payload:{pairs:(payload.data??[]).map((x:any)=>({chainId:chain??"solana",pairAddress:x.attributes?.address,baseToken:{address:x.relationships?.base_token?.data?.id?.split("_").at(-1),symbol:x.attributes?.name?.split(" /")[0],name:x.attributes?.name?.split(" /")[0]},quoteToken:{symbol:x.attributes?.name?.split("/ ").at(-1)},dexId:x.relationships?.dex?.data?.id,priceUsd:x.attributes?.base_token_price_usd,pairCreatedAt:x.attributes?.pool_created_at?Date.parse(x.attributes.pool_created_at):undefined,liquidity:{usd:x.attributes?.reserve_in_usd},volume:{h24:x.attributes?.volume_usd?.h24},priceChange:x.attributes?.price_change_percentage,txns:{h24:x.attributes?.transactions?.h24}}))};
    const result={markets:normaliseDexScreener(shaped).filter((m)=>!chain||m.chain===chain),nextCursor:query?undefined:String(page+1),provider:this.id,receivedAt:Date.now()}; cache.set(key,result); return result;
  },
  async candles({chain,poolAddress,interval,limit},signal){
    const timeframe=interval.endsWith("m")?"minute":interval.endsWith("h")?"hour":"day";
    const aggregate=Math.max(1,parseInt(interval)); const url=geckoUrl(`networks/${chain === "bsc" ? "bsc" : "solana"}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${timeframe}`);
    url.searchParams.set("aggregate",String(aggregate)); url.searchParams.set("limit",String(Math.min(limit,1000))); url.searchParams.set("currency","usd");
    const response=await fetch(url,{headers:{accept:"application/json"},signal,cache:"no-store"}); if(!response.ok)throw new Error(`GeckoTerminal returned ${response.status}`); return mapGeckoOhlcv(await response.json());
  }
};
