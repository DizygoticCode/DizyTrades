import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader, { Brand, GitHubIcon } from "@/app/marketing/site-header";
import styles from "./investors.module.css";

const INVESTOR_EMAIL = "dizytrades+investor@gmail.com";
const INVESTOR_MAILTO = `mailto:${INVESTOR_EMAIL}?subject=${encodeURIComponent("DizyTrades investor enquiry")}`;

export const metadata: Metadata = {
  title: "Investors & Partners | DizyTrades",
  description:
    "A concise investor and partner overview of DizyTrades: the product, evidence-first trading workflow, commercial direction, DIZY relationship and infrastructure roadmap.",
  openGraph: {
    title: "Investors & Partners | DizyTrades",
    description:
      "DizyTrades is an integrated crypto research, charting, simulation, order-flow, review and guarded-execution platform built around inspectable process rather than black-box promises.",
    type: "website",
  },
};

const productCards = [
  ["One workspace", "Research to review", "Charts, signals, scanning, structure, order flow, simulation, journal, performance, education and account reconciliation are designed as one workflow rather than disconnected tools."],
  ["Evidence first", "Inspectable decisions", "Signals, simulations, research assumptions, risk boundaries, audit trails and software changes are built to be reviewable instead of asking users to trust screenshots or opaque claims."],
  ["Owned stack", "Product + infrastructure", "DizyTrades owns its application code and is moving toward self-hosted Server Club infrastructure for greater operational control, measurable capacity and reduced dependence on a single hosted runtime."],
  ["Guarded execution", "Safety before activation", "The live-execution architecture exists, but production exchange-write activation remains disabled until the intended host migration, fresh host evidence, credential attestation and a separately approved microscopic canary."],
  ["Provider neutral", "Beyond one exchange", "The charting boundary now supports provider-neutral global search alongside MEXC and on-chain market research, reducing dependence on a single market-data path."],
  ["DIZY", "Project token, not equity", "DIZY is a fixed-supply Solana token associated with the project. It does not represent ownership, equity, revenue share, yield, governance rights or a promise of appreciation."],
] as const;

