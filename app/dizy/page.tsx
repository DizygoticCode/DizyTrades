import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader, { Brand } from "../marketing/site-header";
import DizyMarketCard from "./DizyMarketCard";
import { DIZY_MINT, DIZY_POOL } from "./token-config";
import styles from "./page.module.css";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_METADATA_URL = "https://gateway.irys.xyz/91617Uu3fWVinM84nGSm65LXUub519AWfDZc3Uq457dh";
const WHITEPAPER_URL = "https://gateway.irys.xyz/8mV7TWV5P7nqDim6YJJ2akP3HA8Fe6bUyTu1ivxu39QG";
const OFFICIAL_X_URL = "https://x.com/DizyTradesApp";
const SOLSCAN_URL = `https://solscan.io/token/${DIZY_MINT}`;
const SOLANA_EXPLORER_URL = `https://explorer.solana.com/address/${DIZY_MINT}`;
const TOKEN_PROGRAM_URL = `https://explorer.solana.com/address/${TOKEN_PROGRAM}`;
const DEXSCREENER_URL = `https://dexscreener.com/solana/${DIZY_POOL}`;
const GECKOTERMINAL_URL = `https://www.geckoterminal.com/solana/pools/${DIZY_POOL}`;
const RAYDIUM_POOL_URL = `https://raydium.io/liquidity/increase/?mode=add&pool_id=${DIZY_POOL}`;
const RAYDIUM_SWAP_URL = "https://raydium.io/swap/";

export const metadata: Metadata = {
  title: "DIZY ($DIZY) | DizyTrades",
  description:
    "Official DIZY token page with the canonical Solana mint and Raydium DIZY/USDT pool, live market links, permanent whitepaper, fixed supply and authority state.",
  openGraph: {
    title: "DIZY ($DIZY) | DizyTrades",
    description:
      "Verify the official DIZY Solana mint and canonical Raydium pool, inspect live public market data and review the permanent DIZY whitepaper.",
    type: "website",
  },
};

const facts = [
  ["Network", "Solana Mainnet"],
  ["Supply", "1,000,000 DIZY"],
  ["Decimals", "9"],
  ["Mint authority", "Revoked"],
  ["Freeze authority", "Revoked"],
  ["Token standard", "Classic SPL Token"],
] as const;

const buySteps = [
  ["Prepare a Solana wallet", "Use a self-custody Solana wallet and hold enough SOL for the swap plus network fees."],
  ["Open a reputable Solana DEX", "Use a known Solana swap venue such as Jupiter or Raydium from the links on this page."],
  ["Paste the official mint", `Choose the token you are paying with, then paste ${DIZY_MINT} as the token you want to receive. Do not rely on the name or ticker alone.`],
  ["Check the route", `Confirm the route resolves to the canonical DIZY mint and, when the DIZY/USDT Raydium CPMM is used, pool ${DIZY_POOL}. Review expected output, price impact, slippage and fees before continuing.`],
  ["Confirm in your wallet", "Approve the transaction only after checking the details, then verify the received token against the canonical mint on a block explorer."],
] as const;

