import "server-only";
import type { Candle } from "../strategy";
import { MEXC_INTERVALS } from "./mexc-shared.ts";
import type { CandleRequest, CandleResult, CandleTimeframe, MarketInstrument, MarketProvider } from "./types.ts";
export { isCandleTimeframe, MEXC_INTERVALS } from "./mexc-shared.ts";

type Raw = Record<string, unknown>;
const finite = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const precision = (value: unknown, fallback = 8) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
const nameOf = (asset: string) => ({ BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "XRP", USDT: "Tether", USDC: "USD Coin", MX: "MX Token" })[asset] ?? asset;

export function normaliseMexcFutures(input: unknown): MarketInstrument[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap((value): MarketInstrument[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Raw, sourceSymbol = String(item.symbol ?? "").toUpperCase();
    const [symbolBase, symbolQuote] = sourceSymbol.split("_");
    const baseAsset = String(item.baseCoin ?? symbolBase ?? "").toUpperCase(), quoteAsset = String(item.quoteCoin ?? symbolQuote ?? "").toUpperCase();
    const settlementAsset = String(item.settleCoin ?? quoteAsset).toUpperCase();
    const rawType = String(item.contractType ?? item.futureType ?? "").toLowerCase();
    const contractType = item.deliveryTime ? "delivery" : /pre/.test(rawType) ? "pre-market" : /delivery|quarter/.test(rawType) ? "delivery" : "perpetual";
    const key = `mexc:futures:${sourceSymbol}` as const;
    if (!/^[A-Z0-9]{1,30}_[A-Z0-9]{1,30}$/.test(sourceSymbol) || !baseAsset || !quoteAsset || Number(item.state) !== 0 || item.isHidden === true || Number(item.isHidden) === 1 || item.display === false || seen.has(key)) return [];
    seen.add(key); const priceScale = precision(item.priceScale);
    return [{ key, exchange: "mexc", marketType: "futures", contractType, sourceSymbol, symbol: sourceSymbol, displayName: `${baseAsset} / ${quoteAsset}`, contractDisplayName: String(item.displayName ?? `${baseAsset}/${quoteAsset} ${contractType}`), baseAsset, quoteAsset, settlementAsset, base: baseAsset, quote: quoteAsset, fullName: nameOf(baseAsset), status: "active", state: "enabled", pricePrecision: priceScale, priceScale, priceUnit: finite(item.priceUnit)?.toString(), quantityPrecision: precision(item.volScale, 0), depthStepList: Array.isArray(item.depthStepList) ? item.depthStepList.map(String).filter(v => Number(v) > 0) : undefined, contractSize: finite(item.contractSize), maxLeverage: finite(item.maxLeverage), listedAt: finite(item.createTime) }];
  });
}
export const sanitiseMexcMarkets = normaliseMexcFutures;

export function normaliseMexcSpot(input: unknown): MarketInstrument[] {
  const symbols = input && typeof input === "object" && Array.isArray((input as Raw).symbols) ? (input as { symbols: unknown[] }).symbols : [];
  const seen = new Set<string>();
  return symbols.flatMap((value): MarketInstrument[] => {
    if (!value || typeof value !== "object") return []; const item = value as Raw;
    const sourceSymbol = String(item.symbol ?? "").toUpperCase(), baseAsset = String(item.baseAsset ?? "").toUpperCase(), quoteAsset = String(item.quoteAsset ?? "").toUpperCase();
    const key = `mexc:spot:${sourceSymbol}` as const, status = String(item.status ?? "").toUpperCase();
    const chartable = status === "ENABLED" || status === "TRADING" || status === "1";
    if (!/^[A-Z0-9]{2,60}$/.test(sourceSymbol) || !baseAsset || !quoteAsset || !chartable || seen.has(key) || item.isSpotTradingAllowed === false) return [];
    seen.add(key);
    return [{ key, exchange: "mexc", marketType: "spot", contractType: "spot", sourceSymbol, symbol: sourceSymbol, displayName: `${baseAsset} / ${quoteAsset}`, contractDisplayName: `${baseAsset}/${quoteAsset} Spot`, baseAsset, quoteAsset, settlementAsset: quoteAsset, base: baseAsset, quote: quoteAsset, fullName: nameOf(baseAsset), status: "active", state: "enabled", pricePrecision: precision(item.quotePrecision ?? item.quoteAssetPrecision), quantityPrecision: precision(item.baseAssetPrecision), listedAt: finite(item.listedAt) }];
  });
}

export function mergeMexcTickers(markets: MarketInstrument[], spot: unknown, futures: unknown) {
  const spotRows = Array.isArray(spot) ? spot : [], futureRows = Array.isArray(futures) ? futures : futures && typeof futures === "object" && Array.isArray((futures as Raw).data) ? (futures as {data: unknown[]}).data : [];
  const map = new Map<string, Raw>();
  for (const row of spotRows) if (row && typeof row === "object") map.set(`spot:${String((row as Raw).symbol).toUpperCase()}`, row as Raw);
  for (const row of futureRows) if (row && typeof row === "object") map.set(`futures:${String((row as Raw).symbol).toUpperCase()}`, row as Raw);
  return markets.map(m => { const row = map.get(`${m.marketType}:${m.sourceSymbol}`); if (!row) return m; const lastPrice = finite(row.lastPrice ?? row.lastPrice), change24h = finite(row.priceChangePercent ?? row.riseFallRate), volume24h = finite(row.quoteVolume ?? row.amount24 ?? row.volume24); return {...m, lastPrice, change24h: m.marketType === "futures" && change24h !== undefined ? change24h * 100 : change24h, volume24h}; });
}

