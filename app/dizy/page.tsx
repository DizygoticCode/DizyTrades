import Image from "next/image";
import Link from "next/link";
import SiteHeader, { Brand } from "../marketing/site-header";
import styles from "./dizy.module.css";

const MINT = "J9Bevbd4BS23cjoWbKazG1LGwRsAhr2iRQq6uo31BEaY";
const WHITEPAPER = "https://gateway.irys.xyz/8mV7TWV5P7nqDim6YJJ2akP3HA8Fe6bUyTu1ivxu39QG";
const SOLSCAN = `https://solscan.io/token/${MINT}`;
const SOLANA_EXPLORER = `https://explorer.solana.com/address/${MINT}`;
const METADATA = "https://gateway.irys.xyz/91617Uu3fWVinM84nGSm65LXUub519AWfDZc3Uq457dh";
const TOKEN_IMAGE = "https://gateway.irys.xyz/RAcoiCCewukn5Q9JMnHoMQK3nB8oFqrucA9GRTpNg16";

const allocations = [
  ["Liquidity & distribution reserve", "650,000", "65%"],
  ["DizyTrades project treasury", "200,000", "20%"],
  ["Ecosystem & operations reserve", "100,000", "10%"],
  ["Creator allocation A", "25,000", "2.5%"],
  ["Creator allocation B", "25,000", "2.5%"],
] as const;

export const metadata = {
  title: "DIZY ($DIZY) | DizyTrades",
  description: "Official DIZY token information: canonical Solana mint, fixed supply, genesis distribution, permanent whitepaper and verification links.",
};

