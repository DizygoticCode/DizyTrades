import Link from "next/link";
import SiteHeader, { Brand, GitHubIcon } from "./site-header";
import TerminalPreview from "./terminal-preview";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";

const products = [
  ["DizyCharts", "Observe", "Real-time charting, indicators and manual drawing tools for building market structure."],
  ["DizySignals", "Explain", "Confirmed-candle confluence analysis that shows why a setup qualifies—or why it does not."],
  ["DizyBrain", "Understand", "Typed current evidence, deterministic historical reviews and recurring Behaviour observations."],
  ["DizyFlow", "Follow", "Market Depth, professional DOM, retained liquidity, public trades and flow diagnostics."],
  ["DizyQuant", "Research", "Versioned microstructure metrics, evidence grades and deterministic Replay validation with no signal influence."],
  ["DizyScanner", "Discover", "Saved watchlists and bounded multi-symbol scanning using the same confirmed-candle engine."],
  ["DizyStructure", "Context", "UTC sessions, opening ranges, anchored VWAP, confirmed swings and timeframe alignment."],
  ["DizyPaper", "Practise", "Manual and signal-based futures simulation for process, risk, management and review."],
  ["DizyJournal", "Record", "Immutable completed-trade facts, notes, tags, statistics and Guided Historical Review."],
  ["DizyReplay", "Reconstruct", "Candle-by-candle playback with rebuilt analysis and retained Historical DizyFlow evidence."],
  ["DizyPerformance", "Measure", "Realised PnL, drawdown, expectancy, coverage and deterministic trade breakdowns."],
  [SCHOOL_DISPLAY_NAME, "Learn", "DizyAcademy spans foundations, order flow and every current DizyTrades workflow."],
  ["DizyDEX", "Explore", "Research public on-chain pools with chain, liquidity, identity and provider context."],
  ["DizyOps", "Diagnose", "Owner-only bounded deployment, runtime, storage and operational health diagnostics."],
  ["DizyBackup", "Protect", "Integrity-checked JSON/CSV export, restore dry-run and additive account recovery."],
  ["DizyTrade", "Coming Later", "Future guarded exchange connectivity after read-only shadow mode and independent security review."],
];

const features = [
  ["mexc", "CENTRALISED MARKETS", "Move from market selection to structure", "Search supported MEXC Spot and Futures instruments, compare contracts and move from price action to depth without stitching together separate tools."],
  ["dex", "ON-CHAIN DISCOVERY", "Find the market before the chart", "DizyDEX brings pool discovery for Solana, BNB Chain and more into one consistent research flow—with chain, liquidity and pair context close at hand."],
  ["signals", "TRANSPARENT ANALYSIS", "Understand why a setup qualified", "DizySignals evaluates independent evidence only after a candle closes. DizyBrain explains confirmation and rejection from typed evidence instead of presenting a bare buy or sell label."],
  ["flow", "ORDER-FLOW CONTEXT", "See the market beneath the candle", "DizyFlow combines Market Depth, a professional DOM, retained liquidity, executed trade bubbles and feed health so advertised interest and completed transactions stay distinct."],
  ["research", "VERSIONED MICROSTRUCTURE RESEARCH", "Measure first. Validate before promotion.", "DizyQuant provides 67 versioned metric identities across ladder state, aggressive flow, liquidity migration, resilience and experimental candidate events. The bounded research page exposes definitions and evidence status—not live values or trading instructions."],
  ["scanner", "MULTI-MARKET DISCOVERY", "Find candidates without inventing conviction", "DizyScanner applies the same closed-candle strategy settings across a bounded watchlist, while DizyStructure adds sessions, anchored value, swings and timeframe alignment before a chart is opened."],
  ["paper", "SIMULATION AND REVIEW", "Practice the process, not the promise", "Use DizyPaper for manual plans and signal simulations, capture immutable facts in DizyJournal, reconstruct them in Replay and complete a Guided Historical Review without risking real funds."],
  ["performance", "MEASURABLE IMPROVEMENT", "Separate process from outcome", "DizyPerformance measures realised Journal outcomes while DizyBrain Behaviour surfaces recurring reviewed patterns with explicit coverage and sample-size limits."],
  ["school", "BUILT-IN ACADEMY", "Learn the exact workflow you are using", `${SCHOOL_DISPLAY_NAME} progresses from trading foundations through Scanner, Structure, DizyFlow, Replay, Guided Review, Performance, operations and recovery.`],
  ["backup", "OPERATIONS AND RECOVERY", "Know the build and protect the evidence", "DizyOps exposes bounded operational health. DizyBackup exports user-owned evidence with integrity checks, validates every restore through a dry-run and applies only safe additive recovery."],
];

