"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import styles from "./market-browser-panel.module.css";
import type { DexMarket } from "./lib/dex/types";
import type { GlobalMarketDescriptor } from "./lib/market/global";
import type { MarketDescriptor } from "./lib/market/types";
import { marketBadge, marketSubtitle, searchMarkets, type MarketTab } from "./lib/market/catalogue";

type Props = {
  anchorRef: RefObject<HTMLElement | null>;
  markets: MarketDescriptor[];
  selectedMarketKey: string;
  selectedDexMarketKey?: string;
  selectedGlobalMarketKey?: string;
  favourites: string[];
  onFavourite: (key: string) => void;
  onSelect: (market: MarketDescriptor) => void;
  onSelectDex: (market: DexMarket) => void;
  onSelectGlobal: (market: GlobalMarketDescriptor) => void;
  onClose: () => void;
};
type Primary = "Favorites" | "Spot" | "Futures" | "Global" | "DizyDEX" | "Movers";
type Sort = "market" | "price" | "change" | "volume";
type Direction = "asc" | "desc";
type DexFavorite = { key: string; chain: "solana" | "bsc"; poolAddress: string };

const primary: Primary[] = ["Favorites", "Spot", "Futures", "Global", "DizyDEX", "Movers"];
const secondary: Record<Primary, string[]> = {
  Favorites: ["All", "Spot", "Futures", "DEX"],
  Spot: ["All", "USDT", "USDC", "BTC", "ETH", "More"],
  Futures: ["All", "USDT-M", "USDC-M", "Delivery", "More"],
  Global: ["All", "Stocks", "ETFs", "Forex", "Crypto"],
  DizyDEX: ["All", "Solana", "BNB", "More"],
  Movers: ["New", "Hot", "Gainers", "Losers", "Volume"],
};
const mexcMore = ["Pre-Market", "New", "Hot"];
const compact = (value?: number) => value == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const formatPrice = (value?: number) => value == null ? "—" : value < .001 ? value.toPrecision(4) : Intl.NumberFormat("en", { maximumSignificantDigits: 8 }).format(value);
const signed = (value?: number) => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const age = (createdAt?: number, now = 0) => {
  if (!createdAt) return "age unknown";
  const minutes = Math.max(1, Math.floor((now-createdAt)/60000));
  return minutes < 60 ? `${minutes}m old` : minutes < 1440 ? `${Math.floor(minutes/60)}h old` : `${Math.floor(minutes/1440)}d old`;
};
const normaliseVenue = (value: string) => value.toLowerCase().replace(/[._\s-]/g, "");
const parseDexFavourite = (key: string): DexFavorite | null => {
  const parts = key.split(":");
  if ((parts[0] !== "solana" && parts[0] !== "bsc") || parts.length !== 3 || !parts[2]) return null;
  return { key, chain: parts[0], poolAddress: parts[2] };
};
const mergeDexMarkets = (current: DexMarket[], incoming: DexMarket[]) => {
  const merged = new Map(current.map(market => [market.key, market]));
  incoming.forEach(market => merged.set(market.key, market));
  return [...merged.values()];
};

