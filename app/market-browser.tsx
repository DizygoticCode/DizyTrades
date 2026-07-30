"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DexMarket } from "./lib/dex/types";
import type { MarketDescriptor } from "./lib/market/types";
import { marketBadge, marketSubtitle, searchMarkets, type MarketTab } from "./lib/market/catalogue";

type Source = "mexc" | "dex";
type Props = {
  markets: MarketDescriptor[]; selectedMarketKey: string; favourites: string[];
  onFavourite: (key: string) => void; onSelect: (market: MarketDescriptor) => void; onClose: () => void;
};
const primaryTabs: MarketTab[] = ["favorites", "all", "spot", "futures"];
const instrumentTabs: MarketTab[] = ["perpetual", "delivery", "pre-market", "new", "hot"];
const dexPrimary = ["Favorites", "All DEX", "Solana", "BNB Chain"];
const dexVenues = ["Pump.fun", "PumpSwap", "Raydium", "PancakeSwap"];
const dexDiscovery = ["New Pairs", "Trending", "Graduated", "High Volume", "High Liquidity", "Gainers", "Losers"];
const compactMoney=(value?:number)=>value===undefined?"—":Intl.NumberFormat("en",{notation:"compact",style:"currency",currency:"USD",maximumFractionDigits:2}).format(value);
const price=(value?:number)=>value===undefined?"—":Intl.NumberFormat("en",{style:"currency",currency:"USD",maximumSignificantDigits:7}).format(value);
const signed=(value?:number)=>value===undefined?"—":`${value>=0?"+":""}${value.toFixed(2)}%`;
const age=(createdAt?:number,now=0)=>{if(!createdAt)return "age unknown";const minutes=Math.max(1,Math.floor((now-createdAt)/60000));return minutes<60?`${minutes}m old`:minutes<1440?`${Math.floor(minutes/60)}h old`:`${Math.floor(minutes/1440)}d old`};

function Chips({items,value,onChange,label}:{items:string[];value:string;onChange:(item:string)=>void;label:string}) {
  return <div className="browser-chips" aria-label={label} role="tablist">{items.map(item=><button aria-selected={value.toLowerCase()===item.toLowerCase()} className={value.toLowerCase()===item.toLowerCase()?"active":""} key={item} onClick={()=>onChange(item)} role="tab" type="button">{item}</button>)}</div>;
}

function Logo({url,label}:{url?:string;label:string}) { return <span className="browser-logo">{url?<img alt="" src={url}/>:label.slice(0,2).toUpperCase()}</span>; }

function MexcRow({market,active,favourite,onFavourite,onSelect}:{market:MarketDescriptor;active:boolean;favourite:boolean;onFavourite:()=>void;onSelect:()=>void}) {
  return <div aria-selected={active} className={`browser-row ${active?"selected":""}`} role="option" tabIndex={0} onClick={onSelect} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect()}}}>
    <Logo label={market.baseAsset}/><span className="browser-identity"><strong>{market.displayName}<em className="market-badge">{marketBadge(market)}</em></strong><small>{marketSubtitle(market)}</small></span>
    <span className="browser-number"><strong>{market.lastPrice?.toLocaleString(undefined,{maximumSignificantDigits:8})??"—"}</strong><small>Vol {compactMoney(market.volume24h)}</small></span>
    <span className={`browser-change ${(market.change24h??0)>=0?"positive":"negative"}`}>{signed(market.change24h)}</span>
    <button aria-label={`${favourite?"Remove":"Add"} ${market.displayName} ${favourite?"from":"to"} favorites`} className="browser-star" onClick={event=>{event.stopPropagation();onFavourite()}} type="button">{favourite?"★":"☆"}</button>
  </div>;
}

