"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DexMarket } from "./lib/dex/types";
import type { MarketDescriptor } from "./lib/market/types";
import { marketBadge, marketSubtitle, searchMarkets, type MarketTab } from "./lib/market/catalogue";

type Props = { markets: MarketDescriptor[]; selectedMarketKey: string; favourites: string[]; onFavourite: (key: string) => void; onSelect: (market: MarketDescriptor) => void; onClose: () => void };
type Primary = "Favorites" | "Spot" | "Futures" | "DizyDEX" | "Movers";
type Sort = "market" | "price" | "change" | "volume";
type Direction = "asc" | "desc";
const primary: Primary[] = ["Favorites", "Spot", "Futures", "DizyDEX", "Movers"];
const secondary: Record<Primary, string[]> = {
  Favorites: ["All", "Spot", "Futures", "DEX"],
  Spot: ["All", "USDT", "USDC", "BTC", "ETH", "More"],
  Futures: ["All", "USDT-M", "USDC-M", "COIN-M", "Delivery", "More"],
  DizyDEX: ["All", "Solana", "BNB", "Pump.fun", "More"],
  Movers: ["New", "Hot", "Gainers", "Losers", "Volume"],
};
const dexMore = ["PumpSwap", "Raydium", "PancakeSwap", "New Pairs", "Trending", "Graduated", "High Volume", "High Liquidity", "Gainers", "Losers"];
const mexcMore = ["Pre-Market", "New", "Hot"];
const compact = (value?: number) => value == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const formatPrice = (value?: number) => value == null ? "—" : value < .001 ? value.toPrecision(4) : Intl.NumberFormat("en", { maximumSignificantDigits: 8 }).format(value);
const signed = (value?: number) => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const age = (createdAt?: number, now = 0) => { if (!createdAt) return "age unknown"; const minutes = Math.max(1, Math.floor((now-createdAt)/60000)); return minutes < 60 ? `${minutes}m old` : minutes < 1440 ? `${Math.floor(minutes/60)}h old` : `${Math.floor(minutes/1440)}d old`; };

function Tabs({ items, value, onChange, label, className }: { items: readonly string[]; value: string; onChange: (value: string) => void; label: string; className: string }) {
  return <div className={className} aria-label={label} role="tablist">{items.map(item => <button aria-selected={item === value} className={item === value ? "active" : ""} key={item} onClick={() => onChange(item)} role="tab" type="button">{item}</button>)}</div>;
}
function Star({ label, favourite, onClick }: { label: string; favourite: boolean; onClick: () => void }) {
  return <button aria-label={`${favourite ? "Remove" : "Add"} ${label} ${favourite ? "from" : "to"} favorites`} className="mb-star" onClick={event => { event.stopPropagation(); onClick(); }} type="button">{favourite ? "★" : "☆"}</button>;
}
function Logo({ label, url }: { label: string; url?: string }) { return <span className="mb-logo">{url ? <img alt="" src={url}/> : label.slice(0,2).toUpperCase()}</span>; }
function Change({ value }: { value?: number }) { return <span className={`mb-change ${value == null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative"}`}>{signed(value)}</span>; }