function Tabs({ items, value, onChange, label, className }: { items: readonly string[]; value: string; onChange: (value: string, anchor?: DOMRect) => void; label: string; className: string }) {
  return <div className={className} aria-label={label} role="tablist">{items.map(item => <button aria-selected={item === value} className={`${styles.tabButton} ${item === value ? styles.active : ""}`} key={item} onClick={event => onChange(item, event.currentTarget.getBoundingClientRect())} role="tab" type="button">{item}</button>)}</div>;
}
function Star({ label, favourite, onClick }: { label: string; favourite: boolean; onClick: () => void }) {
  return <button aria-label={`${favourite ? "Remove" : "Add"} ${label} ${favourite ? "from" : "to"} favorites`} className={styles.favoriteButton} onClick={event => { event.stopPropagation(); onClick(); }} type="button">{favourite ? "★" : "☆"}</button>;
}
function Logo({ label, url }: { label: string; url?: string }) {
  return <span className={styles.logo}>{url ? <img alt="" src={url}/> : label.slice(0,2).toUpperCase()}</span>;
}
function Change({ value }: { value?: number }) {
  return <span className={`${styles.changeCell} ${value == null || value === 0 ? styles.neutral : value > 0 ? styles.positive : styles.negative}`}>{signed(value)}</span>;
}
function MexcRow({ market, selected, favourite, onFavourite, onSelect }: { market: MarketDescriptor; selected: boolean; favourite: boolean; onFavourite: () => void; onSelect: () => void }) {
  return <div aria-selected={selected} className={`${styles.resultRow} ${selected ? styles.selected : ""}`} role="option" tabIndex={0} onClick={onSelect} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}>
    <div className={styles.identityCell}><Star label={market.displayName} favourite={favourite} onClick={onFavourite}/><Logo label={market.baseAsset}/><span className={styles.identityText}><strong><span>{market.displayName}</span><em>{marketBadge(market)}</em></strong><small>{marketSubtitle(market)}</small></span></div>
    <span className={styles.priceCell}>{formatPrice(market.lastPrice)}</span><Change value={market.change24h}/><span className={styles.volumeColumn}>{compact(market.volume24h)}</span>
  </div>;
}
function DexRow({ market, selected, favourite, now, onFavourite, onSelect }: { market: DexMarket; selected: boolean; favourite: boolean; now: number; onFavourite: () => void; onSelect: () => void }) {
  const badge = market.chain === "bsc" ? "BNB" : "SOL";
  return <div aria-selected={selected} className={`${styles.resultRow} ${selected ? styles.selected : ""}`} role="option" tabIndex={0} onClick={onSelect} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}>
    <div className={styles.identityCell}><Star label={market.symbol} favourite={favourite} onClick={onFavourite}/><Logo label={market.symbol} url={market.logoUrl}/><span className={styles.identityText}><strong><span>{market.symbol} / {market.quoteSymbol}</span><em className={styles.dexBadge}>{badge}</em></strong><small title={market.tokenAddress}>{market.dex} · {compact(market.liquidityUsd)} liq · {age(market.createdAt, now)}</small></span></div>
    <span className={styles.priceCell}>{formatPrice(market.priceUsd)}</span><Change value={market.changes.h24}/><span className={styles.volumeColumn}>{compact(market.volume24h)}</span>
  </div>;
}
function GlobalRow({ market, selected, onSelect }: { market: GlobalMarketDescriptor; selected: boolean; onSelect: () => void }) {
  return <div aria-selected={selected} className={`${styles.resultRow} ${selected ? styles.selected : ""}`} role="option" tabIndex={0} onClick={onSelect} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}>
    <div className={styles.identityCell}><span aria-hidden="true" className={styles.providerMark}>G</span><Logo label={market.symbol}/><span className={styles.identityText}><strong><span>{market.displayName}</span><em className={styles.globalBadge}>GLOBAL</em></strong><small>{market.country ? `${market.country} · ` : ""}{market.instrumentType}</small></span></div>
    <span className={styles.priceCell}>{market.exchange}</span><span className={styles.changeCell}>{market.assetClass.toUpperCase()}</span><span className={styles.volumeColumn}>{market.currency}</span>
  </div>;
}