export function normaliseCandles(raw: unknown, nowSeconds: number, timeframe: CandleTimeframe): Candle[] {
  const data = raw as Raw; const rows = Array.isArray(raw) ? raw.map(row => ({time:Number((row as unknown[])[0])/1000,open:Number((row as unknown[])[1]),high:Number((row as unknown[])[2]),low:Number((row as unknown[])[3]),close:Number((row as unknown[])[4]),volume:Number((row as unknown[])[5]??0)})) : (Array.isArray(data?.time) ? data.time : []).map((time,index)=>({time:Number(time),open:Number((data.open as unknown[])?.[index]),high:Number((data.high as unknown[])?.[index]),low:Number((data.low as unknown[])?.[index]),close:Number((data.close as unknown[])?.[index]),volume:Number((data.vol as unknown[])?.[index]??0)}));
  const candles=rows.filter(c=>Object.values(c).every(Number.isFinite)&&c.time>0&&c.low<=c.high&&c.open>=c.low&&c.open<=c.high&&c.close>=c.low&&c.close<=c.high&&c.volume>=0&&c.time+MEXC_INTERVALS[timeframe].seconds<=nowSeconds);
  return [...new Map(candles.sort((a,b)=>a.time-b.time).map(c=>[c.time,c])).values()];
}

type Cache = { markets: MarketInstrument[]; refreshedAt: number; tickerAt: number; refresh?: Promise<MarketInstrument[]>; tickerRefresh?: Promise<MarketInstrument[]> };
let cache: Cache = {markets:[],refreshedAt:0,tickerAt:0}; const CATALOGUE_MS=10*60_000, TICKER_MS=20_000, MAX_MARKETS=10_000;
async function refresh(signal?: AbortSignal) {
  const [spotInfo,futureInfo] = await Promise.all([fetch("https://api.mexc.com/api/v3/exchangeInfo",{signal,cache:"no-store"}),fetch("https://api.mexc.com/api/v1/contract/detail",{signal,cache:"no-store"})]);
  if(!spotInfo.ok||!futureInfo.ok) throw new Error("Market directory unavailable"); const [s,f]=await Promise.all([spotInfo.json(),futureInfo.json()]);
  const markets=[...normaliseMexcSpot(s),...normaliseMexcFutures((f as {data?:unknown}).data)].slice(0,MAX_MARKETS); if(!markets.length) throw new Error("Market directory unavailable"); cache={...cache,markets,refreshedAt:Date.now()}; return markets;
}
async function tickers(markets:MarketInstrument[],signal?:AbortSignal){try{const [s,f]=await Promise.all([fetch("https://api.mexc.com/api/v3/ticker/24hr",{signal,cache:"no-store"}),fetch("https://api.mexc.com/api/v1/contract/ticker",{signal,cache:"no-store"})]);if(!s.ok||!f.ok)throw 0;const merged=mergeMexcTickers(markets,await s.json(),await f.json());cache={...cache,markets:merged,tickerAt:Date.now()};return merged}catch{return markets}}
export async function getMexcMarkets(signal?:AbortSignal){let markets=cache.markets;if(!markets.length||Date.now()-cache.refreshedAt>=CATALOGUE_MS){cache.refresh??=refresh(signal).finally(()=>{cache.refresh=undefined});try{markets=await cache.refresh}catch(e){if(!markets.length)throw e}}if(Date.now()-cache.tickerAt>=TICKER_MS&&!cache.tickerRefresh){cache.tickerRefresh=tickers(markets).finally(()=>{cache.tickerRefresh=undefined});void cache.tickerRefresh;}return markets}
export function resetMexcMarketCache(){cache={markets:[],refreshedAt:0,tickerAt:0}}

export const mexcProvider:MarketProvider={exchange:"mexc",getMarkets:getMexcMarkets,async getCandles(request:CandleRequest,signal?:AbortSignal):Promise<CandleResult>{const {instrument}=request, interval=MEXC_INTERVALS[request.timeframe], end=request.end??Math.floor(Date.now()/1000);let url:URL;if(instrument.marketType==="spot"){url=new URL("https://api.mexc.com/api/v3/klines");url.searchParams.set("symbol",instrument.sourceSymbol);url.searchParams.set("interval",request.timeframe);url.searchParams.set("limit",String(Math.min(request.limit,1000)));url.searchParams.set("endTime",String(end*1000));}else{url=new URL(`https://api.mexc.com/api/v1/contract/kline/${instrument.sourceSymbol}`);url.searchParams.set("interval",interval.api);url.searchParams.set("start",String(Math.max(0,end-interval.seconds*request.limit)));url.searchParams.set("end",String(end));}const response=await fetch(url,{headers:{accept:"application/json"},signal,cache:"no-store"});if(!response.ok)throw new Error("Candle feed unavailable");const payload=await response.json();const raw=instrument.marketType==="spot"?payload:(payload as {success?:boolean,data?:unknown}).data;const candles=normaliseCandles(raw,Math.floor(Date.now()/1000),request.timeframe).slice(-request.limit);if(!candles.length)throw new Error("Candle feed unavailable");return{source:instrument.marketType==="spot"?"MEXC public spot API":"MEXC public contract API",exchange:"mexc",marketKey:instrument.key,symbol:instrument.sourceSymbol,timeframe:request.timeframe,candles,receivedAt:Date.now(),nextEnd:candles[0].time-1}}};