function MexcRow({ market, selected, favourite, onFavourite, onSelect }: { market: MarketDescriptor; selected: boolean; favourite: boolean; onFavourite: () => void; onSelect: () => void }) {
  return <div aria-selected={selected} className={`mb-row${selected ? " selected" : ""}`} role="option" tabIndex={0} onClick={onSelect} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}>
    <div className="mb-market"><Star label={market.displayName} favourite={favourite} onClick={onFavourite}/><Logo label={market.baseAsset}/><span className="mb-identity"><strong><span>{market.displayName}</span><em>{marketBadge(market)}</em></strong><small>{marketSubtitle(market)}</small></span></div>
    <span className="mb-number">{formatPrice(market.lastPrice)}</span><Change value={market.change24h}/><span className="mb-volume">{compact(market.volume24h)}</span>
  </div>;
}
function DexRow({ market, selected, favourite, now, onFavourite, onSelect }: { market: DexMarket; selected: boolean; favourite: boolean; now: number; onFavourite: () => void; onSelect: () => void }) {
  const badge = market.dex.toLowerCase().includes("pump") ? "PUMP" : market.chain === "bsc" ? "BNB" : "SOL";
  return <div aria-selected={selected} className={`mb-row${selected ? " selected" : ""}`} role="option" tabIndex={0} onClick={onSelect} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}>
    <div className="mb-market"><Star label={market.symbol} favourite={favourite} onClick={onFavourite}/><Logo label={market.symbol} url={market.logoUrl}/><span className="mb-identity"><strong><span>{market.symbol} / {market.quoteSymbol}</span><em className="dex">{badge}</em></strong><small title={market.tokenAddress}>{market.name} · {age(market.createdAt, now)}</small></span></div>
    <span className="mb-number">{formatPrice(market.priceUsd)}</span><Change value={market.changes.h24}/><span className="mb-volume">{compact(market.liquidityUsd)}</span>
  </div>;
}