function DexRow({market,active,favourite,onFavourite,onSelect,now}:{market:DexMarket;active:boolean;favourite:boolean;onFavourite:()=>void;onSelect:()=>void;now:number}) {
  const venue=market.dex.replace(/[_-]/g," ").toUpperCase();
  return <div aria-selected={active} className={`browser-row ${active?"selected":""}`} role="option" tabIndex={0} onClick={onSelect} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect()}}}>
    <Logo label={market.symbol} url={market.logoUrl}/><span className="browser-identity"><strong>{market.symbol} / {market.quoteSymbol}<em className="market-badge dex">{venue||market.chain.toUpperCase()}</em></strong><small>{market.name} · {market.chain==="bsc"?"BNB Chain":"Solana"} · {age(market.createdAt,now)} · Liquidity {compactMoney(market.liquidityUsd)}</small><code title={market.tokenAddress}>{market.tokenAddress.slice(0,6)}…{market.tokenAddress.slice(-4)}</code></span>
    <span className="browser-number"><strong>{price(market.priceUsd)}</strong><small>Vol {compactMoney(market.volume24h)}</small></span><span className={`browser-change ${(market.changes.h24??0)>=0?"positive":"negative"}`}>{signed(market.changes.h24)}</span>
    <button aria-label={`${favourite?"Remove":"Add"} ${market.symbol} ${favourite?"from":"to"} favorites`} className="browser-star" onClick={event=>{event.stopPropagation();onFavourite()}} type="button">{favourite?"★":"☆"}</button>
  </div>;
}

