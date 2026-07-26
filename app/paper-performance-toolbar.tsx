"use client";

import { useEffect, useRef, useState } from "react";
import type { LivePaperSnapshot } from "./lib/paper-performance";
import { formatSignedMoney, tradeExitLabel } from "./lib/paper-performance";

export const finiteNumber = (value: number, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const pct = (value: number) => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "—";
const tone = (value: number) => value > 0 ? "positive" : value < 0 ? "negative" : "neutral";

export function PaperPerformanceToolbar({ snapshot, enabled, calculating }: { snapshot: LivePaperSnapshot; enabled: boolean; calculating: boolean }) {
  const [open, setOpen] = useState(false);
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
  const trades = snapshot.closedTrades.slice(-30).reverse();
  return <div className="paper-performance" ref={root}>
    <div aria-label="Paper simulation performance" className="paper-metrics">
      <span className={enabled ? "paper-badge" : "paper-badge off"}>{enabled ? "PAPER" : "SIM OFF"}</span>
      <span className="paper-label">Paper simulation</span>
      {calculating ? <span className="calculating">Calculating…</span> : <>
        <strong className={tone(snapshot.returnPct)}>{pct(snapshot.returnPct)}</strong>
        <span>Equity <b>{Number.isFinite(snapshot.endingEquity) ? `$${finiteNumber(snapshot.endingEquity)}` : "—"}</b></span>
        <span className={tone(snapshot.pnl)}>P/L <b>{formatSignedMoney(snapshot.pnl)}</b></span>
        <span><b>{snapshot.trades}</b> trades</span>
        <span className="paper-detail"><b>{Number.isFinite(snapshot.winRatePct) ? `${finiteNumber(snapshot.winRatePct, 0)}%` : "—"}</b> win</span>
        <span className="paper-detail">DD <b>{Number.isFinite(snapshot.maxDrawdownPct) ? `${finiteNumber(snapshot.maxDrawdownPct, 1)}%` : "—"}</b></span>
        <span className="paper-detail">PF <b>{snapshot.profitFactor == null ? "—" : finiteNumber(snapshot.profitFactor)}</b></span>
        <span className="mtm-badge">{enabled && snapshot.liveMtm ? "LIVE MTM" : "CONFIRMED"}</span>
      </>}
      <button aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)} type="button">History</button>
    </div>
    {open ? <div aria-label="Recent simulated trades" aria-modal="false" className="paper-history" role="dialog">
      <div className="paper-history-head"><div><strong>Paper simulation history</strong><small>Most recent {trades.length} · simulation only</small></div><button aria-label="Close trade history" onClick={() => setOpen(false)} type="button">×</button></div>
      <div className="paper-table-wrap"><table><thead><tr><th>Entry time</th><th>Side</th><th>Entry</th><th>Exit / mark</th><th>P/L</th><th>P/L %</th><th>Result</th><th>Exit reason</th></tr></thead><tbody>{trades.length ? trades.map(trade => <tr key={trade.id}><td>{new Date(trade.entryTime * 1000).toLocaleString()}</td><td>{trade.direction === "long" ? "Long" : "Short"}</td><td>{finiteNumber(trade.entry)}</td><td>{finiteNumber(trade.exit)}</td><td className={tone(trade.pnl)}>{formatSignedMoney(trade.pnl)}</td><td className={tone(trade.pnlPct)}>{pct(trade.pnlPct)}</td><td>{trade.exitReason === "MARK" ? "Open" : trade.result}</td><td>{tradeExitLabel(trade.exitReason)}</td></tr>) : <tr><td colSpan={8}>No simulated trades yet.</td></tr>}</tbody></table></div>
    </div> : null}
  </div>;
}