export default function DizyPage() {
  return <div className="marketing-shell"><SiteHeader /><main className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.markWrap}><Image src="/brand/dizy-mark.svg" alt="DIZY and DizyTrades mark" width={150} height={150} priority /></div>
      <div className={styles.eyebrow}><i /> $DIZY · SOLANA MAINNET</div>
      <h1>Meet DIZY.<br /><span>The DizyTrades token.</span></h1>
      <p>DIZY is a fixed-supply Solana token associated with the DizyTrades project. DizyTrades existed before the token; DIZY does not represent ownership of DizyTrades and does not promise price appreciation, returns, yield, project revenue or governance rights.</p>
      <div className={styles.actions}>
        <a className="button primary" href={WHITEPAPER} target="_blank" rel="noopener noreferrer">Read Whitepaper v1.0 <span aria-hidden="true">↗</span></a>
        <a className="button secondary" href={SOLSCAN} target="_blank" rel="noopener noreferrer">View on Solscan</a>
        <Link className="text-action" href="/explore">Explore DizyTrades</Link>
      </div>
      <p className={styles.nickname}><b>DizyCoin?</b> Fine by us as a nickname. The official on-chain name and symbol are DIZY / $DIZY.</p>
    </section>

    <section className={styles.stats} aria-label="DIZY token facts">
      <article><span>FIXED SUPPLY</span><strong>1,000,000</strong><small>DIZY</small></article>
      <article><span>DECIMALS</span><strong>9</strong><small>Classic SPL Token</small></article>
      <article><span>MINT AUTHORITY</span><strong>Revoked</strong><small>Supply cannot be increased</small></article>
      <article><span>FREEZE AUTHORITY</span><strong>Revoked</strong><small>No issuer freeze authority</small></article>
    </section>

    <section className={styles.section} aria-labelledby="identity-title">
      <div className={styles.sectionHeading}><div><span>CANONICAL IDENTITY</span><h2 id="identity-title">Verify the mint.<br />Ignore the impostors.</h2></div><p>Names and symbols are not unique on public blockchains. The mint address below is the canonical DIZY identity.</p></div>
      <div className={styles.mintCard}><span>SOLANA MAINNET MINT</span><code>{MINT}</code><div><a href={SOLSCAN} target="_blank" rel="noopener noreferrer">Solscan ↗</a><a href={SOLANA_EXPLORER} target="_blank" rel="noopener noreferrer">Solana Explorer ↗</a></div></div>
    </section>

    <section className={styles.section} aria-labelledby="distribution-title">
      <div className={styles.sectionHeading}><div><span>GENESIS DISTRIBUTION</span><h2 id="distribution-title">One million tokens.<br />Allocated once.</h2></div><p>The five genesis allocations total exactly 1,000,000 DIZY. Mint authority was permanently revoked after the allocations were independently verified.</p></div>
      <div className={styles.allocationGrid}>{allocations.map(([label, amount, share]) => <article key={label}><span>{share}</span><strong>{amount}</strong><small>DIZY</small><p>{label}</p></article>)}</div>
      <p className={styles.note}>The allocation labels record genesis purpose, not a guarantee of liquidity, listing, vesting, token lock, LP lock, software benefit or distribution schedule. Wallet balances may move after genesis.</p>
    </section>

    <section className={styles.split}>
      <article><span className={styles.kicker}>DIZYTRADES CAME FIRST</span><h2>A token beside the platform, not ownership of it.</h2><p>DizyTrades is a transparent crypto market-analysis, research, simulation and education workspace. DIZY is a project-associated Solana token with a deliberately simple, auditable design.</p><ul><li>No equity or shares in DizyTrades.</li><li>No entitlement to project revenue, fees or intellectual property.</li><li>No promised returns, yield, buybacks or automatic governance rights.</li><li>No guaranteed exchange listing or guaranteed future software access.</li></ul><Link href="/">Explore Everything Dizy™ →</Link></article>
      <article className={styles.verify}><span className={styles.kicker}>PERMANENT RECORD</span><h2>Whitepaper v1.0 is published on Irys.</h2><p>The published PDF was downloaded back from the permanent Irys URL and verified byte-for-byte against the final local document.</p><dl><div><dt>Whitepaper SHA-256</dt><dd><code>828327f13c8024fe1d0905e19eddfb36eb820921acafc2f99134fba0c8809139</code></dd></div><div><dt>Irys ID</dt><dd><code>8mV7TWV5P7nqDim6YJJ2akP3HA8Fe6bUyTu1ivxu39QG</code></dd></div></dl><a href={WHITEPAPER} target="_blank" rel="noopener noreferrer">Open permanent whitepaper ↗</a></article>
    </section>

    <section className={styles.resources} aria-labelledby="resources-title"><div><span className={styles.kicker}>VERIFY IT YOURSELF</span><h2 id="resources-title">Public resources</h2><p>Use the canonical sources rather than screenshots, copied symbols or third-party claims.</p></div><div className={styles.resourceLinks}><a href={SOLSCAN} target="_blank" rel="noopener noreferrer"><b>Solscan</b><span>Token, holders and transactions ↗</span></a><a href={SOLANA_EXPLORER} target="_blank" rel="noopener noreferrer"><b>Solana Explorer</b><span>Canonical mint account ↗</span></a><a href={WHITEPAPER} target="_blank" rel="noopener noreferrer"><b>Whitepaper v1.0</b><span>Permanent Irys PDF ↗</span></a><a href={METADATA} target="_blank" rel="noopener noreferrer"><b>Token metadata</b><span>Permanent metadata JSON ↗</span></a><a href={TOKEN_IMAGE} target="_blank" rel="noopener noreferrer"><b>Token artwork</b><span>Permanent token image ↗</span></a></div></section>

    <section className={styles.disclaimer}><b>Important information</b><p>DIZY does not currently claim active liquidity, an exchange listing or a guaranteed market. This page is informational and is not financial, investment, legal or tax advice. Nothing here is intended as an offer or solicitation, and this page does not determine DIZY&apos;s regulatory classification in any jurisdiction. Digital assets can be volatile, illiquid or lose all market value.</p></section>
  </main><footer className={styles.footer}><Brand /><span>DIZY · Solana mainnet · Mint {MINT.slice(0, 8)}…{MINT.slice(-8)}</span></footer></div>;
}
