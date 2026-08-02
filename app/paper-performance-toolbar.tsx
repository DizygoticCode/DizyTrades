"use client";

import { useEffect, useRef, useState } from "react";
import type { LivePaperSnapshot } from "./lib/paper-performance";
import type { PaperTrade } from "./lib/backtest";
import { formatSignedMoney, tradeExitLabel } from "./lib/paper-performance";
import type { SimulationStatus } from "./lib/paper-simulation";
import { tradeSnapshotFromPaper, type JournalTradeContext } from "./lib/journal-trade-import";
import { observePaperCompletions, type PaperCompletionTracker } from "./lib/paper-completion";

export const finiteNumber = (value: number, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const pct = (value: number) => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "—";
const tone = (value: number) => value > 0 ? "positive" : value < 0 ? "negative" : "neutral";

export function PaperPerformanceToolbar({ snapshot, enabled, status, error, onRetry, journalContext, completionIdentity, readOnly=false }: { snapshot: LivePaperSnapshot | null; enabled: boolean; status: SimulationStatus; error: string | null; onRetry: () => void; journalContext?:JournalTradeContext;completionIdentity:string;readOnly?:boolean }) {
  const [open, setOpen] = useState(false);
  const [completed,setCompleted]=useState<PaperTrade|null>(null),[notice,setNotice]=useState(""),[journalBusy,setJournalBusy]=useState(false);
  const completionTracker=useRef<PaperCompletionTracker|null>(null);
  useEffect(()=>{const timer=window.setTimeout(()=>{if(!snapshot){completionTracker.current=null;setCompleted(null);return;}const identityChanged=completionTracker.current?.identity!==completionIdentity;const observation=observePaperCompletions(completionTracker.current,completionIdentity,snapshot.closedTrades);completionTracker.current=observation.tracker;if(identityChanged)setCompleted(null);if(observation.completed)setCompleted(observation.completed);},0);return()=>window.clearTimeout(timer);},[completionIdentity,snapshot]);
  async function addToJournal(trade:PaperTrade){if(!journalContext||journalBusy)return;setJournalBusy(true);setNotice("");try{const body={type:"trade-review",notes:"",tags:[],trade:tradeSnapshotFromPaper(trade,journalContext),replayMemory:{candles:journalContext.replay.candles,capturedAtMs:Date.now()}};const response=await fetch("/api/journal",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const payload=await response.json();if(response.ok){location.href=`/journal?entry=${payload.entry.id}`;return;}if(response.status===409&&payload.existingEntry?.id){setNotice("This trade already has a Journal review.");location.href=`/journal?entry=${encodeURIComponent(payload.existingEntry.id)}`;return;}setNotice(payload.error?.message??"Trade review could not be created.");}catch{setNotice("Trade review could not be created. Try again.");}finally{setJournalBusy(false);}}
  function openReplay(trade:PaperTrade){if(!journalContext||!tradeSnapshotFromPaper(trade,journalContext).replay?.available){setNotice("Replay data is unavailable for this trade.");return;}location.href=`/terminal?replayMarketKey=${encodeURIComponent(journalContext.marketKey)}&replaySymbol=${encodeURIComponent(journalContext.symbol)}&replayTimeframe=${journalContext.timeframe}&replayAt=${trade.entryTime*1000}`;}
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [open]);
  const trades = snapshot?.closedTrades.slice(-30).reverse() ?? [];
  const initial = !snapshot && (status === "idle" || status === "calculating" || status === "updating");
  return <div className="paper-performance" ref={root}>
    <div aria-label="Paper simulation performance" className="paper-metrics">
      <span className={enabled ? "paper-badge" : "paper-badge off"}>{enabled ? "PAPER" : "SIM OFF"}</span>
      <span className="paper-label">Paper simulation</span>
      {initial ? <span className="calculating">Calculating…</span> : snapshot ? <>
        <strong className={tone(snapshot.returnPct)}>{pct(snapshot.returnPct)}</strong>
        <span>Equity <b>{Number.isFinite(snapshot.endingEquity) ? `$${finiteNumber(snapshot.endingEquity)}` : "—"}</b></span>
        <span className={tone(snapshot.pnl)}>P/L <b>{formatSignedMoney(snapshot.pnl)}</b></span>
        <span><b>{snapshot.trades}</b> trades</span>
        <span className="paper-detail"><b>{Number.isFinite(snapshot.winRatePct) ? `${finiteNumber(snapshot.winRatePct, 0)}%` : "—"}</b> win</span>
        <span className="paper-detail">DD <b>{Number.isFinite(snapshot.maxDrawdownPct) ? `${finiteNumber(snapshot.maxDrawdownPct, 1)}%` : "—"}</b></span>
        <span className="paper-detail">PF <b>{snapshot.profitFactor == null ? "—" : finiteNumber(snapshot.profitFactor)}</b></span>
        <span className="mtm-badge">{enabled && snapshot.liveMtm ? "LIVE MTM" : "CONFIRMED"}</span>
      </> : null}
      {snapshot && status === "updating" ? <span className="calculating">Updating…</span> : null}
      {status === "insufficient-history" ? <span className="paper-status-error">Insufficient confirmed candle history.</span> : null}
      {status === "error" ? <><span className="paper-status-error">{error || "Simulation failed."}</span><button className="paper-retry" onClick={onRetry} type="button">Retry</button></> : null}
      <button aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)} type="button">History</button>
    </div>
    {completed&&!readOnly?<div aria-label="Trade complete" aria-modal="false" className="trade-complete" role="dialog"><strong>Trade Complete</strong><b>{journalContext?.symbol} {completed.direction==="long"?"Long":"Short"}</b><span className={tone(completed.pnlPct)}>{pct(completed.pnlPct)}</span><p>What would you like to do?</p><div><button disabled={journalBusy} onClick={()=>openReplay(completed)}>Open Replay</button><button disabled={journalBusy} onClick={()=>void addToJournal(completed)}>{journalBusy?"Adding…":"Add to DizyJournal"}</button><button disabled={journalBusy} onClick={()=>setCompleted(null)}>Close</button></div>{notice?<small role="status">{notice}</small>:null}</div>:null}
    {open ? <div aria-label="Recent simulated trades" aria-modal="false" className="paper-history" role="dialog">
      <div className="paper-history-head"><div><strong>Paper simulation history</strong><small>Most recent {trades.length} · historical signal simulation · live Historical DizyFlow capture unavailable</small></div><button aria-label="Close trade history" onClick={() => setOpen(false)} type="button">×</button></div>
      <div className="paper-table-wrap" id="paper-history"><table><thead><tr><th>Entry time</th><th>Side</th><th>Entry</th><th>Exit / mark</th><th>P/L</th><th>P/L %</th><th>Result</th><th>Exit reason</th><th>Journal</th></tr></thead><tbody>{trades.length ? trades.map(trade => <tr key={trade.id}><td>{new Date(trade.entryTime * 1000).toLocaleString()}</td><td>{trade.direction === "long" ? "Long" : "Short"}</td><td>{finiteNumber(trade.entry)}</td><td>{finiteNumber(trade.exit)}</td><td className={tone(trade.pnl)}>{formatSignedMoney(trade.pnl)}</td><td className={tone(trade.pnlPct)}>{pct(trade.pnlPct)}</td><td>{trade.exitReason === "MARK" ? "Open" : trade.result}</td><td>{tradeExitLabel(trade.exitReason)}</td><td>{trade.exitReason!=="MARK"&&!readOnly?<button disabled={journalBusy} onClick={()=>void addToJournal(trade)}>{journalBusy?"Adding…":"Add to DizyJournal"}</button>:"—"}</td></tr>) : <tr><td colSpan={9}>No simulated trades yet.</td></tr>}</tbody></table></div>
    </div> : null}
  </div>;
}