export default function DizyPage() {
  return (
    <div className="marketing-shell">
      <SiteHeader />
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>DIZY · THE DIZYTRADES TOKEN</div>
            <h1><span>$DIZY</span> on Solana.</h1>
            <p className={styles.lead}>
              DIZY is a fixed-supply Solana token associated with the DizyTrades project. DizyTrades existed before the token. DIZY does not represent ownership of DizyTrades and does not promise price appreciation, returns, yield, revenue or governance rights.
            </p>
            <div className={styles.heroBadges} aria-label="DIZY key properties">
              <span>Solana Mainnet</span>
              <span>Fixed supply</span>
              <span>Live Raydium market</span>
              <span>Mint revoked</span>
              <span>Freeze revoked</span>
            </div>
          </div>
          <div className={styles.coinPanel}>
            <div className={styles.coinLogo}>
              <Image
                src="/api/dizy/logo"
                alt="DIZY token logo"
                width={230}
                height={230}
                priority
                unoptimized
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
              />
            </div>
            <strong>DIZY</strong>
            <span>$DIZY</span>
            <small>DizyCoin is the informal community nickname for the same DIZY token — not a second asset.</small>
          </div>
        </section>

        <section className={styles.mintCard} aria-labelledby="official-mint">
          <div>
            <div className={styles.sectionKicker}>VERIFY FIRST</div>
            <h2 id="official-mint">Official DIZY mint</h2>
            <p>The mint address is the authoritative identity. Token names and tickers can be copied by unrelated assets.</p>
          </div>
          <code>{DIZY_MINT}</code>
          <div className={styles.actions}>
            <a className="button primary" href={SOLSCAN_URL} target="_blank" rel="noopener noreferrer">View on Solscan ↗</a>
            <a className="button secondary" href={SOLANA_EXPLORER_URL} target="_blank" rel="noopener noreferrer">Solana Explorer ↗</a>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="live-market">
          <div className={styles.sectionHeading}>
            <div>
              <div className={styles.sectionKicker}>LIVE MARKET</div>
              <h2 id="live-market">Canonical DIZY/USDT market.</h2>
            </div>
            <p>DIZY has an active DIZY/USDT CPMM on Raydium. Use the exact mint and canonical pool address below when checking market data or a swap route.</p>
          </div>
          <DizyMarketCard />
          <div className={styles.designNote}>
            <strong>Canonical Raydium pool</strong>
            <p>{DIZY_POOL}</p>
          </div>
          <div className={styles.linkGrid}>
            <a href={GECKOTERMINAL_URL} target="_blank" rel="noopener noreferrer"><span>LIVE CHART + TRADES</span><strong>GeckoTerminal</strong><small>Canonical DIZY/USDT Raydium pool ↗</small></a>
            <a href={DEXSCREENER_URL} target="_blank" rel="noopener noreferrer"><span>DEX MARKET DATA</span><strong>DEX Screener</strong><small>Price, liquidity, transactions and traders ↗</small></a>
            <a href={RAYDIUM_POOL_URL} target="_blank" rel="noopener noreferrer"><span>CANONICAL AMM</span><strong>Raydium pool</strong><small>Inspect the exact CPMM pool on Raydium ↗</small></a>
            <Link href="/terminal"><span>DIZYCHARTS</span><strong>Open DIZY in DizyCharts</strong><small>Chart the market inside DizyTrades →</small></Link>
          </div>
          <div className={styles.routeWarning}>
            <strong>Low-liquidity market.</strong>
            <p>The canonical pool is live, but depth is limited. Relatively small trades can cause material price impact and slippage. Market links are provided for verification and access to public data, not as a recommendation to acquire DIZY.</p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="token-facts">
          <div className={styles.sectionHeading}>
            <div>
              <div className={styles.sectionKicker}>ON-CHAIN DESIGN</div>
              <h2 id="token-facts">Simple by design.</h2>
            </div>
            <p>DIZY uses the classic SPL Token Program with a fixed genesis supply. The mint and freeze authorities are permanently revoked.</p>
          </div>
          <div className={styles.factGrid}>
            {facts.map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <div className={styles.designNote}>
            <strong>No hidden transfer mechanics.</strong>
            <p>DIZY has no transfer tax, reflection mechanism, blacklist, whitelist, pause control, transfer hook or permanent delegate. A metadata update authority is retained for branding and link corrections; it cannot mint or freeze DIZY.</p>
          </div>
        </section>

        <section className={styles.buySection} aria-labelledby="buy-dizy">
          <div className={styles.buyIntro}>
            <div className={styles.sectionKicker}>SOLANA DEX GUIDE</div>
            <h2 id="buy-dizy">How to verify a DIZY swap.</h2>
            <p>The canonical DIZY/USDT Raydium market is live. Routes may also be surfaced by aggregators. Always verify the exact DIZY mint and inspect the quote rather than relying on the ticker alone.</p>
            <div className={styles.dexLinks}>
              <a className="button primary" href="https://jup.ag" target="_blank" rel="noopener noreferrer">Open Jupiter ↗</a>
              <a className="button secondary" href={RAYDIUM_SWAP_URL} target="_blank" rel="noopener noreferrer">Open Raydium ↗</a>
            </div>
          </div>
          <ol className={styles.steps}>
            {buySteps.map(([title, copy], index) => (
              <li key={title}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles.routeWarning}>
            <strong>Check liquidity and price impact before signing.</strong>
            <p>A live market or DEX route is not a guarantee of execution quality, future liquidity or price. If a venue does not resolve the exact mint, or the quote shows unacceptable impact or slippage, do not continue and do not substitute a similarly named token.</p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="verify-chain">
          <div className={styles.sectionHeading}>
            <div>
              <div className={styles.sectionKicker}>PUBLIC VERIFICATION</div>
              <h2 id="verify-chain">Inspect DIZY yourself.</h2>
            </div>
            <p>The token identity, authority state, permanent documents and official project channels are public and independently inspectable.</p>
          </div>
          <div className={styles.linkGrid}>
            <a href={SOLSCAN_URL} target="_blank" rel="noopener noreferrer"><span>BLOCK EXPLORER</span><strong>Solscan</strong><small>Mint, supply, holders and transactions ↗</small></a>
            <a href={SOLANA_EXPLORER_URL} target="_blank" rel="noopener noreferrer"><span>BLOCK EXPLORER</span><strong>Solana Explorer</strong><small>Canonical Solana account view ↗</small></a>
            <a href={WHITEPAPER_URL} target="_blank" rel="noopener noreferrer"><span>PERMANENT DOCUMENT</span><strong>DIZY Whitepaper v1.0</strong><small>Permanent Irys-hosted whitepaper ↗</small></a>
            <a href={OFFICIAL_X_URL} target="_blank" rel="noopener noreferrer"><span>OFFICIAL SOCIAL</span><strong>@DizyTradesApp</strong><small>Official DizyTrades account on X ↗</small></a>
            <a href={TOKEN_METADATA_URL} target="_blank" rel="noopener noreferrer"><span>PERMANENT METADATA</span><strong>Irys metadata</strong><small>Public token metadata JSON ↗</small></a>
            <a href={TOKEN_PROGRAM_URL} target="_blank" rel="noopener noreferrer"><span>TOKEN PROGRAM</span><strong>Classic SPL Token</strong><small>Program {TOKEN_PROGRAM.slice(0, 8)}…{TOKEN_PROGRAM.slice(-6)} ↗</small></a>
          </div>
        </section>

        <section className={styles.relationship} aria-labelledby="dizy-relationship">
          <div>
            <div className={styles.sectionKicker}>DIZY + DIZYTRADES</div>
            <h2 id="dizy-relationship">A project token, not a promise.</h2>
          </div>
          <div>
            <p>DIZY is associated with DizyTrades, but holding DIZY does not create ownership, equity, revenue-sharing, yield, governance or a right to future returns from DizyTrades.</p>
            <p>Cryptocurrency markets are volatile. Availability, liquidity, venue support and price can change or may cease. Verify the mint, canonical pool and transaction details yourself before interacting with any token or DEX.</p>
            <Link className={styles.homeLink} href="/">Explore Everything Dizy™ →</Link>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <div>
          <a href={GECKOTERMINAL_URL} target="_blank" rel="noopener noreferrer">Live chart</a>
          <a href={DEXSCREENER_URL} target="_blank" rel="noopener noreferrer">DEX Screener</a>
          <a href={WHITEPAPER_URL} target="_blank" rel="noopener noreferrer">Whitepaper</a>
          <a href={OFFICIAL_X_URL} target="_blank" rel="noopener noreferrer">X</a>
          <a href={SOLSCAN_URL} target="_blank" rel="noopener noreferrer">Solscan</a>
          <Link href="/dex">DizyDEX</Link>
        </div>
      </footer>
    </div>
  );
}
