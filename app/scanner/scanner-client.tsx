"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TERMINAL_SETTINGS, type UserTerminalSettings } from "../lib/config";
import { analyzeStrategy, type Candle } from "../lib/strategy";
import type { CandleTimeframe, MarketDescriptor } from "../lib/market/types";
import {
  buildScannerRow,
  normaliseWatchlist,
  scannerUniverse,
  sortScannerRows,
  type ScannerRow,
  type ScannerSort,
} from "../lib/market-scanner";
import styles from "./scanner.module.css";

const TIMEFRAMES: CandleTimeframe[] = ["5m", "15m", "30m", "1h", "4h", "1d"];
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const price = (value: number | null) => value === null ? "—" : value < 0.001 ? value.toPrecision(4) : Intl.NumberFormat("en", { maximumSignificantDigits: 8 }).format(value);
const signed = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function readSessionJson<T>(key: string): T | null {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function marketUniverse(markets: readonly MarketDescriptor[], watchlist: readonly string[], scope: "all" | "spot" | "futures") {
  if (watchlist.length) {
    const selected = normaliseWatchlist(watchlist, markets)
      .map(key => markets.find(market => market.key === key))
      .filter((market): market is MarketDescriptor => Boolean(market));
    return selected.filter(market => scope === "all" || market.marketType === scope);
  }
  const scoped = scope === "all" ? markets : markets.filter(market => market.marketType === scope);
  if (scope === "spot") return [...scoped].sort((a,b)=>(b.volume24h??0)-(a.volume24h??0)).slice(0,12);
  return scannerUniverse(scoped, [], 12);
}

export default function ScannerClient({readOnly,userName}:{readOnly:boolean;userName:string}) {
  const [settings,setSettings]=useState<UserTerminalSettings|null>(null);
  const [markets,setMarkets]=useState<MarketDescriptor[]>([]);
  const [watchlist,setWatchlist]=useState<string[]>([]);
  const [timeframe,setTimeframe]=useState<CandleTimeframe>("15m");
  const [scope,setScope]=useState<"all"|"spot"|"futures">("futures");
  const [query,setQuery]=useState("");
  const [rows,setRows]=useState<ScannerRow[]>([]);
  const [sort,setSort]=useState<ScannerSort>("setup");
  const [descending,setDescending]=useState(true);
  const [minScore,setMinScore]=useState(0);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState("Loading market catalogue…");
  const [refreshedAt,setRefreshedAt]=useState<number|null>(null);
  const request=useRef(0),abort=useRef<AbortController|null>(null);

  useEffect(()=>{
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      setLoading(true);
      void Promise.all([
        fetch("/api/profile",{signal:controller.signal}).then(async response=>response.ok?(await response.json() as {settings:UserTerminalSettings}).settings:DEFAULT_TERMINAL_SETTINGS),
        fetch("/api/markets?exchange=mexc",{signal:controller.signal}).then(async response=>response.ok?(await response.json() as {markets:MarketDescriptor[]}).markets:[]),
      ]).then(([profile,available])=>{
        if(controller.signal.aborted)return;
        const viewerStored=readOnly?readSessionJson<{keys?:string[];timeframe?:CandleTimeframe}>("dizy-scanner-watchlist"):null;
        setSettings(profile);
        setMarkets(available);
        setWatchlist(normaliseWatchlist(viewerStored?.keys??profile.market.favourites??[],available));
        setTimeframe(viewerStored?.timeframe&&TIMEFRAMES.includes(viewerStored.timeframe)?viewerStored.timeframe:(TIMEFRAMES.includes(profile.market.timeframe as CandleTimeframe)?profile.market.timeframe as CandleTimeframe:"15m"));
        setStatus(available.length?"Catalogue loaded. Scanning confirmed candles…":"MEXC market catalogue is unavailable.");
      }).catch(reason=>{
        if((reason as Error).name!=="AbortError")setStatus("Scanner initialization failed. Retry when the market feed is available.");
      }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },0);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[readOnly]);

  const scan=useCallback(async()=>{
    if(!settings||!markets.length)return;
    const scanId=++request.current;
    abort.current?.abort();
    const controller=new AbortController();abort.current=controller;
    const universe=marketUniverse(markets,watchlist,scope);
    setLoading(true);setStatus(`Scanning ${universe.length} markets on ${timeframe} confirmed candles…`);
    const failures:string[]=[];
    try{
      const values=await mapLimit(universe,4,async market=>{
        try{
          const response=await fetch(`/api/market?exchange=mexc&marketType=${market.marketType}&symbol=${encodeURIComponent(market.sourceSymbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=340`,{signal:controller.signal});
          if(!response.ok)throw new Error("feed unavailable");
          const payload=await response.json() as {candles:Candle[]};
          if(payload.candles.length<40)throw new Error("insufficient history");
          const analysis=analyzeStrategy(payload.candles,settings.strategy);
          return buildScannerRow(market,payload.candles,analysis,timeframe);
        }catch(reason){
          if((reason as Error).name==="AbortError")throw reason;
          failures.push(market.displayName);return null;
        }
      });
      if(scanId!==request.current||controller.signal.aborted)return;
      setRows(values.filter((row):row is ScannerRow=>Boolean(row)));
      setRefreshedAt(Date.now());
      setStatus(failures.length?`${values.length-failures.length} markets scanned · ${failures.length} unavailable.`:`${values.length} markets scanned from confirmed candle history.`);
    }catch(reason){if((reason as Error).name!=="AbortError"&&scanId===request.current)setStatus("Scanner refresh failed. Existing results have been preserved.");}
    finally{if(scanId===request.current&&!controller.signal.aborted)setLoading(false);}
  },[markets,scope,settings,timeframe,watchlist]);

  useEffect(()=>{
    if(!settings||!markets.length)return;
    const timer=window.setTimeout(()=>void scan(),80);
    return()=>window.clearTimeout(timer);
  },[settings,markets.length,scan]);
  useEffect(()=>{
    if(!settings||!markets.length)return;
    const timer=window.setInterval(()=>void scan(),60000);
    return()=>window.clearInterval(timer);
  },[settings,markets.length,scan]);
  useEffect(()=>()=>abort.current?.abort(),[]);

  const visible=useMemo(()=>sortScannerRows(rows.filter(row=>row.setupScore>=minScore),sort,descending),[rows,minScore,sort,descending]);
  const searchResults=useMemo(()=>{
    const term=query.trim().toLowerCase();
    if(!term)return [];
    return markets.filter(market=>!watchlist.includes(market.key)&&`${market.displayName} ${market.baseAsset} ${market.quoteAsset} ${market.marketType}`.toLowerCase().includes(term)).sort((a,b)=>(b.volume24h??0)-(a.volume24h??0)).slice(0,12);
  },[markets,query,watchlist]);

  function toggleSort(next:ScannerSort){if(next===sort)setDescending(value=>!value);else{setSort(next);setDescending(next!=="market");}}
  function addMarket(key:string){setWatchlist(items=>normaliseWatchlist([...items,key],markets));setQuery("");}
  function removeMarket(key:string){setWatchlist(items=>items.filter(item=>item!==key));}

  async function saveWatchlist(){
    if(!settings)return;
    const keys=normaliseWatchlist(watchlist,markets);
    setSaving(true);setStatus(readOnly?"Saving this viewer-session watchlist…":"Saving watchlist to your terminal profile…");
    try{
      if(readOnly){sessionStorage.setItem("dizy-scanner-watchlist",JSON.stringify({keys,timeframe}));setStatus("Viewer-session watchlist saved in this browser tab.");return;}
      const response=await fetch("/api/profile",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({favourites:keys,timeframe})});
      const body=await response.json() as {settings?:UserTerminalSettings;error?:string};
      if(!response.ok||!body.settings)throw new Error(body.error??"Watchlist could not be saved.");
      setSettings(body.settings);setStatus("Watchlist saved to your DizyTrades profile.");
    }catch(reason){setStatus((reason as Error).message||"Watchlist could not be saved.");}finally{setSaving(false);}
  }

  async function openMarket(row:ScannerRow){
    if(!settings)return;
    const market=markets.find(item=>item.key===row.marketKey);if(!market)return;
    setStatus(`Opening ${market.displayName} in DizyCharts…`);
    const favourites=normaliseWatchlist(watchlist,markets);
    try{
      if(readOnly){
        sessionStorage.setItem("dizy-viewer-market",JSON.stringify({...settings.market,symbol:market.sourceSymbol,marketKey:market.key,timeframe,favourites}));
      }else{
        const response=await fetch("/api/profile",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({symbol:market.sourceSymbol,marketKey:market.key,timeframe,favourites})});
        if(!response.ok)throw new Error();
      }
      window.location.assign("/terminal");
    }catch{setStatus("The selected market could not be opened because profile settings were not saved.");}
  }

  return <main className={styles.shell}>
    <header className={styles.topbar}><div><b>DizyTrades</b><span>DizyScanner</span></div><nav><a href="/terminal">DizyCharts</a><a href="/structure">DizyStructure</a><a href="/performance">DizyPerformance</a><a href="/journal">DizyJournal</a><strong>{userName}{readOnly?" · Viewer":""}</strong></nav></header>
    <section className={styles.hero}><div><span>CLOSED-CANDLE MARKET SCANNER</span><h1>Find current confluence without opening every chart.</h1><p>Uses your existing DizySignals strategy settings. Scores describe retained chart evidence, not probability of profit.</p></div><div className={styles.heroActions}><button disabled={loading} onClick={()=>void scan()}>{loading?"Scanning…":"Refresh scan"}</button><button disabled={saving} onClick={()=>void saveWatchlist()}>{saving?"Saving…":"Save watchlist"}</button></div></section>
    <section className={styles.controls} aria-label="Scanner controls">
      <label>Timeframe<select value={timeframe} onChange={event=>setTimeframe(event.target.value as CandleTimeframe)}>{TIMEFRAMES.map(item=><option key={item}>{item}</option>)}</select></label>
      <label>Markets<select value={scope} onChange={event=>setScope(event.target.value as typeof scope)}><option value="futures">Futures</option><option value="spot">Spot</option><option value="all">All</option></select></label>
      <label>Minimum setup score<select value={minScore} onChange={event=>setMinScore(Number(event.target.value))}>{[0,1,2,3,4,5].map(value=><option value={value} key={value}>{value}/5</option>)}</select></label>
      <div className={styles.status} role="status" aria-live="polite"><b>{status}</b><small>{refreshedAt?`Updated ${new Date(refreshedAt).toLocaleTimeString()} · automatic refresh every 60 seconds`:"Waiting for first completed scan."}</small></div>
    </section>
    <section className={styles.watchlist}><div><h2>Watchlist</h2><p>{watchlist.length?`${watchlist.length} saved candidates selected.`:"No saved symbols yet. Showing a bounded top-volume default universe."}</p></div><div className={styles.search}><input aria-label="Add market to watchlist" placeholder="Search BTC, SOL, futures, spot…" value={query} onChange={event=>setQuery(event.target.value)}/>{searchResults.length?<div className={styles.searchResults}>{searchResults.map(market=><button key={market.key} onClick={()=>addMarket(market.key)}><span>{market.displayName}</span><small>{market.marketType} · {market.volume24h?compact.format(market.volume24h):"volume unavailable"}</small></button>)}</div>:null}</div><div className={styles.chips}>{watchlist.map(key=>{const market=markets.find(item=>item.key===key);return market?<span key={key}>{market.displayName}<small>{market.marketType}</small><button aria-label={`Remove ${market.displayName}`} onClick={()=>removeMarket(key)}>×</button></span>:null})}</div></section>
    <section className={styles.results} aria-busy={loading}><header><div><h2>Current setup evidence</h2><p>{visible.length} markets · confirmed candles only</p></div><small>Click a row to open it in DizyCharts.</small></header>
      <div className={styles.table} role="table" aria-label="Multi-symbol scanner results">
        <div className={styles.tableHead} role="row"><button onClick={()=>toggleSort("market")}>Market {sort==="market"?(descending?"↓":"↑"):""}</button><span>Price</span><button onClick={()=>toggleSort("change")}>24h {sort==="change"?(descending?"↓":"↑"):""}</button><button onClick={()=>toggleSort("setup")}>Setup {sort==="setup"?(descending?"↓":"↑"):""}</button><button onClick={()=>toggleSort("signal")}>Latest signal {sort==="signal"?(descending?"↓":"↑"):""}</button><span>Phase</span><button onClick={()=>toggleSort("volume")}>Volume {sort==="volume"?(descending?"↓":"↑"):""}</button></div>
        {visible.length?visible.map(row=><button className={styles.row} key={`${row.marketKey}:${row.timeframe}`} onClick={()=>void openMarket(row)} role="row"><span className={styles.market}><b>{row.displayName}</b><small>{row.marketType} · {row.timeframe} · {row.candleCount} candles</small></span><span>{price(row.lastPrice)}</span><span className={row.change24h===null?styles.neutral:row.change24h>=0?styles.positive:styles.negative}>{signed(row.change24h)}</span><span className={row.setupDirection==="long"?styles.positive:row.setupDirection==="short"?styles.negative:styles.neutral}><b>{row.setupScore}/5</b><small>L {row.scoreLong} · S {row.scoreShort} · {row.bias}</small></span><span>{row.latestSignal?<><b className={row.latestSignal==="buy"?styles.positive:styles.negative}>{row.latestSignal.toUpperCase()} · {row.latestSignalConfluence}/5</b><small>{row.signalAgeBars===0?"latest closed candle":`${row.signalAgeBars} bars ago`}</small></>:<small>No signal within 20 bars</small>}</span><span><b>{row.phase}</b><small>{row.finalCandleTime?new Date(row.finalCandleTime*1000).toLocaleString():"time unavailable"}</small></span><span>{row.volume24h===null?"—":compact.format(row.volume24h)}</span></button>):<div className={styles.empty}>{loading?"Scanning selected markets…":"No markets match the current filters."}</div>}
      </div>
    </section>
  </main>;
}