const featureHref = (id: string) => {
  if (id === "dex") return "/dex";
  if (id === "school") return "/school";
  if (id === "scanner") return "/scanner";
  if (id === "performance") return "/performance";
  if (id === "backup") return "/backup";
  if (id === "research") return "/research";
  return "/explore";
};

const featureName = (id: string) => {
  if (id === "mexc") return "markets";
  if (id === "school") return SCHOOL_DISPLAY_NAME;
  if (id === "scanner") return "DizyScanner";
  if (id === "performance") return "DizyPerformance";
  if (id === "backup") return "DizyBackup";
  if (id === "research") return "DizyQuant";
  return `Dizy${id[0].toUpperCase()}${id.slice(1)}`;
};

export default function MarketingPage() {
  return <div className="marketing-shell"><SiteHeader /><main>
    <section className="hero"><div className="hero-glow" aria-hidden="true" /><div className="eyebrow"><i /> EVERYTHING DIZY™</div><h1>See the market.<br /><span>Understand the decision.</span></h1><p>DizyTrades connects market discovery, charting, confirmed-candle analysis, order flow, versioned microstructure research, futures simulation, Replay, structured review, realised performance, education and recovery in one transparent workspace.</p><div className="hero-actions"><Link className="button primary" href="/explore">Open View-Only Terminal <span aria-hidden="true">→</span></Link><Link className="button secondary" href="/research">Explore DizyQuant</Link><Link className="text-action" href="/school">Open {SCHOOL_DISPLAY_NAME}</Link><Link className="text-action" href="/signup">Create Account</Link><Link className="text-action" href="/login">Sign In</Link></div><div className="trust-row"><span><i /> Public market data</span><span><i /> Closed-candle discipline</span><span><i /> Evidence-first research</span><span><i /> Live trading disabled</span></div></section>
    <section className="preview-section" aria-labelledby="preview-title"><div className="section-heading"><div><span>THE WORKSPACE</span><h2 id="preview-title">One terminal.<br />One evidence chain.</h2></div><p>Move from market discovery and structure to signals, flow, research, simulation, historical reconstruction, review and measurement without losing the original context.</p></div><TerminalPreview /><p className="preview-note">Efficient illustrative preview — no live feed is loaded on this page.</p></section>
    <section className="products section" aria-labelledby="products-title"><div className="section-kicker">ONE FAMILY. ONE WORKFLOW.</div><h2 id="products-title">Each Dizy tool answers a different research or review question.</h2><div className="product-grid">{products.map(([name,label,description], index)=><article key={name} className={`product-card product-${index}`}><span>{String(index+1).padStart(2,"0")}</span><div className="product-icon" aria-hidden="true">{name.slice(4,6).toUpperCase()}</div><small>{label}</small><h3>{name}</h3><p>{description}</p>{name === "DizyTrade" ? <b className="coming">Coming Later</b> : null}</article>)}</div></section>
    <section className="workflow section" aria-labelledby="workflow-title"><div><div className="section-kicker">HOW DIZYTRADES WORKS</div><h2 id="workflow-title">Discover first.<br />Review last.</h2><p>Build a repeatable process that preserves what was observed, what qualified, what was assumed and what actually happened.</p></div><ol><li><b>01</b><span><strong>Discover and build context</strong><small>Use Scanner, Structure, DizyDEX and Charts to narrow the market without treating discovery as confirmation.</small></span></li><li><b>02</b><span><strong>Demand explainable evidence</strong><small>DizySignals, DizyBrain and DizyFlow separate closed-candle qualification, current liquidity and completed transactions. DizyQuant studies public microstructure behind a separate validation firewall.</small></span></li><li><b>03</b><span><strong>Simulate the complete plan</strong><small>Define invalidation, size, expected costs and management in DizyPaper before judging the outcome.</small></span></li><li><b>04</b><span><strong>Replay, review and measure</strong><small>Journal immutable facts, reconstruct the trade, complete Guided Review and inspect Behaviour and Performance.</small></span></li></ol></section>
    <section className="feature-stack">{features.map(([id,kicker,title,copy], i)=><article id={id} className="feature-row section" key={id}><div className="feature-visual" aria-hidden="true"><span>0{i+1}</span><div className={`visual-${id}`}><i/><i/><i/><i/><i/></div></div><div><div className="section-kicker">{kicker}</div><h2>{title}</h2><p>{copy}</p><Link href={featureHref(id)}>Explore {featureName(id)} <span aria-hidden="true">→</span></Link></div></article>)}</section>
    <section className="safety section" aria-labelledby="safety-title"><div><div className="section-kicker">SECURITY BY BOUNDARY</div><h2 id="safety-title">Research freely.<br />Risk nothing real.</h2></div><div className="safety-grid"><article><b>LIVE TRADING</b><strong>Disabled</strong><p>DizyTrades is an active beta. There is no enabled exchange order route and no live execution.</p></article><article><b>CREDENTIALS</b><strong>Never requested</strong><p>Current market, simulation and viewer workflows use public data. Exchange credentials do not belong in the browser.</p></article><article><b>RESEARCH PROMOTION</b><strong>Manual and reviewed</strong><p>DizyQuant outputs cannot influence production signals unless a separate promotion change passes representative Replay and statistical review.</p></article></div><p className="safety-callout"><i /> DizyTrade exchange connectivity is <b>Coming Later</b> and requires read-only shadow mode plus a separate security review.</p></section>
    <section className="developers section" aria-labelledby="developer-title"><div className="developer-mark"><GitHubIcon /></div><div><div className="section-kicker">BUILT IN THE OPEN</div><h2 id="developer-title">Inspect the code.<br />Help shape the workspace.</h2><p>DizyTrades is developed in the open. Explore the architecture, current roadmap, deterministic test boundaries and reproducible issues in the repository.</p><div className="developer-actions"><a className="button primary" href="https://github.com/DizygoticCode/DizyTrades" target="_blank" rel="noopener noreferrer">View on GitHub</a><a className="button secondary" href="https://github.com/DizygoticCode/DizyTrades/issues" target="_blank" rel="noopener noreferrer">Report an Issue</a><a className="text-action" href="https://github.com/DizygoticCode/DizyTrades#readme" target="_blank" rel="noopener noreferrer">Developer Documentation →</a></div></div></section>
    <section className="final-cta"><div className="eyebrow">EVERYTHING DIZY™</div><h2>Observe. Explain.<br />Test. Replay. Improve.</h2><p>Explore the terminal without an account, inspect the bounded DizyQuant registry, or open DizyAcademy and follow the complete research and review workflow.</p><div><Link className="button primary" href="/explore">Open View-Only Terminal</Link><Link className="button secondary" href="/research">Explore DizyQuant</Link><Link className="button secondary" href="/school">Explore {SCHOOL_DISPLAY_NAME}</Link></div></section>
  </main><footer className="site-footer"><div className="footer-top"><Brand /><div><b>PRODUCT</b><Link href="/explore">Terminal</Link><Link href="/research">DizyQuant</Link><Link href="/scanner">DizyScanner</Link><Link href="/structure">DizyStructure</Link><Link href="/performance">DizyPerformance</Link><Link href="/dex">DizyDEX</Link><Link href="/school">{SCHOOL_DISPLAY_NAME}</Link></div><div><b>ACCOUNT</b><Link href="/login">Sign In</Link><Link href="/signup">Create Account</Link></div><div><b>DEVELOPERS</b><a href="https://github.com/DizygoticCode/DizyTrades" target="_blank" rel="noopener noreferrer"><GitHubIcon /> GitHub</a><a href="https://github.com/DizygoticCode/DizyTrades/issues" target="_blank" rel="noopener noreferrer">Issues</a><a href="https://github.com/DizygoticCode/DizyTrades#readme" target="_blank" rel="noopener noreferrer">Documentation</a></div></div><div className="risk"><p><b>Risk disclaimer:</b> Cryptocurrency markets are volatile. DizyTrades provides research, education and simulation tools—not financial advice. Simulated results do not guarantee future performance. Live trading is disabled.</p><span>© {new Date().getFullYear()} DizyTrades · Everything Dizy™</span></div></footer></div>;
}