export function MarketBrowser({ anchorRef, markets, selectedMarketKey, selectedDexMarketKey, selectedGlobalMarketKey, favourites, onFavourite, onSelect, onSelectDex, onSelectGlobal, onClose }: Props) {
  const [tab, setTab] = useState<Primary>("Spot");
  const [subtab, setSubtab] = useState("All");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(80);
  const [sort, setSort] = useState<Sort>("volume");
  const [direction, setDirection] = useState<Direction>("desc");
  const [moreOpen, setMoreOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dexItems, setDexItems] = useState<DexMarket[]>([]);
  const [dexSelected, setDexSelected] = useState("");
  const [globalItems, setGlobalItems] = useState<GlobalMarketDescriptor[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [globalReceivedAt, setGlobalReceivedAt] = useState(0);
  const [globalCached, setGlobalCached] = useState(false);
  const [cursor, setCursor] = useState("1");
  const [loading, setLoading] = useState(false);
  const [degraded, setDegraded] = useState("");
  const [receivedAt, setReceivedAt] = useState(0);
  const [cached, setCached] = useState(false);
  const [retry, setRetry] = useState(0);
  const [morePosition, setMorePosition] = useState({ top: 0, left: 0 });
  const [filters, setFilters] = useState({ liquidity: "", volume: "", age: "" });
  const [openedAt] = useState(() => Date.now());
  const results = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ top: 12, left: 8 });

  useEffect(() => {
    const place = () => {
      const trigger = anchorRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = Math.min(420, window.innerWidth - 16);
      const height = Math.min(520, window.innerHeight - 24);
      const below = trigger.bottom + 6;
      const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, trigger.top - height - 6);
      setPosition({ top: Math.min(top, window.innerHeight - height - 8), left: Math.max(8, Math.min(trigger.left, window.innerWidth - width - 8)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchorRef]);

  const showGlobal = tab === "Global";
  const showDex = tab === "DizyDEX" || (tab === "Favorites" && (subtab === "All" || subtab === "DEX"));
  const showMexc = tab !== "DizyDEX" && tab !== "Global" && !(tab === "Favorites" && subtab === "DEX");
  const chain = subtab === "BNB" ? "bsc" : subtab === "Solana" ? "solana" : "";
  const loadDex = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/dex/markets?query=${encodeURIComponent(query)}&chain=${chain}&cursor=${append ? cursor : "1"}`);
      const payload = await response.json();
      if (!response.ok) throw Error(payload.degraded || "DEX provider unavailable");
      const next = Array.isArray(payload.markets) ? payload.markets as DexMarket[] : [];
      setDexItems(current => append ? mergeDexMarkets(current, next) : mergeDexMarkets(current.filter(item => favourites.includes(item.key)), next));
      setReceivedAt(payload.receivedAt || 0);
      setCached(Boolean(payload.cached));
      setDegraded(payload.degraded || "");
    } catch(error) {
      setDegraded(error instanceof Error ? error.message : "DEX provider unavailable");
    } finally {
      setLoading(false);
    }
  }, [query, chain, cursor, favourites]);

  useEffect(() => {
    if (!showDex) return;
    const timer = setTimeout(() => void loadDex(false), 220);
    return () => clearTimeout(timer);
  }, [showDex, query, chain, retry, loadDex]);

  useEffect(() => {
    if (!showGlobal) return;
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setGlobalLoading(true);
      void fetch(`/api/global-markets/search?query=${encodeURIComponent(text)}`, { signal: controller.signal })
        .then(async response => {
          const payload = await response.json() as { markets?: GlobalMarketDescriptor[]; receivedAt?: number; cached?: boolean; error?: string };
          if (!response.ok) throw new Error(payload.error || "Global market search is unavailable");
          setGlobalItems(Array.isArray(payload.markets) ? payload.markets : []);
          setGlobalReceivedAt(payload.receivedAt || 0);
          setGlobalCached(Boolean(payload.cached));
          setGlobalError("");
        })
        .catch(error => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setGlobalItems([]);
          setGlobalError(error instanceof Error ? error.message : "Global market search is unavailable");
        })
        .finally(() => { if (!controller.signal.aborted) setGlobalLoading(false); });
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [showGlobal, query, retry]);

  const dexFavouriteKeys = useMemo(() => favourites.map(parseDexFavourite).filter((item): item is DexFavorite => item !== null), [favourites]);
  useEffect(() => {
    if (tab !== "Favorites" || dexFavouriteKeys.length === 0) return;
    let cancelled = false;
    const missing = dexFavouriteKeys.filter(item => !dexItems.some(market => market.key === item.key));
    if (!missing.length) return;
    const hydrate = async () => {
      for (let index = 0; index < missing.length && !cancelled; index += 4) {
        const chunk = missing.slice(index, index + 4);
        const settled = await Promise.all(chunk.map(async favourite => {
          try {
            const response = await fetch(`/api/dex/markets?query=${encodeURIComponent(favourite.poolAddress)}&chain=${favourite.chain}&cursor=1`);
            if (!response.ok) return [] as DexMarket[];
            const payload = await response.json() as { markets?: DexMarket[] };
            return (payload.markets ?? []).filter(market => market.key === favourite.key);
          } catch { return [] as DexMarket[]; }
        }));
        if (!cancelled) setDexItems(current => mergeDexMarkets(current, settled.flat()));
      }
    };
    void hydrate();
    return () => { cancelled = true; };
  }, [tab, dexFavouriteKeys, dexItems]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown" && document.activeElement?.tagName === "INPUT") {
        event.preventDefault(); results.current?.querySelector<HTMLElement>("[role=option]")?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose]);

  const chooseTab = (value: string) => {
    const next = value as Primary;
    setTab(next);
    setSubtab(next === "Movers" ? "Gainers" : "All");
    setMoreOpen(false); setFiltersOpen(false); setLimit(80);
  };
  const setSortKey = (key: Sort) => {
    if (key === sort) setDirection(value => value === "asc" ? "desc" : "asc");
    else { setSort(key); setDirection(key === "market" ? "asc" : "desc"); }
  };
  const indicator = (key: Sort) => sort === key ? (direction === "asc" ? " ↑" : " ↓") : "";

  const visible = useMemo(() => {
    let marketTab: MarketTab = tab === "Favorites" ? "favorites" : tab === "Futures" ? "futures" : tab === "Spot" ? "spot" : "all";
    if (tab === "Favorites" && subtab === "Spot") marketTab = "spot";
    if (tab === "Favorites" && subtab === "Futures") marketTab = "futures";
    if (subtab === "Pre-Market") marketTab = "pre-market";
    if (subtab === "New") marketTab = "new";
    if (subtab === "Hot") marketTab = "hot";
    const quote = ["USDT","USDC","BTC","ETH"].includes(subtab) ? subtab : "All";
    let list = searchMarkets(markets, query, marketTab, quote, new Set(favourites), openedAt);
    if (tab === "Favorites") list = list.filter(market => favourites.includes(market.key));
    if (tab === "Futures" && subtab === "Delivery") list = list.filter(market => market.contractType === "delivery");
    if (tab === "Movers") {
      if (subtab === "Gainers") list = list.filter(market => (market.change24h || 0) > 0);
      if (subtab === "Losers") list = list.filter(market => (market.change24h || 0) < 0);
    }
    const value = (market: MarketDescriptor) => sort === "market" ? market.displayName : sort === "price" ? market.lastPrice || 0 : sort === "change" ? market.change24h || 0 : market.volume24h || 0;
    return [...list].sort((a,b) => { const av=value(a),bv=value(b); const result = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av)-Number(bv); return direction === "asc" ? result : -result; }).slice(0,limit);
  }, [markets, query, tab, subtab, favourites, openedAt, sort, direction, limit]);

  const dexVenues = useMemo(() => [...new Set(dexItems.filter(item => item.chain === "solana").map(item => item.dex).filter(Boolean))].sort((a,b) => a.localeCompare(b)), [dexItems]);
  const filteredDex = useMemo(() => {
    const list = dexItems.filter(item => {
      const standardSubtab = subtab === "All" || subtab === "Solana" || subtab === "BNB" || subtab === "DEX";
      const venueMatch = standardSubtab || normaliseVenue(item.dex).includes(normaliseVenue(subtab));
      const chainMatch = subtab === "BNB" ? item.chain === "bsc" : subtab === "Solana" ? item.chain === "solana" : true;
      const favouriteMatch = tab !== "Favorites" || favourites.includes(item.key);
      const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const queryMatch = words.every(word => `${item.symbol} ${item.name} ${item.quoteSymbol} ${item.dex} ${item.tokenAddress} ${item.poolAddress}`.toLowerCase().includes(word));
      const maxAge = (Number(filters.age)||Infinity)*3600000;
      return venueMatch && chainMatch && favouriteMatch && queryMatch && (item.liquidityUsd||0)>=(Number(filters.liquidity)||0) && (item.volume24h||0)>=(Number(filters.volume)||0) && (!item.createdAt || openedAt-item.createdAt<=maxAge);
    });
    const value=(market:DexMarket)=>sort==="market"?market.symbol:sort==="price"?market.priceUsd||0:sort==="change"?market.changes.h24||0:market.volume24h||0;
    return [...list].sort((a,b)=>{const av=value(a),bv=value(b);const result=typeof av==="string"?av.localeCompare(String(bv)):Number(av)-Number(bv);return direction==="asc"?result:-result;});
  },[dexItems, subtab, tab, favourites, query, filters, openedAt, sort, direction]);
  const filteredGlobal = useMemo(() => {
    const desired = subtab === "Stocks" ? "stock" : subtab === "ETFs" ? "etf" : subtab === "Forex" ? "forex" : subtab === "Crypto" ? "crypto" : null;
    return desired ? globalItems.filter(item => item.assetClass === desired) : globalItems;
  }, [globalItems, subtab]);

  const providerLabel = showGlobal
    ? globalError ? "⚠ Global unavailable" : globalCached ? "● Global cached" : globalReceivedAt ? "● Twelve Data" : "● Global Search"
    : showDex ? degraded ? "⚠ Degraded" : cached ? "● Cached" : receivedAt ? "● DEX live" : "● Connecting" : "● MEXC live";
  const mixedFavorites = tab === "Favorites" && subtab === "All";
  const hasResults = (showMexc && visible.length > 0) || (showDex && filteredDex.length > 0) || (showGlobal && filteredGlobal.length > 0);
  const moreItems = tab === "DizyDEX" ? dexVenues : mexcMore;
  const busy = loading || globalLoading;

  if (typeof document === "undefined") return null;
  return createPortal(<>
    <button aria-label="Close market browser" className={styles.backdrop} onClick={onClose}/>
    <section aria-label="Market Browser" aria-modal="true" className={styles.marketBrowser} ref={panelRef} role="dialog" style={{ top: position.top, left: position.left }}>
      <header className={styles.header}><strong>Market Browser</strong><button aria-expanded={statusOpen} className={`${styles.status} ${(showGlobal ? globalError : degraded) ? styles.degraded : (showGlobal ? globalCached : cached) ? styles.cached : ""}`} onClick={() => (showDex || showGlobal) && setStatusOpen(value=>!value)} type="button">{providerLabel}</button><button aria-label="Close market browser" className={styles.closeButton} onClick={onClose} type="button">×</button>{statusOpen && (showDex || showGlobal) ? <aside className={styles.statusPopover}><b>{showGlobal ? globalError ? "Global provider unavailable" : globalCached ? "Cached global search" : "Twelve Data search" : degraded ? "Provider degraded" : cached ? "Cached market data" : "Provider connected"}</b><p>{showGlobal ? globalError || "Global instrument discovery and chart candles are served through Twelve Data." : degraded || "DEX Screener / GeckoTerminal market data."}</p><button onClick={()=>setRetry(value=>value+1)} type="button">Retry</button></aside>:null}</header>
      <div className={styles.search}><span aria-hidden="true">⌕</span><input autoFocus aria-label="Search markets" onChange={event=>{const next=event.target.value;setQuery(next);setCursor("1");if(showGlobal&&next.trim().length<2){setGlobalItems([]);setGlobalError("");setGlobalCached(false);setGlobalReceivedAt(0);setGlobalLoading(false);}}} placeholder={showGlobal ? "Search global symbol or company…" : showDex && !showMexc ? "Search token, mint, pool or DEX…" : mixedFavorites ? "Search all favourites…" : "Search symbol, asset or contract…"} value={query}/>{query ? <button aria-label="Clear search" onClick={()=>{setQuery("");if(showGlobal){setGlobalItems([]);setGlobalError("");setGlobalCached(false);setGlobalReceivedAt(0);setGlobalLoading(false);}}} type="button">×</button>:null}</div>
      <Tabs className={styles.primaryTabs} items={primary} label="Market type" value={tab} onChange={chooseTab}/>
      <div className={styles.secondaryFilters}><Tabs className={styles.secondaryTabs} items={secondary[tab]} label={`${tab} filters`} value={subtab} onChange={(value, anchor)=>{if(value==="More"){if(anchor)setMorePosition({top:anchor.bottom+4,left:Math.max(8,Math.min(anchor.left,window.innerWidth-170))});setMoreOpen(current=>!current);}else{setSubtab(value);setMoreOpen(false);}}}/>{tab==="DizyDEX"?<button aria-expanded={filtersOpen} aria-label="DEX filters" className={styles.filterButton} onClick={()=>setFiltersOpen(value=>!value)} type="button">⚙</button>:null}
        {filtersOpen?<div className={styles.filterPopover}><label>Minimum liquidity<input min="0" type="number" value={filters.liquidity} onChange={event=>setFilters(current=>({...current,liquidity:event.target.value}))}/></label><label>Minimum 24h volume<input min="0" type="number" value={filters.volume} onChange={event=>setFilters(current=>({...current,volume:event.target.value}))}/></label><label>Maximum pair age (hours)<input min="0" type="number" value={filters.age} onChange={event=>setFilters(current=>({...current,age:event.target.value}))}/></label><button onClick={()=>setFilters({liquidity:"",volume:"",age:""})} type="button">Reset</button></div>:null}
      </div>
      {showGlobal ? <div className={styles.resultsHeader}><button disabled type="button">Instrument</button><button disabled type="button">Venue</button><button disabled type="button">Type</button><button className={styles.volumeColumn} disabled type="button">CCY</button></div> : <div className={styles.resultsHeader}><button onClick={()=>setSortKey("market")} type="button">{showDex && !showMexc?"Token / Pool":"Trading Pair"}{indicator("market")}</button><button onClick={()=>setSortKey("price")} type="button">Last{indicator("price")}</button><button onClick={()=>setSortKey("change")} type="button">24h{indicator("change")}</button><button className={styles.volumeColumn} onClick={()=>setSortKey("volume")} type="button">24h Vol{indicator("volume")}</button></div>}
      <div aria-busy={busy} aria-label={`${showGlobal ? "Global" : mixedFavorites?"Favourite":showDex&&!showMexc?"DEX":"MEXC"} market results`} className={styles.results} ref={results} role="listbox">
        {showMexc ? visible.map(market=><MexcRow key={market.key} market={market} selected={market.key===selectedMarketKey} favourite={favourites.includes(market.key)} onFavourite={()=>onFavourite(market.key)} onSelect={()=>onSelect(market)}/>) : null}
        {showDex ? filteredDex.map(market=><DexRow key={market.key} market={market} selected={market.key===(selectedDexMarketKey??dexSelected)} favourite={favourites.includes(market.key)} now={openedAt} onFavourite={()=>onFavourite(market.key)} onSelect={()=>{setDexSelected(market.key);onSelectDex(market)}}/>) : null}
        {showGlobal ? filteredGlobal.map(market=><GlobalRow key={market.key} market={market} selected={market.key===selectedGlobalMarketKey} onSelect={()=>onSelectGlobal(market)}/>) : null}
        {!hasResults && busy ? <div aria-label="Loading markets" className={styles.skeleton}>{Array.from({length:8},(_,index)=><i key={index}/>)}</div> : null}
        {!hasResults && !busy ? <div className={styles.empty}><b>{showGlobal ? query.trim().length < 2 ? "Search global markets" : "No global instruments found" : tab === "Favorites" ? "No favourites found" : showDex ? "No DEX markets found" : "No markets found"}</b><span>{showGlobal ? globalError || (query.trim().length < 2 ? "Enter at least two characters." : "Try another symbol or company name.") : degraded?"Cached results unavailable. Retry the provider.":tab === "Favorites" ? "Star a market to keep it here." : "Try another search or filter."}</span></div> : null}
        {showDex && filteredDex.length && !query && tab !== "Favorites"?<button className={styles.loadMore} disabled={loading} onClick={()=>{setCursor(String(Number(cursor)+1));void loadDex(true);}} type="button">{loading?"Loading…":"Load more markets"}</button>:null}
        {showMexc&&visible.length===limit?<button className={styles.loadMore} onClick={()=>setLimit(value=>value+80)} type="button">Load more markets</button>:null}
      </div>
    </section>
    {moreOpen ? createPortal(<div className={styles.moreMenu} style={{top:morePosition.top,left:morePosition.left}}>{moreItems.length ? moreItems.map(item=><button key={item} onClick={()=>{setSubtab(item);setMoreOpen(false);}} type="button">{item}</button>) : <button disabled type="button">Load DEX markets to discover venues</button>}</div>, document.body) : null}
  </>, document.body);
}
