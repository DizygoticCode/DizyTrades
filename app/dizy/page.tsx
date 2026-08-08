import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader, { Brand } from "../marketing/site-header";
import styles from "./page.module.css";

const DIZY_MINT = "J9Bevbd4BS23cjoWbKazG1LGwRsAhr2iRQq6uo31BEaY";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_LOGO_URL = "https://gateway.irys.xyz/RAcoiCCewukn5Q9JMnHoMQK3nB8oFqrucA9GRTpNg16";
const TOKEN_METADATA_URL = "https://gateway.irys.xyz/91617Uu3fWVinM84nGSm65LXUub519AWfDZc3Uq457dh";
const SOLSCAN_URL = `https://solscan.io/token/${DIZY_MINT}`;
const SOLANA_EXPLORER_URL = `https://explorer.solana.com/address/${DIZY_MINT}`;
const TOKEN_PROGRAM_URL = `https://explorer.solana.com/address/${TOKEN_PROGRAM}`;

export const metadata: Metadata = {
  title: "DIZY ($DIZY) | DizyTrades",
  description:
    "Official DIZY token page with the canonical Solana mint, fixed supply, authority state, explorer links and a verification-first guide to swapping through Solana DEXs.",
  openGraph: {
    title: "DIZY ($DIZY) | DizyTrades",
    description:
      "Verify the official DIZY Solana mint, inspect its on-chain state and learn how to check for a DEX swap route safely.",
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
  ["Paste the official mint", `Choose SOL as the token you are paying with, then paste ${DIZY_MINT} as the token you want to receive. Do not rely on the name or ticker alone.`],
  ["Check the quote", "Review the route, expected DIZY output, price impact, slippage and fees. Continue only when the DEX shows a valid route and the exact mint above."],
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
              <span>Mint revoked</span>
              <span>Freeze revoked</span>
            </div>
          </div>
          <div className={styles.coinPanel}>
            <div
              className={styles.coinLogo}
              role="img"
              aria-label="DIZY token logo"
              style={{ backgroundImage: `url(${TOKEN_LOGO_URL})` }}
            />
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
            <h2 id="buy-dizy">How to buy DIZY.</h2>
            <p>Use the mint, not the ticker. A swap should only be attempted when the DEX can actually find a valid liquidity route for the canonical token.</p>
            <div className={styles.dexLinks}>
              <a className="button primary" href="https://jup.ag" target="_blank" rel="noopener noreferrer">Open Jupiter ↗</a>
              <a className="button secondary" href="https://raydium.io/swap/" target="_blank" rel="noopener noreferrer">Open Raydium ↗</a>
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
            <strong>No route? Do not force it.</strong>
            <p>A DEX link is not a claim that DIZY currently has active liquidity, an exchange listing or a guaranteed market. If a venue does not show a valid route for the exact mint, do not substitute a similarly named token.</p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="verify-chain">
          <div className={styles.sectionHeading}>
            <div>
              <div className={styles.sectionKicker}>PUBLIC VERIFICATION</div>
              <h2 id="verify-chain">Inspect DIZY yourself.</h2>
            </div>
            <p>The important token identity and authority information is public and independently inspectable on Solana.</p>
          </div>
          <div className={styles.linkGrid}>
            <a href={SOLSCAN_URL} target="_blank" rel="noopener noreferrer"><span>BLOCK EXPLORER</span><strong>Solscan</strong><small>Mint, supply, holders and transactions ↗</small></a>
            <a href={SOLANA_EXPLORER_URL} target="_blank" rel="noopener noreferrer"><span>BLOCK EXPLORER</span><strong>Solana Explorer</strong><small>Canonical Solana account view ↗</small></a>
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
            <p>Cryptocurrency markets are volatile. Availability, liquidity, venue support and price can change or may not exist. Verify the mint and transaction details yourself before interacting with any token or DEX.</p>
            <Link className={styles.homeLink} href="/">Explore Everything Dizy™ →</Link>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <div>
          <a href={SOLSCAN_URL} target="_blank" rel="noopener noreferrer">Solscan</a>
          <a href={SOLANA_EXPLORER_URL} target="_blank" rel="noopener noreferrer">Solana Explorer</a>
          <Link href="/dex">DizyDEX</Link>
        </div>
      </footer>
    </div>
  );
}
