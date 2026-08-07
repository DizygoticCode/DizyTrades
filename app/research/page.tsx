import type { Metadata } from "next";
import Link from "next/link";
import { buildDizyQuantResearchPresentation } from "@/app/lib/dizyquant/presentation";
import { DizyQuantLivePanel } from "./dizyquant-live-panel";
import styles from "./research.module.css";

export const metadata: Metadata = {
  title: "DizyQuant Research Lab | DizyTrades",
  description: "Inspect the bounded DizyQuant metric registry, safe derived evidence and the active representative evidence campaign without exposing raw market or execution data.",
};

const campaignScope = [
  ["3", "symbols", "BTC_USDT · ETH_USDT · SOL_USDT"],
  ["3", "regimes", "range · directional · volatility-shock"],
  ["50", "qualified per cell", "required before a matrix cell is coverage-ready"],
  ["450", "first-matrix minimum", "qualified observations before all nine cells are coverage-ready"],
] as const;

export default function DizyQuantResearchPage() {
  const research = buildDizyQuantResearchPresentation();
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/" className={styles.brand}>DizyTrades</Link><div><Link href="/explore">Terminal</Link><a href="https://github.com/DizygoticCode/DizyTrades" target="_blank" rel="noopener noreferrer">GitHub</a></div></nav>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>BOUNDED READ-ONLY RESEARCH</p>
      <h1>DizyQuant Research Lab</h1>
      <p>DizyQuant measures public market microstructure, records exact evidence quality and tests candidate formulas without silently promoting them into trading logic. The foundation is complete; representative evidence collection and explicit retain/reject/revise decisions are now the active programme.</p>
      <div className={styles.heroActions}><Link href="/explore">Open Terminal</Link><a href="https://github.com/DizygoticCode/DizyTrades/blob/main/docs/DIZYQUANT_RESEARCH_CONTRACT.md" target="_blank" rel="noopener noreferrer">Read Research Contract</a></div>
    </section>
    <section className={styles.warning} aria-label="Research safety boundary"><strong>Live values are derived and display-only.</strong><span>No raw book stream, candle history, account data or order instruction is exposed; no metric is decision-eligible and DizyQuant remains forbidden from influencing production signal logic.</span></section>
    <DizyQuantLivePanel />
    <section className={styles.stats} aria-label="DizyQuant registry summary">
      <article><span>{research.totalMetricCount}</span><p>versioned metric identities</p></article>
      <article><span>{research.snapshotGradeCount}</span><p>snapshot-grade metrics</p></article>
      <article><span>{research.continuousStreamGradeCount}</span><p>continuous-stream metrics</p></article>
      <article><span>{research.experimentalCount}</span><p>experimental candidates</p></article>
      <article><span>{research.signalEligibleCount}</span><p>signal-eligible metrics</p></article>
    </section>
    <section className={styles.section}>
      <div className={styles.heading}><p>ACTIVE EVIDENCE CAMPAIGN</p><h2>Representative coverage before conclusions.</h2></div>
      <div className={styles.sliceGrid}>{campaignScope.map(([value, label, summary]) => <article key={label}><span>{value}</span><small>bounded scope</small><h3>{label}</h3><p>{summary}</p></article>)}</div>
      <div className={styles.warning} role="note"><strong>Coverage-ready is not validation.</strong><span>Qualified samples still require held-out, circular-null and walk-forward review. Every result remains decision-ineligible, signal-ineligible, execution-ineligible and promotion-ineligible until a separate reviewed promotion change says otherwise.</span></div>
    </section>
    <section className={styles.section}>
      <div className={styles.heading}><p>FOUNDATION STATUS</p><h2>Six focused slices, one evidence boundary.</h2></div>
      <div className={styles.sliceGrid}>{research.slices.map(slice => <article key={slice.number}><span>{String(slice.number).padStart(2, "0")}</span><small>{slice.status}</small><h3>{slice.name}</h3><p>{slice.summary}</p></article>)}</div>
    </section>
    <section className={styles.section}>
      <div className={styles.heading}><p>SAFETY CONTRACT</p><h2>Research can describe evidence. It cannot quietly become a signal.</h2></div>
      <ul className={styles.safeguards}>{research.safeguards.map(value => <li key={value}>{value}</li>)}</ul>
    </section>
    <section className={styles.section}>
      <div className={styles.heading}><p>METRIC REGISTRY · {research.metricSetVersion}</p><h2>Every identity has a unit, evidence grade and promotion state.</h2></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Metric</th><th>Unit</th><th>Evidence</th><th>Status</th></tr></thead><tbody>{research.metrics.map(metric => <tr key={metric.id}><td><strong>{metric.label}</strong><code>{metric.id}</code></td><td>{metric.unit}</td><td>{metric.evidenceGrade}</td><td><span className={metric.promotionStatus === "experimental" ? styles.experimental : styles.informational}>{metric.promotionStatus}</span></td></tr>)}</tbody></table></div>
    </section>
    <footer className={styles.footer}><p>DizyQuant is research infrastructure, not financial advice. Simulated or historical associations do not guarantee future performance.</p><Link href="/">Back to Everything Dizy™</Link></footer>
  </main>;
}