export function MarketBrowser({markets,selectedMarketKey,favourites,onFavourite,onSelect,onClose}:Props) {
  const [source,setSource]=useState<Source>("mexc"),[query,setQuery]=useState(""),[marketTab,setMarketTab]=useState<MarketTab>("all"),[quote,setQuote]=useState("All"),[limit,setLimit]=useState(100);
  const [dexTab,setDexTab]=useState("All DEX"),[dexItems,setDexItems]=useState<DexMarket[]>([]),[dexFavourites,setDexFavourites]=useState<string[]>([]),[dexSelected,setDexSelected]=useState(""),[cursor,setCursor]=useState("1"),[loading,setLoading]=useState(false),[degraded,setDegraded]=useState(""),[receivedAt,setReceivedAt]=useState(0),[cached,setCached]=useState(false),[retry,setRetry]=useState(0),[filtersOpen,setFiltersOpen]=useState(false);
  const [filters,setFilters]=useState({liquidity:"",volume:"",age:"",unit:"hours"});
  const [openedAt]=useState(()=>Date.now());
  const dialog=useRef<HTMLDivElement>(null);
  const visible=useMemo(()=>searchMarkets(markets,query,marketTab,quote,new Set(favourites)).slice(0,limit),[markets,query,marketTab,quote,favourites,limit]);
  const chain=dexTab==="BNB Chain"||dexTab==="PancakeSwap"?"bsc":dexTab==="Solana"?"solana":"";
  const loadDex=useCallback(async (append=false)=>{setLoading(true);try{const response=await fetch(`/api/dex/markets?query=${encodeURIComponent(query)}&chain=${chain}&cursor=${append?cursor:"1"}`);const payload=await response.json();if(!response.ok)throw Error(payload.degraded||"DEX provider unavailable");setDexItems(current=>append?[...current,...payload.markets]:payload.markets);setReceivedAt(payload.receivedAt||0);setCached(Boolean(payload.cached));setDegraded(payload.degraded||"");}catch(error){setDegraded(error instanceof Error?error.message:"DEX provider unavailable");}finally{setLoading(false)}},[query,chain,cursor]);
  useEffect(()=>{if(source!=="dex")return;const timer=setTimeout(()=>void loadDex(false),220);return()=>clearTimeout(timer)},[source,query,chain,retry,loadDex]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose()};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close)},[onClose]);
  const filteredDex=useMemo(()=>dexItems.filter(item=>{if(dexTab==="Favorites"&&!dexFavourites.includes(item.key))return false;if(dexVenues.includes(dexTab)&&!item.dex.toLowerCase().includes(dexTab.replace(".","").toLowerCase()))return false;const minL=Number(filters.liquidity)||0,minV=Number(filters.volume)||0,maxAge=(Number(filters.age)||Infinity)*(filters.unit==="days"?86400000:3600000);return(item.liquidityUsd??0)>=minL&&(item.volume24h??0)>=minV&&(!item.createdAt||openedAt-item.createdAt<=maxAge)}),[dexItems,dexTab,dexFavourites,filters,openedAt]);
  return <><button aria-label="Close market browser" className="market-backdrop" onClick={onClose}/><div aria-label="Market Browser" aria-modal="true" className="market-browser" ref={dialog} role="dialog">
    <header className="browser-header"><span><small>Select Market</small><strong>Market Browser</strong></span><span className={`provider-badge ${degraded?"degraded":cached?"cached":""}`}>{source==="mexc"?"● MEXC":""}{source==="dex"?(degraded?"⚠ DEX data degraded":cached?"● Cached":receivedAt?"● Live":"● Connecting"):""}</span>{source==="dex"?<button aria-label="Refresh DEX markets" className="icon-button" disabled={loading} onClick={()=>setRetry(x=>x+1)} type="button">↻</button>:null}<button aria-label="Close market browser" className="icon-button close" onClick={onClose} type="button">×</button></header>
    <div className="browser-controls"><Chips items={["MEXC Markets","DizyDEX"]} label="Market source" value={source==="mexc"?"MEXC Markets":"DizyDEX"} onChange={item=>{setSource(item==="DizyDEX"?"dex":"mexc");setQuery("")}}/><label className="browser-search"><span>⌕</span><input autoFocus aria-label="Search markets" onChange={event=>{setQuery(event.target.value);setCursor("1")}} placeholder={source==="mexc"?"Search MEXC symbol or asset…":"Search token, contract, mint or pool…"} value={query}/></label>
      {source==="mexc"?<><Chips items={primaryTabs.map(x=>x[0].toUpperCase()+x.slice(1))} label="MEXC market type" value={marketTab} onChange={x=>{setMarketTab(x.toLowerCase() as MarketTab);setLimit(100)}}/><Chips items={instrumentTabs.map(x=>x.split("-").map(y=>y[0].toUpperCase()+y.slice(1)).join("-"))} label="MEXC instrument" value={marketTab} onChange={x=>setMarketTab(x.toLowerCase() as MarketTab)}/><Chips items={["USDT","USDC","BTC","ETH","MX","Other"]} label="Quote asset" value={quote} onChange={setQuote}/></>:<><Chips items={dexPrimary} label="DEX network" value={dexTab} onChange={setDexTab}/><Chips items={dexVenues} label="DEX venue" value={dexTab} onChange={setDexTab}/><Chips items={dexDiscovery} label="DEX discovery" value={dexTab} onChange={setDexTab}/><button aria-expanded={filtersOpen} className="filters-toggle" onClick={()=>setFiltersOpen(x=>!x)} type="button">Filters <span>{filtersOpen?"−":"+"}</span></button>{filtersOpen?<div className="advanced-filters"><label>Minimum liquidity<input min="0" onChange={e=>setFilters(x=>({...x,liquidity:e.target.value}))} type="number" value={filters.liquidity}/></label><label>Minimum volume<input min="0" onChange={e=>setFilters(x=>({...x,volume:e.target.value}))} type="number" value={filters.volume}/></label><label>Maximum pair age<input min="0" onChange={e=>setFilters(x=>({...x,age:e.target.value}))} type="number" value={filters.age}/></label><label>Age unit<select onChange={e=>setFilters(x=>({...x,unit:e.target.value}))} value={filters.unit}><option>hours</option><option>days</option></select></label><button onClick={()=>setFilters({liquidity:"",volume:"",age:"",unit:"hours"})} type="button">Reset filters</button></div>:null}{degraded?<details className="provider-detail"><summary>Cached results remain available</summary><p>{degraded}</p><button onClick={()=>setRetry(x=>x+1)} type="button">Retry</button></details>:null}</>}
    </div>
    <div aria-busy={loading} aria-label={`${source==="mexc"?"MEXC":"DEX"} market results`} className="browser-results" role="listbox">{source==="mexc"?(visible.length?visible.map(m=><MexcRow active={m.key===selectedMarketKey} favourite={favourites.includes(m.key)} key={m.key} market={m} onFavourite={()=>onFavourite(m.key)} onSelect={()=>onSelect(m)}/>):<div className="browser-empty"><b>No markets found</b><span>Try a different search or filter.</span></div>):(filteredDex.length?filteredDex.map(m=><DexRow active={m.key===dexSelected} favourite={dexFavourites.includes(m.key)} key={m.key} market={m} now={openedAt} onFavourite={()=>setDexFavourites(x=>x.includes(m.key)?x.filter(k=>k!==m.key):[...x,m.key])} onSelect={()=>setDexSelected(m.key)}/>):loading?<div className="browser-skeleton" aria-label="Loading markets"><i/><i/><i/><i/></div>:<div className="browser-empty"><b>No DEX markets found</b><span>{degraded?"Showing the last available result set.":"Try a different network or search."}</span></div>)}</div>
    {source==="dex"&&!query?<footer><button className="load-more" disabled={loading} onClick={()=>{setCursor(String(Number(cursor)+1));void loadDex(true)}} type="button">{loading?"Loading markets…":"Load more markets"}</button></footer>:null}
  </div></>;
}