export function MarketBrowser({ markets, selectedMarketKey, favourites, onFavourite, onSelect, onClose }: Props) {
  const [tab, setTab] = useState<Primary>("Spot"), [subtab, setSubtab] = useState("All"), [query, setQuery] = useState(""), [limit, setLimit] = useState(80);
  const [sort, setSort] = useState<Sort>("volume"), [direction, setDirection] = useState<Direction>("desc"), [moreOpen, setMoreOpen] = useState(false), [filtersOpen, setFiltersOpen] = useState(false), [statusOpen, setStatusOpen] = useState(false);
  const [dexItems, setDexItems] = useState<DexMarket[]>([]), [dexFavourites, setDexFavourites] = useState<string[]>([]), [dexSelected, setDexSelected] = useState(""), [cursor, setCursor] = useState("1"), [loading, setLoading] = useState(false), [degraded, setDegraded] = useState(""), [receivedAt, setReceivedAt] = useState(0), [cached, setCached] = useState(false), [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState({ liquidity: "", volume: "", age: "" });
  const [openedAt] = useState(() => Date.now()); const results = useRef<HTMLDivElement>(null);
  const dexMode = tab === "DizyDEX" || (tab === "Favorites" && subtab === "DEX");
  const chain = subtab === "BNB" ? "bsc" : subtab === "Solana" ? "solana" : "";
  const loadDex = useCallback(async (append = false) => { setLoading(true); try { const response = await fetch(`/api/dex/markets?query=${encodeURIComponent(query)}&chain=${chain}&cursor=${append ? cursor : "1"}`); const payload = await response.json(); if (!response.ok) throw Error(payload.degraded || "DEX provider unavailable"); setDexItems(current => append ? [...current, ...payload.markets] : payload.markets); setReceivedAt(payload.receivedAt || 0); setCached(Boolean(payload.cached)); setDegraded(payload.degraded || ""); } catch(error) { setDegraded(error instanceof Error ? error.message : "DEX provider unavailable"); } finally { setLoading(false); } }, [query,chain,cursor]);
  useEffect(() => { if (!dexMode) return; const timer = setTimeout(() => void loadDex(false), 220); return () => clearTimeout(timer); }, [dexMode,query,chain,retry,loadDex]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); if (event.key === "ArrowDown" && document.activeElement?.tagName === "INPUT") { event.preventDefault(); results.current?.querySelector<HTMLElement>("[role=option]")?.focus(); } }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [onClose]);
  const chooseTab = (value: string) => { const next = value as Primary; setTab(next); setSubtab(next === "Movers" ? "Gainers" : "All"); setMoreOpen(false); setFiltersOpen(false); setLimit(80); };
  const setSortKey = (key: Sort) => { if (key === sort) setDirection(value => value === "asc" ? "desc" : "asc"); else { setSort(key); setDirection(key === "market" ? "asc" : "desc"); } };
  const indicator = (key: Sort) => sort === key ? (direction === "asc" ? " ↑" : " ↓") : "";
  const visible = useMemo(() => {
    let marketTab: MarketTab = tab === "Favorites" ? "favorites" : tab === "Futures" ? "futures" : tab === "Spot" ? "spot" : "all";
    if (tab === "Favorites" && subtab === "Spot") marketTab = "spot"; if (tab === "Favorites" && subtab === "Futures") marketTab = "futures";
    const quote = ["USDT","USDC","BTC","ETH"].includes(subtab) ? subtab : "All";
    let list = searchMarkets(markets, query, marketTab, quote, new Set(favourites), openedAt);
    if (tab === "Favorites") list = list.filter(m => favourites.includes(m.key));
    if (tab === "Futures" && subtab === "Delivery") list = list.filter(m => m.contractType === "delivery");
    if (tab === "Movers") { if (subtab === "Gainers") list = list.filter(m => (m.change24h || 0) > 0); if (subtab === "Losers") list = list.filter(m => (m.change24h || 0) < 0); }
    const value = (m: MarketDescriptor) => sort === "market" ? m.displayName : sort === "price" ? m.lastPrice || 0 : sort === "change" ? m.change24h || 0 : m.volume24h || 0;
    return [...list].sort((a,b) => { const av=value(a),bv=value(b); const result = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av)-Number(bv); return direction === "asc" ? result : -result; }).slice(0,limit);
  }, [markets,query,tab,subtab,favourites,openedAt,sort,direction,limit]);
  const filteredDex = useMemo(() => {
    const list = dexItems.filter(item => { const venueMatch = subtab === "All" || subtab === "Solana" || subtab === "BNB" || subtab === "More" || item.dex.toLowerCase().replace(/[._-]/g,"").includes(subtab.toLowerCase().replace(/[._-]/g,"")); const favoriteMatch = tab !== "Favorites" || dexFavourites.includes(item.key); const maxAge = (Number(filters.age)||Infinity)*3600000; return venueMatch && favoriteMatch && (item.liquidityUsd||0)>=(Number(filters.liquidity)||0) && (item.volume24h||0)>=(Number(filters.volume)||0) && (!item.createdAt || openedAt-item.createdAt<=maxAge); });
    const value=(m:DexMarket)=>sort==="market"?m.symbol:sort==="price"?m.priceUsd||0:sort==="change"?m.changes.h24||0:m.liquidityUsd||0; return [...list].sort((a,b)=>{const av=value(a),bv=value(b);const result=typeof av==="string"?av.localeCompare(String(bv)):Number(av)-Number(bv);return direction==="asc"?result:-result;});
  },[dexItems,subtab,tab,dexFavourites,filters,openedAt,sort,direction]);
  const providerLabel = dexMode ? degraded ? "⚠ Degraded" : cached ? "● Cached" : receivedAt ? "● Live" : "● Connecting" : "● Live";
  return <><button aria-label="Close market browser" className="market-backdrop" onClick={onClose}/><section aria-label="Market Browser" aria-modal="true" className="market-browser" role="dialog">
    <header className="mb-header"><strong>Market Browser</strong><button aria-expanded={statusOpen} className={`mb-status${degraded ? " degraded" : cached ? " cached" : ""}`} onClick={() => dexMode && setStatusOpen(x=>!x)} type="button">{providerLabel}</button><button aria-label="Close market browser" className="mb-close" onClick={onClose} type="button">×</button>{statusOpen && dexMode ? <aside className="mb-status-popover"><b>{degraded ? "Provider degraded" : cached ? "Cached market data" : "Provider connected"}</b><p>{degraded || "Market data provider status."}</p><button onClick={()=>setRetry(x=>x+1)} type="button">Retry</button></aside>:null}</header>
    <div className="mb-search"><span aria-hidden="true">⌕</span><input autoFocus aria-label="Search markets" onChange={e=>{setQuery(e.target.value);setCursor("1");}} placeholder={dexMode ? "Search token, mint, contract or pool…" : "Search symbol, asset or contract…"} value={query}/>{query ? <button aria-label="Clear search" onClick={()=>setQuery("")} type="button">×</button>:null}</div>
    <Tabs className="mb-primary" items={primary} label="Market type" value={tab} onChange={chooseTab}/>
    <div className="mb-secondary"><Tabs className="mb-secondary-tabs" items={secondary[tab]} label={`${tab} filters`} value={subtab} onChange={value=>{if(value==="More")setMoreOpen(x=>!x);else{setSubtab(value);setMoreOpen(false);}}}/>{tab==="DizyDEX"?<button aria-expanded={filtersOpen} aria-label="DEX filters" className="mb-filter" onClick={()=>setFiltersOpen(x=>!x)} type="button">⚙</button>:null}
      {moreOpen?<div className="mb-more-menu">{(tab==="DizyDEX"?dexMore:mexcMore).map(item=><button key={item} onClick={()=>{setSubtab(item);setMoreOpen(false);}} type="button">{item}</button>)}</div>:null}
      {filtersOpen?<div className="mb-filter-popover"><label>Minimum liquidity<input min="0" type="number" value={filters.liquidity} onChange={e=>setFilters(x=>({...x,liquidity:e.target.value}))}/></label><label>Minimum volume<input min="0" type="number" value={filters.volume} onChange={e=>setFilters(x=>({...x,volume:e.target.value}))}/></label><label>Maximum pair age (hours)<input min="0" type="number" value={filters.age} onChange={e=>setFilters(x=>({...x,age:e.target.value}))}/></label><button onClick={()=>setFilters({liquidity:"",volume:"",age:""})} type="button">Reset</button></div>:null}
    </div>
    <div className="mb-columns"><button onClick={()=>setSortKey("market")} type="button">{dexMode?"Token / Pool":"Trading Pair"}{indicator("market")}</button><button onClick={()=>setSortKey("price")} type="button">{dexMode?"Price":"Last"}{indicator("price")}</button><button onClick={()=>setSortKey("change")} type="button">24h{indicator("change")}</button><button className="mb-volume" onClick={()=>setSortKey("volume")} type="button">{dexMode?"Liq":"Vol"}{indicator("volume")}</button></div>
    <div aria-busy={loading} aria-label={`${dexMode?"DEX":"MEXC"} market results`} className="mb-results" ref={results} role="listbox">{dexMode ? filteredDex.length ? filteredDex.map(m=><DexRow key={m.key} market={m} selected={m.key===dexSelected} favourite={dexFavourites.includes(m.key)} now={openedAt} onFavourite={()=>setDexFavourites(x=>x.includes(m.key)?x.filter(k=>k!==m.key):[...x,m.key])} onSelect={()=>setDexSelected(m.key)}/>) : loading ? <div aria-label="Loading markets" className="mb-skeleton">{Array.from({length:8},(_,i)=><i key={i}/>)}</div> : <div className="mb-empty"><b>No DEX markets found</b><span>{degraded?"Cached results unavailable. Retry the provider.":"Try another network or search."}</span></div> : visible.length ? visible.map(m=><MexcRow key={m.key} market={m} selected={m.key===selectedMarketKey} favourite={favourites.includes(m.key)} onFavourite={()=>onFavourite(m.key)} onSelect={()=>onSelect(m)}/>) : <div className="mb-empty"><b>No markets found</b><span>Try another search or filter.</span></div>}
      {dexMode && filteredDex.length && !query?<button className="mb-load-more" disabled={loading} onClick={()=>{setCursor(String(Number(cursor)+1));void loadDex(true);}} type="button">{loading?"Loading…":"Load more markets"}</button>:null}{!dexMode&&visible.length===limit?<button className="mb-load-more" onClick={()=>setLimit(x=>x+80)} type="button">Load more markets</button>:null}</div>
  </section></>;
}