export default function InvestorsPage() {
  return (
    <div className="marketing-shell">
      <SiteHeader />
      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="investor-title">
          <div className={styles.kicker}>INVESTORS · PARTNERS · COLLABORATORS</div>
          <h1 id="investor-title">A trading platform built around <span>process you can inspect.</span></h1>
          <p className={styles.pitch}>
            DizyTrades is an integrated crypto market research and trading workspace built to connect analysis, signals, order flow, simulation, risk, account reconciliation, replay and post-trade review in one evidence-first system. The thesis is simple: traders do not need another black-box promise. They need a repeatable process whose assumptions, decisions and results can be inspected — and a platform capable of carrying that process from research through execution without hiding the important boundaries.
          </p>
          <div className={styles.actions}>
            <Link className={`${styles.button} ${styles.primary}`} href="/business-plan">Read the Business Plan →</Link>
            <a className={styles.button} href={INVESTOR_MAILTO}>Investor Enquiry</a>
            <Link className={styles.button} href="/contact">Contact DizyTrades</Link>
          </div>
          <p className={styles.email}>Investor correspondence: <a href={INVESTOR_MAILTO}>{INVESTOR_EMAIL}</a></p>
          <div className={styles.metrics} aria-label="DizyTrades project status">
            <div><strong>Product built</strong><span>The broad product-generation programme is substantially complete and live.</span></div>
            <div><strong>Execution guarded</strong><span>Exchange-write activation remains off until the Server Club migration and fresh host controls are proven.</span></div>
            <div><strong>Infrastructure next</strong><span>Current Render hosting is being complemented by measured self-hosted Server Club capacity.</span></div>
            <div><strong>Open evidence</strong><span>Public repository, deterministic tests, explicit safety boundaries and an inspectable roadmap.</span></div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="case-title">
          <div className={styles.heading}>
            <div><div className={styles.kicker}>THE PROJECT CASE</div><h2 id="case-title">More than a chart.<br />More than a signal.</h2></div>
            <p>DizyTrades is being built as a connected operating system for a trading process: discover a market, form a thesis, inspect evidence, define risk, simulate or execute under explicit controls, then measure what actually happened.</p>
          </div>
          <div className={styles.grid}>
            {productCards.map(([eyebrow, title, copy]) => (
              <article className={styles.card} key={title}><small>{eyebrow}</small><h3>{title}</h3><p>{copy}</p></article>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="platform-title">
          <div className={styles.heading}>
            <div><div className={styles.kicker}>PLATFORM BREADTH</div><h2 id="platform-title">The Dizy ecosystem.</h2></div>
            <p>The platform already spans charting, transparent signal reasoning, order flow, bounded quantitative research, paper trading, journalling, scanning, structure, realised performance, education, diagnostics, account reconciliation, on-chain research and recovery tooling.</p>
          </div>
          <div className={styles.status}>
            <article><b className={styles.good}>Live product surface</b><p>DizyCharts, DizyBrain, DizyFlow, DizyQuant research, DizyPaper, DizyJournal, DizyScanner, DizyStructure, DizyPerformance, DizyAcademy, DizyOps, DizyAccount and DizyDEX form the current product family.</p></article>
            <article><b className={styles.locked}>Deliberately not activated</b><p>Production exchange-write execution remains locked. No real MEXC order has been submitted through the guarded execution path. Activation is a separate operational and security milestone, not a marketing checkbox.</p></article>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="business-title">
          <div className={styles.heading}>
            <div><div className={styles.kicker}>COMMERCIAL DIRECTION</div><h2 id="business-title">Built to support a real business.</h2></div>
            <p>The commercial model is intentionally presented as a plan, not fabricated traction. DizyTrades can support recurring software access, higher-value research and workflow tiers, specialist infrastructure or partner integrations, and future enterprise/licensing opportunities where demand is proven.</p>
          </div>
          <div className={styles.grid}>
            <article className={styles.card}><small>PLANNED</small><h3>Subscription software</h3><p>Tiered access around advanced workflow, research, retained data, simulation, analytics and operational features can create recurring product revenue without relying on trade commissions.</p></article>
            <article className={styles.card}><small>PLANNED</small><h3>Professional tooling</h3><p>Higher-capacity data, diagnostics, research workflows, retained order-flow history and specialist features can support a professional or power-user tier once measured demand justifies it.</p></article>
            <article className={styles.card}><small>OPTIONAL</small><h3>Partners & licensing</h3><p>Provider, exchange, education or infrastructure integrations may create partnership or licensing opportunities, but no unannounced partnership or revenue claim is implied here.</p></article>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="roadmap-title">
          <div className={styles.heading}>
            <div><div className={styles.kicker}>NEXT OPERATING MILESTONE</div><h2 id="roadmap-title">Move the critical path onto intended infrastructure.</h2></div>
            <p>Server Club is not presented as magic unlimited capacity. It is the planned long-term production and execution host, with capacity measured through staged synthetic workloads and guarded execution requiring fresh exact-host evidence after migration.</p>
          </div>
          <div className={styles.status}>
            <article><b>Infrastructure migration</b><p>Controlled state migration, restart and rollback rehearsal, host burn-in, capacity measurement and operational proof before the machine becomes a trusted production boundary.</p></article>
            <article><b>Execution authority</b><p>Fresh exact static /32 evidence, fresh write-generation attestation and a separately approved microscopic reduce-only LIMIT canary before production exchange writing can be considered active.</p></article>
          </div>
        </section>

        <section className={styles.cta} aria-labelledby="investor-cta">
          <div className={styles.kicker}>FULL PROJECT CASE</div>
          <h2 id="investor-cta">Read the plan.<br />Inspect the build.</h2>
          <p>The business plan sets out the product, market thesis, commercial model, DIZY relationship, technology and security posture, go-to-market approach, infrastructure roadmap, risks and milestones without inventing traction that does not exist.</p>
          <div className={styles.actions}>
            <Link className={`${styles.button} ${styles.primary}`} href="/business-plan">Open Business Plan</Link>
            <a className={styles.button} href="https://github.com/DizygoticCode/DizyTrades" target="_blank" rel="noopener noreferrer"><GitHubIcon /> Inspect GitHub</a>
            <a className={styles.button} href={INVESTOR_MAILTO}>Email Investor Enquiries</a>
          </div>
        </section>
      </main>
      <footer className="site-footer"><div className="footer-top"><Brand /><div><b>PROJECT</b><Link href="/investors">Investors</Link><Link href="/business-plan">Business Plan</Link><Link href="/about">About</Link><Link href="/dizy">DIZY</Link></div><div><b>CONTACT</b><a href={INVESTOR_MAILTO}>Investor enquiries</a><Link href="/contact">General contact</Link><Link href="/login">Sign In</Link></div><div><b>DEVELOPERS</b><a href="https://github.com/DizygoticCode/DizyTrades" target="_blank" rel="noopener noreferrer"><GitHubIcon /> GitHub</a><a href="https://github.com/DizygoticCode/DizyTrades#readme" target="_blank" rel="noopener noreferrer">Documentation</a></div></div><div className="risk"><p><b>Project notice:</b> DIZY is associated with DizyTrades but does not represent equity, ownership, revenue share, yield, governance rights or a promise of returns. Cryptocurrency markets are volatile.</p><span>© {new Date().getFullYear()} DizyTrades · Everything Dizy™</span></div></footer>
    </div>
  );
}
