import "server-only";
import { BoundedTtlCache } from "./cache";
import { mapGeckoOhlcv, normaliseDexScreener } from "./normalise";
import type { Candle } from "../strategy";
import type { DexPage, DexProvider } from "./types";
/* GeckoTerminal's sparse JSON:API relationships are normalised immediately. */
/* eslint-disable @typescript-eslint/no-explicit-any */

const DEXSCREENER_URL=process.env.DEXSCREENER_API_URL ?? "https://api.dexscreener.com";
const GECKO_URL=process.env.GECKOTERMINAL_API_URL ?? "https://api.geckoterminal.com/api/v2";
const RAYDIUM_V3_URL=process.env.RAYDIUM_API_V3_URL ?? "https://api-v3.raydium.io";
const cache=new BoundedTtlCache<DexPage>(80,30_000);
// GeckoTerminal's public API is cached upstream for about one minute. Share that
// result across browser sessions instead of making every terminal tab hit upstream.
const ohlcvCache=new BoundedTtlCache<Candle[]>(120,55_000);
// If the public endpoint briefly rate-limits or flakes, a recently confirmed chart
// is safer than deleting the user's working market view.
const staleOhlcvCache=new BoundedTtlCache<Candle[]>(120,10*60_000);
// Raydium documents API v3 as its canonical UI/integration price surface. Its own
// edge cache is short-lived; sharing the result here avoids needless duplicate hits.
const raydiumPriceCache=new BoundedTtlCache<number>(80,30_000);
const geckoHeaders=()=>({accept:"application/json;version=20230203",...(process.env.GECKOTERMINAL_API_KEY?{"x-cg-pro-api-key":process.env.GECKOTERMINAL_API_KEY}:{})});
/** Preserve the /api/v2 base path: leading-slash URL paths silently dropped it and caused GeckoTerminal 404s. */
export const geckoUrl=(path:string)=>new URL(`${GECKO_URL.replace(/\/$/,"")}/${path.replace(/^\//,"")}`);

export async function raydiumMintPrice(mint:string,signal?:AbortSignal){
  const cached=raydiumPriceCache.get(mint); if(cached!==undefined)return cached;
  const url=new URL("/mint/price",RAYDIUM_V3_URL); url.searchParams.set("mints",mint);
  const response=await fetch(url,{headers:{accept:"application/json"},signal,cache:"no-store"});
  if(!response.ok)throw new Error(`Raydium API v3 returned ${response.status}`);
  const payload=await response.json() as {success?:boolean;data?:Record<string,string|number|null>};
  const price=Number(payload.data?.[mint]);
  if(payload.success===false||!Number.isFinite(price)||price<=0)throw new Error("Raydium API v3 returned no usable mint price");
  raydiumPriceCache.set(mint,price); return price;
}

export const documentedDexProvider: DexProvider = {
  id:"DEX Screener + GeckoTerminal",
  async discover({query="",chain,cursor},signal){
    const page=Math.max(1,Math.min(20,Number(cursor)||1));
    const key=`${query}|${chain}|${page}`, hit=cache.get(key); if(hit)return {...hit,cached:true};
    // Search is exact-contract capable. Empty discovery is intentionally page-sized,
    // delegated to GeckoTerminal rather than accumulating a global token directory.
    const url=query ? new URL("/latest/dex/search",DEXSCREENER_URL) : geckoUrl(`networks/${chain === "bsc" ? "bsc" : "solana"}/pools`);
    if(query) url.searchParams.set("q",query); else url.searchParams.set("page",String(page));
    const response=await fetch(url,{headers:query?{accept:"application/json"}:geckoHeaders(),signal,cache:"no-store"});
    if(!response.ok) throw new Error(`${query?"DEX Screener":"GeckoTerminal"} returned ${response.status}`);
    const payload=await response.json();
    // Gecko discovery is adapted into the same documented pair shape.
    const shaped=query?payload:{pairs:(payload.data??[]).map((x:any)=>({chainId:chain??"solana",pairAddress:x.attributes?.address,baseToken:{address:x.relationships?.base_token?.data?.id?.split("_").at(-1),symbol:x.attributes?.name?.split(" /")[0],name:x.attributes?.name?.split(" /")[0]},quoteToken:{symbol:x.attributes?.name?.split("/ ").at(-1)},dexId:x.relationships?.dex?.data?.id,priceUsd:x.attributes?.base_token_price_usd,pairCreatedAt:x.attributes?.pool_created_at?Date.parse(x.attributes.pool_created_at):undefined,liquidity:{usd:x.attributes?.reserve_in_usd},volume:{h24:x.attributes?.volume_usd?.h24},priceChange:x.attributes?.price_change_percentage,txns:{h24:x.attributes?.transactions?.h24}}))};
    const result={markets:normaliseDexScreener(shaped).filter((m)=>!chain||m.chain===chain),nextCursor:query?undefined:String(page+1),provider:this.id,receivedAt:Date.now()}; cache.set(key,result); return result;
  },
  async candles({chain,poolAddress,tokenAddress,interval,limit},signal){
    const safeLimit=Math.min(limit,1000), key=`${chain}|${poolAddress}|${tokenAddress??"base"}|${interval}|${safeLimit}`;
    const cached=ohlcvCache.get(key); if(cached)return cached;
    const timeframe=interval.endsWith("m")?"minute":interval.endsWith("h")?"hour":"day";
    const aggregate=Math.max(1,parseInt(interval)); const url=geckoUrl(`networks/${chain === "bsc" ? "bsc" : "solana"}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${timeframe}`);
    url.searchParams.set("aggregate",String(aggregate)); url.searchParams.set("limit",String(safeLimit)); url.searchParams.set("currency","usd");
    if(tokenAddress)url.searchParams.set("token",tokenAddress);
    try {
      const response=await fetch(url,{headers:geckoHeaders(),signal,cache:"no-store"});
      if(!response.ok)throw new Error(`GeckoTerminal returned ${response.status}`);
      const candles=mapGeckoOhlcv(await response.json());
      ohlcvCache.set(key,candles); staleOhlcvCache.set(key,candles); return candles;
    } catch(error) {
      const stale=staleOhlcvCache.get(key); if(stale)return stale;
      throw error;
    }
  }
};
