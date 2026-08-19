import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader, { Brand, GitHubIcon } from "@/app/marketing/site-header";
import styles from "../investors/investors.module.css";

const INVESTOR_EMAIL = "dizytrades+investor@gmail.com";
const INVESTOR_MAILTO = `mailto:${INVESTOR_EMAIL}?subject=${encodeURIComponent("DizyTrades investor enquiry")}`;

export const metadata: Metadata = {
  title: "Business Plan | DizyTrades",
  description:
    "The public DizyTrades business plan covering the product thesis, platform, commercial model, technology, DIZY relationship, go-to-market, infrastructure roadmap, risks and milestones.",
  openGraph: {
    title: "DizyTrades Business Plan",
    description:
      "An evidence-first trading platform spanning research, analysis, simulation, review and guarded execution, with an explicit commercial and infrastructure roadmap.",
    type: "website",
  },
};

export default function BusinessPlanPage() {
  return (
    <div className="marketing-shell">
      <SiteHeader />
      <main className={styles.page}>
        <section className={styles.planHero} aria-labelledby="business-plan-title">
          <div className={styles.kicker}>DIZYTRADES · BUSINESS PLAN · WEB EDITION</div>
          <h1 id="business-plan-title">Build the process.<br /><span>Make the evidence visible.</span></h1>
          <p className={styles.planIntro}>
            DizyTrades is an integrated crypto market research and trading platform designed around one central idea: better decisions come from a repeatable process whose assumptions, risk, actions and results can be inspected. Instead of separating charting, signals, order flow, simulation, journalling, performance and execution into unrelated products, DizyTrades connects them as one evidence-first workflow. The commercial opportunity is to turn that workflow into a durable software business for traders who want more control, more transparency and less dependence on black-box claims.
          </p>
          <div className={styles.actions}>
            <a className={`${styles.button} ${styles.primary}`} href={INVESTOR_MAILTO}>Investor Enquiry</a>
            <Link className={styles.button} href="/investors">Investor Overview</Link>
            <a className={styles.button} href="https://github.com/DizygoticCode/DizyTrades" target="_blank" rel="noopener noreferrer"><GitHubIcon /> Inspect the Build</a>
          </div>
          <p className={styles.email}>Investor correspondence: <a href={INVESTOR_MAILTO}>{INVESTOR_EMAIL}</a></p>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-summary">
          <div className={styles.kicker}>01 · EXECUTIVE SUMMARY</div>
          <h2 id="plan-summary">The proposition</h2>
          <p>DizyTrades combines market discovery, charting, transparent signal reasoning, order flow, bounded quantitative research, realistic simulation, risk controls, account reconciliation, scanning, market structure, journalling, replay, performance review, education, diagnostics, backup/recovery and on-chain research into a connected product family.</p>
          <p>The broad product-generation programme is substantially complete and live. The next major operating step is not to add surface area for its own sake, but to harden infrastructure, measure capacity, migrate critical services to dedicated self-hosted production infrastructure and complete the remaining guarded-execution operational proof.</p>
          <div className={styles.note}><b>Current execution boundary:</b> production exchange-write activation remains disabled. The guarded execution architecture exists, but activation requires fresh host evidence, fresh credential attestation and a separately approved microscopic canary after migration.</div>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-problem">
          <div className={styles.kicker}>02 · THE PROBLEM</div>
          <h2 id="plan-problem">Trading software is often fragmented or opaque.</h2>
          <p>Retail and independent traders commonly assemble a workflow from separate charting, signal, exchange, journalling, research and education tools. That fragmentation makes it harder to preserve context from one decision stage to the next. At the same time, many signal and trading products are presented as conclusions rather than inspectable processes.</p>
          <ul>
            <li>Analysis, simulation, execution and review often live in different systems.</li>
            <li>Signal logic can be difficult to inspect, reproduce or challenge.</li>
            <li>Simulation assumptions are frequently hidden behind headline results.</li>
            <li>Execution safety and credential boundaries are often treated as backend details rather than product responsibilities.</li>
            <li>Performance screenshots can look persuasive without providing enough evidence to evaluate the underlying process.</li>
          </ul>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-solution">
          <div className={styles.kicker}>03 · THE SOLUTION</div>
          <h2 id="plan-solution">One evidence-first trading workflow.</h2>
          <div className={styles.planGrid}>
            <article className={styles.planCard}><small>DISCOVER + ANALYSE</small><h3>DizyCharts, Scanner, Structure</h3><p>Provider-neutral market search, charting, confluence analysis, scanning and closed-candle structure provide context before a decision is made.</p></article>
            <article className={styles.planCard}><small>REASON + RESEARCH</small><h3>DizyBrain, DizyFlow, DizyQuant</h3><p>Transparent signal reasoning, retained order-flow context and bounded quantitative research expose evidence rather than hiding it behind a score.</p></article>
            <article className={styles.planCard}><small>SIMULATE + CONTROL</small><h3>DizyPaper, risk, DizyAccount</h3><p>Realistic paper simulation, explicit risk controls and owner-only read-only reconciliation make the gap between a theoretical idea and an operational position visible.</p></article>
            <article className={styles.planCard}><small>REVIEW + LEARN</small><h3>Journal, Performance, Academy</h3><p>Trade review, realised performance and education keep the decision process connected to what actually happened rather than what was expected to happen.</p></article>
            <article className={styles.planCard}><small>OPERATE</small><h3>DizyOps, Backup</h3><p>Production diagnostics, audit visibility, recovery and infrastructure controls treat reliability as part of the product rather than something hidden behind the interface.</p></article>
            <article className={styles.planCard}><small>EXPAND</small><h3>DizyDEX + global markets</h3><p>On-chain pool research and provider-neutral global chart search broaden the platform beyond a single exchange-specific market view.</p></article>
          </div>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-position">
          <div className={styles.kicker}>04 · MARKET POSITION</div>
          <h2 id="plan-position">Compete on integration, transparency and control.</h2>
          <p>DizyTrades does not need to claim that every feature is unique in isolation. The differentiator is the way those components are integrated around a common workflow and evidence model: market discovery to analysis, analysis to simulation, simulation to execution controls, and execution back into reconciliation and review.</p>
          <p>The project also owns its application code and is actively reducing infrastructure dependence by moving toward dedicated self-hosted production capacity. The intended moat is therefore a combination of integrated workflow, accumulated product engineering, inspectable safety boundaries, retained research context and operational control.</p>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-customers">
          <div className={styles.kicker}>05 · TARGET USERS</div>
          <h2 id="plan-customers">Start with self-directed traders who value process.</h2>
          <p>The initial addressable user is a technically curious, self-directed crypto trader who wants more than a basic chart but does not want to surrender decision-making to an opaque automated system. Adjacent future users include power users, research-oriented traders, small trading teams, educators and specialist partners who need transparent workflows or infrastructure integration.</p>
          <div className={styles.note}>No user-count, market-share or traction figure is claimed here unless supported by measured project data. The commercial plan is intentionally separated from unverified growth assumptions.</div>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-business-model">
          <div className={styles.kicker}>06 · BUSINESS MODEL</div>
          <h2 id="plan-business-model">Recurring software first; optional partnerships second.</h2>
          <div className={styles.planGrid}>
            <article className={styles.planCard}><small>PRIMARY · PLANNED</small><h3>Subscription access</h3><p>Free or view-only discovery can lead into paid tiers for advanced workflow, retained data, research, simulation, analytics, customisation and higher operational limits.</p></article>
            <article className={styles.planCard}><small>PLANNED</small><h3>Professional tier</h3><p>Higher-capacity data, deeper retained order-flow history, diagnostics and specialist research features can support power-user or professional pricing once demand is proven.</p></article>
            <article className={styles.planCard}><small>OPTIONAL</small><h3>Licensing & integration</h3><p>Provider, exchange, education or infrastructure integrations may create licensing or partnership revenue where strategically appropriate. No unannounced partnership is implied.</p></article>
          </div>
          <p>DizyTrades should not depend on encouraging users to trade more frequently merely to generate transaction revenue. The preferred commercial incentive is to make the software useful enough that customers choose to pay for the workflow itself.</p>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-go-to-market">
          <div className={styles.kicker}>07 · GO-TO-MARKET</div>
          <h2 id="plan-go-to-market">Demonstrate the product before selling the claim.</h2>
          <ol>
            <li><b>Public discovery:</b> maintain a strong public website, view-only terminal, DIZY page, public repository and educational/product explanations that allow the project to be inspected before registration.</li>
            <li><b>Content and proof:</b> use product demonstrations, research notes, transparent simulations, operational evidence and educational material rather than lifestyle marketing or unverifiable return claims.</li>
            <li><b>Conversion:</b> introduce commercial tiers around genuinely valuable workflow limits and advanced features only when pricing and demand can be tested with real users.</li>
            <li><b>Partnerships:</b> pursue data, exchange, infrastructure or education relationships where they materially improve the product rather than simply adding logos.</li>
          </ol>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-technology">
          <div className={styles.kicker}>08 · TECHNOLOGY + SECURITY</div>
          <h2 id="plan-technology">Safety boundaries are part of the product.</h2>
          <p>DizyTrades is built on a modern web stack with provider-neutral market boundaries, deterministic tests, production build gates and browser smoke coverage. Guarded execution has been developed separately from public product functionality so that exchange-write capability is not accidentally implied by the existence of a chart or signal.</p>
          <ul>
            <li>Production exchange-write activation remains off.</li>
            <li>Write credentials and execution authority are separately controlled and attested.</li>
            <li>The intended dedicated execution host requires fresh exact-host network evidence after migration.</li>
            <li>Execution activation requires a separately approved microscopic reduce-only LIMIT canary.</li>
            <li>Operational diagnostics and audit surfaces are designed to make system state inspectable.</li>
          </ul>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-infrastructure">
          <div className={styles.kicker}>09 · INFRASTRUCTURE ROADMAP</div>
          <h2 id="plan-infrastructure">Move from interim hosting to measured dedicated infrastructure.</h2>
          <p>Render remains the current hosted production environment. The planned long-term direction is dedicated self-hosted production infrastructure, giving DizyTrades greater control over capacity, retained data, network identity, execution boundaries and operating cost.</p>
          <p>The migration is being treated as an engineering and security milestone rather than a simple server move: hardware burn-in, controlled state migration, restart/rollback rehearsal, staged capacity measurement, fresh static public /32 evidence, fresh write-generation attestation and a separately approved canary all belong to the migration proof.</p>
          <div className={styles.note}>Dedicated hardware is not described as unlimited capacity. DizyTrades has a staged synthetic capacity harness designed to measure CPU, heap, RSS, event-loop delay, throughput and retained memory at increasing symbol counts before operating limits are claimed.</div>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-dizy">
          <div className={styles.kicker}>10 · DIZY TOKEN RELATIONSHIP</div>
          <h2 id="plan-dizy">A project token, not equity or a return promise.</h2>
          <p>DIZY is a fixed-supply Solana token associated with DizyTrades. DizyTrades existed before the token. DIZY does not represent ownership of DizyTrades and does not provide equity, revenue share, yield, governance rights or a promise of price appreciation.</p>
          <p>Any future utility should be introduced only when it is concrete, technically delivered and consistent with applicable legal and platform requirements. The business case for DizyTrades must stand on the usefulness of the software rather than on speculative token appreciation.</p>
          <div className={styles.actions}><Link className={styles.button} href="/dizy">Review the DIZY Page</Link></div>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-risks">
          <div className={styles.kicker}>11 · KEY RISKS</div>
          <h2 id="plan-risks">The plan includes the uncomfortable bits.</h2>
          <div className={styles.planGrid}>
            <article className={styles.planCard}><small>TECHNICAL</small><h3>Reliability and scaling</h3><p>Real-time market systems can exhaust memory, CPU, provider limits or network capacity. Mitigation is bounded state, observability, staged load testing, failure recovery and evidence-led capacity claims.</p></article>
            <article className={styles.planCard}><small>MARKET</small><h3>Competition and adoption</h3><p>Traders already have established tools and habits. DizyTrades must earn switching or companion-use value through workflow integration, transparency and usability rather than feature-count marketing.</p></article>
            <article className={styles.planCard}><small>REGULATORY</small><h3>Trading and token rules</h3><p>Crypto, financial-promotion and digital-asset requirements can change by jurisdiction. Product claims, execution features and DIZY communications require conservative positioning and professional legal review where needed.</p></article>
            <article className={styles.planCard}><small>DEPENDENCY</small><h3>Market-data providers</h3><p>Provider availability, exchange APIs and rate limits can change. Provider-neutral boundaries, caching, graceful degradation and multiple market surfaces reduce but do not eliminate this risk.</p></article>
            <article className={styles.planCard}><small>SECURITY</small><h3>Execution authority</h3><p>Any system capable of exchange writing creates material security risk. DizyTrades keeps execution activation gated, separately attested and operationally isolated from ordinary product development.</p></article>
            <article className={styles.planCard}><small>COMMERCIAL</small><h3>Unproven monetisation</h3><p>The product exists, but pricing, conversion and customer acquisition must be validated with real market evidence. The plan does not present hypothetical revenue as achieved traction.</p></article>
          </div>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-milestones">
          <div className={styles.kicker}>12 · MILESTONES + FINANCIAL FRAMEWORK</div>
          <h2 id="plan-milestones">Measure before projecting.</h2>
          <ol>
            <li><b>Infrastructure qualification:</b> complete dedicated-host burn-in, migration rehearsal, recovery proof and capacity benchmarking.</li>
            <li><b>Production stability:</b> continue evidence-led reliability work and establish measured operating envelopes for real-time workloads.</li>
            <li><b>Guarded execution migration:</b> establish fresh host authority and complete the independently approved microscopic canary before any broader live-execution discussion.</li>
            <li><b>Commercial validation:</b> define candidate tiers, test willingness to pay and measure acquisition, activation, retention and support cost using real users rather than assumed conversion rates.</li>
            <li><b>Scale only from evidence:</b> expand infrastructure, provider capacity and commercial spend when measured demand and unit economics justify it.</li>
          </ol>
          <p>The financial model should therefore be maintained as scenarios rather than forecasts until real pricing and conversion data exist. Relevant variables include paid-user count, average revenue per paid user, market-data/provider cost, hosting and hardware cost, payment fees, support burden, development/security cost and customer acquisition cost.</p>
        </section>

        <section className={styles.planSection} aria-labelledby="plan-ask">
          <div className={styles.kicker}>13 · WHAT DIZYTRADES IS OPEN TO</div>
          <h2 id="plan-ask">Capital, expertise and strategic alignment.</h2>
          <p>DizyTrades is open to conversations with technically literate investors, infrastructure or data partners, exchanges, product collaborators and other serious contributors who understand that the project is being built around measured evidence and controlled execution rather than guaranteed-return marketing.</p>
          <p>Any investment structure, valuation, equity terms or fundraising instrument would require separate diligence, documentation and appropriate professional advice. This public business plan is project information, not an offer to sell securities or DIZY.</p>
          <div className={styles.actions}>
            <a className={`${styles.button} ${styles.primary}`} href={INVESTOR_MAILTO}>Email {INVESTOR_EMAIL}</a>
            <Link className={styles.button} href="/contact">General Contact</Link>
            <Link className={styles.button} href="/investors">Investor Overview</Link>
          </div>
        </section>
      </main>
      <footer className="site-footer"><div className="footer-top"><Brand /><div><b>PROJECT</b><Link href="/investors">Investors</Link><Link href="/business-plan">Business Plan</Link><Link href="/about">About</Link><Link href="/dizy">DIZY</Link></div><div><b>CONTACT</b><a href={INVESTOR_MAILTO}>Investor enquiries</a><Link href="/contact">General contact</Link><Link href="/login">Sign In</Link></div><div><b>DEVELOPERS</b><a href="https://github.com/DizygoticCode/DizyTrades" target="_blank" rel="noopener noreferrer"><GitHubIcon /> GitHub</a><a href="https://github.com/DizygoticCode/DizyTrades#readme" target="_blank" rel="noopener noreferrer">Documentation</a></div></div><div className="risk"><p><b>Project notice:</b> This page is general project information, not financial advice or an offer to sell securities or DIZY. DIZY does not represent equity, ownership, revenue share, yield, governance rights or a promise of returns.</p><span>© {new Date().getFullYear()} DizyTrades · Everything Dizy™</span></div></footer>
    </div>
  );
}
