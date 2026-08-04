import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "../../lib/auth";
import { refreshOwnerMexcAccountCompanion } from "../../lib/mexc-owner-account-companion";
import { previewOwnerMexcOrder } from "../../lib/mexc-owner-order-preview";
import accountStyles from "../account.module.css";
import styles from "./preview.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined, fallback = "") {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function numberText(value: number) {
  return Number.isFinite(value)
    ? value.toLocaleString("en-GB", { maximumFractionDigits: 8 })
    : "—";
}

function statusLabel(value: string) {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default async function OwnerOrderPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/terminal");

  const query = await searchParams;
  const submitted = first(query.preview) === "1";
  const values = {
    symbol: first(query.symbol, "BTC_USDT").toUpperCase(),
    side: first(query.side, "long"),
    sizeMode: first(query.sizeMode, "fixed-margin"),
    amount: first(query.amount, "100"),
    leverage: first(query.leverage, "5"),
    marginMode: first(query.marginMode, "isolated"),
    stopLoss: first(query.stopLoss),
    takeProfit: first(query.takeProfit),
  };

  const companion = await refreshOwnerMexcAccountCompanion();
  const preview = submitted
    ? await previewOwnerMexcOrder({
        userId: user.id,
        companion,
        request: values,
      })
    : null;
  const state = companion.account.state;
  const snapshot = state.status === "fresh" || state.status === "stale"
    ? state.snapshot
    : null;
  const usdt = snapshot?.assets.find((asset) => asset.currency === "USDT") ?? null;

  return (
    <main className={accountStyles.page}>
      <header className={accountStyles.header}>
        <div>
          <p className={accountStyles.eyebrow}>OWNER-ONLY · NON-EXECUTABLE</p>
          <h1>Hypothetical order preview</h1>
          <p className={accountStyles.intro}>
            Compare a proposed new DizyPaper position with the currently observed
            MEXC account state. This page has no submit, order, cancellation,
            leverage-change, transfer or exchange-write capability.
          </p>
        </div>
        <nav className={accountStyles.actions} aria-label="Preview actions">
          <span className={styles.badge}>EXCHANGE WRITE: NONE</span>
          <Link className={accountStyles.secondaryAction} href="/account">
            Back to DizyAccount
          </Link>
        </nav>
      </header>

      <section className={accountStyles.statusGrid} aria-label="Preview prerequisites">
        <article className={accountStyles.statusCard}>
          <span>MEXC account state</span>
          <strong data-status={state.status}>{statusLabel(state.status)}</strong>
          <small>
            {state.status === "fresh"
              ? `${state.ageMs} ms old`
              : "A fresh private snapshot is required"}
          </small>
        </article>
        <article className={accountStyles.statusCard}>
          <span>Observed USDT equity</span>
          <strong>{usdt?.equity ?? "—"}</strong>
          <small>Real MEXC state remains unchanged</small>
        </article>
        <article className={accountStyles.statusCard}>
          <span>Observed open positions</span>
          <strong>{snapshot?.summary.openPositionCount ?? "—"}</strong>
          <small>Read-only provider observation</small>
        </article>
        <article className={accountStyles.statusCard}>
          <span>Preview eligibility</span>
          <strong data-status={state.status === "fresh" ? "fresh" : "unavailable"}>
            {state.status === "fresh" ? "Available" : "Blocked"}
          </strong>
          <small>New DizyPaper positions only</small>
        </article>
      </section>

      <section className={accountStyles.section} aria-labelledby="preview-form-title">
        <div className={accountStyles.sectionHeading}>
          <div>
            <p className={accountStyles.eyebrow}>HYPOTHETICAL INPUT</p>
            <h2 id="preview-form-title">Proposed DizyPaper position</h2>
          </div>
          <span>GET-only calculation · no state mutation</span>
        </div>
        <form className={styles.form} action="/account/preview" method="get">
          <input type="hidden" name="preview" value="1" />
          <label className={styles.field}>
            <span>Symbol</span>
            <input name="symbol" defaultValue={values.symbol} pattern="[A-Z0-9]{1,20}_[A-Z0-9]{1,20}" required />
          </label>
          <label className={styles.field}>
            <span>Side</span>
            <select name="side" defaultValue={values.side}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Sizing mode</span>
            <select name="sizeMode" defaultValue={values.sizeMode}>
              <option value="fixed-margin">Fixed margin</option>
              <option value="fixed-notional">Fixed notional</option>
              <option value="equity-percent">Equity percentage</option>
              <option value="risk-percent">Risk percentage</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Amount</span>
            <input name="amount" type="number" min="0.00000001" step="any" defaultValue={values.amount} required />
          </label>
          <label className={styles.field}>
            <span>Leverage</span>
            <input name="leverage" type="number" min="1" step="1" defaultValue={values.leverage} required />
          </label>
          <label className={styles.field}>
            <span>Margin mode</span>
            <select name="marginMode" defaultValue={values.marginMode}>
              <option value="isolated">Isolated</option>
              <option value="cross">Cross</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Stop loss</span>
            <input name="stopLoss" type="number" min="0" step="any" defaultValue={values.stopLoss} />
          </label>
          <label className={styles.field}>
            <span>Take profit</span>
            <input name="takeProfit" type="number" min="0" step="any" defaultValue={values.takeProfit} />
          </label>
          <div className={styles.submitRow}>
            <button className={styles.submit} type="submit">
              Calculate hypothetical preview
            </button>
          </div>
        </form>
      </section>

      {preview?.status === "blocked" ? (
        <section className={accountStyles.warning} role="status">
          <strong>Preview blocked.</strong> A fresh MEXC account snapshot is required.
        </section>
      ) : null}

      {preview?.status === "unavailable" ? (
        <section className={accountStyles.notice} role="status">
          <div>
            <p className={accountStyles.eyebrow}>PREVIEW UNAVAILABLE</p>
            <h2>{preview.failure.message}</h2>
            <p>Reason: {statusLabel(preview.reason)}. No account state was changed.</p>
          </div>
        </section>
      ) : null}

      {preview?.status === "fresh" ? (
        <>
          <section className={accountStyles.section} aria-labelledby="preview-result-title">
            <div className={accountStyles.sectionHeading}>
              <div>
                <p className={accountStyles.eyebrow}>REAL OBSERVATION ↔ HYPOTHETICAL PAPER STATE</p>
                <h2 id="preview-result-title">Preview result</h2>
              </div>
              <span>{preview.request.symbol} · {statusLabel(preview.request.side)}</span>
            </div>
            <div className={styles.compareGrid}>
              <article className={styles.panel}>
                <h3>Observed MEXC account</h3>
                <dl className={styles.metrics}>
                  <div><dt>Observed at</dt><dd>{new Date(preview.exchangeObserved.observedAtMs).toISOString()}</dd></div>
                  <div><dt>USDT equity</dt><dd>{preview.exchangeObserved.equity ?? "—"}</dd></div>
                  <div><dt>USDT available</dt><dd>{preview.exchangeObserved.availableBalance ?? "—"}</dd></div>
                  <div><dt>Position margin</dt><dd>{preview.exchangeObserved.positionMargin ?? "—"}</dd></div>
                  <div><dt>Matching symbol positions</dt><dd>{preview.exchangeObserved.matchingSymbolPositionCount}</dd></div>
                  <div><dt>Observed symbol exposure</dt><dd>{numberText(preview.exchangeObserved.matchingSymbolGrossExposure)}</dd></div>
                </dl>
              </article>
              <article className={styles.panel}>
                <h3>Projected DizyPaper account</h3>
                <dl className={styles.metrics}>
                  <div><dt>Equity before</dt><dd>{numberText(preview.paperBefore.equity)}</dd></div>
                  <div><dt>Projected equity</dt><dd>{numberText(preview.projectedPaper.equity)}</dd></div>
                  <div><dt>Available before</dt><dd>{numberText(preview.paperBefore.availableMargin)}</dd></div>
                  <div><dt>Projected available</dt><dd>{numberText(preview.projectedPaper.availableMargin)}</dd></div>
                  <div><dt>Projected used margin</dt><dd>{numberText(preview.projectedPaper.usedMargin)}</dd></div>
                  <div><dt>Projected open positions</dt><dd>{preview.projectedPaper.openPositionCount}</dd></div>
                </dl>
              </article>
            </div>
          </section>

          <section className={accountStyles.section} aria-labelledby="preview-position-title">
            <div className={accountStyles.sectionHeading}>
              <div>
                <p className={accountStyles.eyebrow}>HYPOTHETICAL POSITION · INFORMATIONAL ONLY</p>
                <h2 id="preview-position-title">Position economics</h2>
              </div>
              <span>{preview.market.priceSource.toUpperCase()} price {numberText(preview.market.price)}</span>
            </div>
            <div className={accountStyles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Symbol / side</th>
                    <th>Contracts</th>
                    <th>Base quantity</th>
                    <th>Gross exposure</th>
                    <th>Margin</th>
                    <th>Entry fee</th>
                    <th>Est. liquidation</th>
                    <th>Bankruptcy</th>
                    <th>Combined observed + hypothetical exposure</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{preview.request.symbol} · {statusLabel(preview.request.side)}</th>
                    <td>{numberText(preview.market.contractVolume)}</td>
                    <td>{numberText(preview.market.quantity)}</td>
                    <td>{numberText(preview.projectedPaper.grossExposure)}</td>
                    <td>{numberText(preview.projectedPaper.positionMargin)}</td>
                    <td>{numberText(preview.projectedPaper.entryFee)}</td>
                    <td>{numberText(preview.projectedPaper.estimatedLiquidation)}</td>
                    <td>{numberText(preview.projectedPaper.bankruptcyPrice)}</td>
                    <td>{numberText(preview.exchangeObserved.combinedObservedAndHypotheticalExposure)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className={styles.warningList}>
              {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
