"use client";

import { useEffect, useMemo, useState } from "react";
import {
  classifyDizyQuantLiveSnapshot,
  DIZYQUANT_LIVE_EVENT,
  DIZYQUANT_LIVE_STORAGE_KEY,
  readDizyQuantLiveSnapshot,
  type DizyQuantLiveSnapshot,
  type DizyQuantLiveState,
} from "@/app/lib/dizyquant/live-snapshot";
import styles from "./research.module.css";

const stateLabel: Record<DizyQuantLiveState, string> = {
  waiting: "Waiting for terminal evidence",
  live: "Live terminal evidence",
  limited: "Limited / recovering evidence",
  replay: "Historical Replay evidence",
  stale: "Terminal snapshot awaiting refresh",
};

const signed = (value: number | null) => value === null ? "Unavailable" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const unsigned = (value: number | null) => value === null ? "Unavailable" : `${value.toFixed(4)}%`;
const stamp = (value: number) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function DizyQuantLivePanel() {
  const [snapshot, setSnapshot] = useState<DizyQuantLiveSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => { setSnapshot(readDizyQuantLiveSnapshot()); setNow(Date.now()); };
    refresh();
    const custom = () => refresh();
    const storage = (event: StorageEvent) => { if (event.key === DIZYQUANT_LIVE_STORAGE_KEY) refresh(); };
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    window.addEventListener(DIZYQUANT_LIVE_EVENT, custom);
    window.addEventListener("storage", storage);
    return () => {
      window.clearInterval(clock);
      window.removeEventListener(DIZYQUANT_LIVE_EVENT, custom);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const state = useMemo(() => classifyDizyQuantLiveSnapshot(snapshot, now), [snapshot, now]);

  if (!snapshot) return <section className={styles.livePanel} data-state="waiting" data-testid="dizyquant-live-panel">
    <div className={styles.liveHeading}><div><p>LIVE TERMINAL BRIDGE</p><h2>Waiting for bounded evidence.</h2></div><span className={styles.liveState}>Waiting</span></div>
    <p className={styles.liveEmpty}>Open DizyCharts once to publish a safe derived snapshot. DizyQuant never stores raw candles, DOM rows, account data, credentials or order instructions.</p>
  </section>;

  return <section className={styles.livePanel} data-state={state} data-testid="dizyquant-live-panel">
    <div className={styles.liveHeading}>
      <div><p>LIVE TERMINAL BRIDGE</p><h2>{snapshot.market.symbol} · {snapshot.market.timeframe}</h2><small>{snapshot.market.venue}</small></div>
      <span className={styles.liveState}>{stateLabel[state]}</span>
    </div>
    <div className={styles.liveSummary}>
      <article><span>{snapshot.evidenceCoveragePct.toFixed(0)}%</span><p>factor coverage</p></article>
      <article><span>{snapshot.sourceConfidencePct.toFixed(0)}%</span><p>source confidence</p></article>
      <article><span>{snapshot.strategy.longScore}/{snapshot.strategy.shortScore}</span><p>long / short score</p></article>
      <article><span>{snapshot.flow.confidencePct === null ? "—" : `${snapshot.flow.confidencePct.toFixed(0)}%`}</span><p>DizyFlow confidence</p></article>
    </div>
    <div className={styles.factorGrid}>{snapshot.factors.map(value => <article key={value.id} data-available={value.value !== null}>
      <small>{value.evidence}</small><h3>{value.label}</h3><strong>{value.interpretation === "friction" ? unsigned(value.value) : signed(value.value)}</strong><p>{value.value === null ? "The required public evidence is not available." : value.interpretation === "friction" ? "Lower values indicate less visible spread friction." : "Positive favours bid/buy pressure; negative favours ask/sell pressure."}</p>
    </article>)}</div>
    <div className={styles.liveDetails}>
      <span>Strategy: {snapshot.strategy.direction} · {snapshot.strategy.marketBias} · {snapshot.strategy.marketPhase}</span>
      <span>Flow: {snapshot.flow.availability} · {snapshot.flow.wallCount} walls · {snapshot.flow.sweepCount} sweeps · {snapshot.flow.absorptionCount} absorption candidates</span>
      <span>Terminal snapshot published {stamp(snapshot.capturedAt)} · {snapshot.flow.limitationCount} flow limitations</span>
    </div>
    <p className={styles.liveBoundary}><strong>Research-only observation.</strong> These derived factors are not signal-eligible, decision-eligible or execution-eligible, and they do not alter DizySignals, paper trading or live-order logic.</p>
  </section>;
}
