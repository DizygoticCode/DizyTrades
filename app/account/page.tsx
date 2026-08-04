import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "../lib/auth";
import { refreshOwnerMexcAccountCompanion } from "../lib/mexc-owner-account-companion";
import { reconcileOwnerMexcAccountWithDizyPaper } from "../lib/mexc-owner-account-reconciliation";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function shortDigest(value: string) {
  return value.length > 16 ? `${value.slice(0, 12)}…${value.slice(-4)}` : value;
}

function titleCase(value: string) {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function comparisonLabel(comparison: Readonly<{
  comparable: boolean;
  withinTolerance: boolean | null;
}>) {
  if (!comparison.comparable) return "Not comparable";
  return comparison.withinTolerance ? "Within tolerance" : "Different";
}

function displayNumber(value: number | null) {
  return value === null ? "—" : String(value);
}

export default async function AccountCompanionPage() {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/terminal");

  const companion = await refreshOwnerMexcAccountCompanion();
  const reconciliation = await reconcileOwnerMexcAccountWithDizyPaper({
    userId: user.id,
    companion,
  });
  const { activation, state } = companion.account;
  const risk = companion.risk;
  const snapshot = state.status === "fresh" || state.status === "stale"
    ? state.snapshot
    : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OWNER-ONLY · READ-ONLY MEXC FUTURES</p>
          <h1>DizyAccount Companion</h1>
          <p className={styles.intro}>
            Live balances, open positions, provider risk context and deterministic
            DizyPaper reconciliation from the owner-scoped MEXC key. This surface
            cannot place, cancel, modify or automatically correct exchange orders.
          </p>
        </div>
        <nav className={styles.actions} aria-label="Account Companion actions">
          <Link className={styles.secondaryAction} href="/terminal">
            Back to terminal
          </Link>
          <a className={styles.primaryAction} href="/account">
            Refresh from MEXC
          </a>
        </nav>
      </header>

      <section className={styles.statusGrid} aria-label="Connection status">
        <article className={styles.statusCard}>
          <span>Connection</span>
          <strong>{activation.readyForPrivateReads ? "Ready" : "Disabled"}</strong>
          <small>{activation.configured ? "Owner credentials configured" : "No active private connection"}</small>
        </article>
        <article className={styles.statusCard}>
          <span>Account state</span>
          <strong data-status={state.status}>{titleCase(state.status)}</strong>
          <small>
            {state.status === "fresh"
              ? `${state.ageMs} ms old · decision eligible`
              : state.status === "stale"
                ? `${state.ageMs} ms old · display only`
                : "No trusted private snapshot"}
          </small>
        </article>
        <article className={styles.statusCard}>
          <span>Risk context</span>
          <strong data-status={risk.status === "fresh" ? "fresh" : risk.status === "not-applicable" ? "fresh" : "unavailable"}>
            {titleCase(risk.status)}
          </strong>
          <small>
            {risk.status === "fresh"
              ? `${risk.snapshot.summary.coveredPositionCount}/${risk.snapshot.summary.openPositionCount} positions covered`
              : risk.status === "not-applicable"
                ? "No open position requires a risk tier"
                : risk.status === "blocked"
                  ? "Requires fresh account state"
                  : risk.failure.message}
          </small>
        </article>
        <article className={styles.statusCard}>
          <span>Shadow reconciliation</span>
          <strong data-status={reconciliation.status === "fresh" ? "fresh" : "unavailable"}>
            {titleCase(reconciliation.status)}
          </strong>
          <small>
            {reconciliation.status === "fresh"
              ? `${reconciliation.report.summary.aligned} aligned · ${reconciliation.report.summary.different} different`
              : reconciliation.status === "blocked"
                ? "Requires fresh MEXC state"
                : reconciliation.failure.message}
          </small>
        </article>
        <article className={styles.statusCard}>
          <span>Exchange capability</span>
          <strong>GET / read only</strong>
          <small>Write permission requested: no</small>
        </article>
        <article className={styles.statusCard}>
          <span>Software proof</span>
          <strong>{activation.softwareBoundaryProved ? "Passed" : "Blocked"}</strong>
          <small title={activation.softwareProofDigest}>
            {shortDigest(activation.softwareProofDigest)}
          </small>
        </article>
      </section>

      {state.status === "unavailable" ? (
        <section className={styles.notice} role="status">
          <div>
            <p className={styles.eyebrow}>PRIVATE ACCOUNT STATE UNAVAILABLE</p>
            <h2>{state.failure.message}</h2>
            <p>
              Required action: <strong>{titleCase(state.failure.action)}</strong>
              {state.failure.providerCode === null
                ? "."
                : ` · MEXC code ${state.failure.providerCode}.`}
            </p>
          </div>
        </section>
      ) : null}

      {state.status === "stale" ? (
        <section className={styles.warning} role="status">
          <strong>Stale private account snapshot.</strong>{" "}
          Values below are retained for labelled display only and cannot drive a
          decision. Reason: {titleCase(state.staleReason)}.
          {state.failure ? ` ${state.failure.message}` : ""}
        </section>
      ) : null}

      {risk.status === "unavailable" ? (
        <section className={styles.warning} role="status">
          <strong>Provider risk context unavailable.</strong>{" "}
          The balance and position snapshot remains valid, but tier/MMR/IMR
          context could not be refreshed. {risk.failure.message}
          {risk.failure.providerCode === null
            ? ""
            : ` MEXC code ${risk.failure.providerCode}.`}
        </section>
      ) : null}

      {reconciliation.status === "unavailable" ? (
        <section className={styles.warning} role="status">
          <strong>DizyPaper reconciliation unavailable.</strong>{" "}
          {reconciliation.failure.message} Neither account was changed.
        </section>
      ) : null}

      {snapshot ? (
        <>
          <section className={styles.section} aria-labelledby="account-balances-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>FUTURES ASSETS</p>
                <h2 id="account-balances-title">Balances</h2>
              </div>
              <span>{snapshot.summary.assetCount} assets</span>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Currency</th>
                    <th>Equity</th>
                    <th>Available</th>
                    <th>Cash</th>
                    <th>Position margin</th>
                    <th>Unrealised P/L</th>
                    <th>Frozen</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.assets.map((asset) => (
                    <tr key={asset.currency}>
                      <th scope="row">{asset.currency}</th>
                      <td>{asset.equity}</td>
                      <td>{asset.availableBalance}</td>
                      <td>{asset.cashBalance}</td>
                      <td>{asset.positionMargin}</td>
                      <td>{asset.unrealizedPnl}</td>
                      <td>{asset.frozenBalance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="account-positions-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>OPEN FUTURES EXPOSURE</p>
                <h2 id="account-positions-title">Positions</h2>
              </div>
              <span>{snapshot.summary.openPositionCount} open</span>
            </div>
            {snapshot.positions.length === 0 ? (
              <p className={styles.empty}>No open MEXC futures positions.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Margin</th>
                      <th>Leverage</th>
                      <th>Contracts</th>
                      <th>Entry / hold avg</th>
                      <th>Liquidation</th>
                      <th>Initial margin</th>
                      <th>Realised P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.positions.map((position) => (
                      <tr key={position.positionId}>
                        <th scope="row">{position.symbol}</th>
                        <td>{titleCase(position.side)}</td>
                        <td>{titleCase(position.marginMode)}</td>
                        <td>{position.leverage}×</td>
                        <td>{position.holdVolume}</td>
                        <td>{position.holdAveragePrice}</td>
                        <td>{position.liquidationPrice}</td>
                        <td>{position.initialMargin}</td>
                        <td>{position.realisedPnl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {risk.status === "fresh" ? (
            <section className={styles.section} aria-labelledby="account-risk-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>PROVIDER RISK CONTEXT · INFORMATIONAL</p>
                  <h2 id="account-risk-title">Risk limits</h2>
                </div>
                <span>{risk.snapshot.summary.attentionPositionCount} need attention</span>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Level</th>
                      <th>Current / max leverage</th>
                      <th>Current / max contracts</th>
                      <th>MMR</th>
                      <th>IMR</th>
                      <th>ADL</th>
                      <th>Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risk.snapshot.positions.map((position) => (
                      <tr key={position.positionId}>
                        <th scope="row">{position.symbol}</th>
                        <td>{titleCase(position.side)}</td>
                        <td>{position.riskLimit?.level ?? "Unavailable"}</td>
                        <td>
                          {position.leverage}× / {position.riskLimit ? `${position.riskLimit.maxLeverage}×` : "—"}
                        </td>
                        <td>
                          {position.holdVolume} / {position.riskLimit?.maxVolume ?? "—"}
                        </td>
                        <td>{position.riskLimit?.maintenanceMarginRate ?? "—"}</td>
                        <td>{position.riskLimit?.initialMarginRate ?? "—"}</td>
                        <td>{position.adlLevel ?? "—"}</td>
                        <td>
                          {position.attentionReasons.length === 0
                            ? "Within observed provider limits"
                            : position.attentionReasons.map(titleCase).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.contextNote}>
                Provider risk context is not a liquidation oracle. It does not
                include pending-order exposure, future tier changes, matching-engine
                state or exchange-exact liquidation behaviour.
              </p>
            </section>
          ) : null}

          {reconciliation.status === "fresh" ? (
            <>
              <section className={styles.section} aria-labelledby="account-reconciliation-title">
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.eyebrow}>REAL MEXC ↔ DIZYPAPER SHADOW STATE</p>
                    <h2 id="account-reconciliation-title">Account reconciliation</h2>
                  </div>
                  <span>
                    {reconciliation.report.summary.aligned} aligned · {reconciliation.report.summary.different} different · {reconciliation.report.summary.incomparable} incomparable
                  </span>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Measure</th>
                        <th>MEXC</th>
                        <th>DizyPaper</th>
                        <th>Difference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ["Available cash", reconciliation.report.account.availableCash],
                        ["Equity", reconciliation.report.account.equity],
                        ["Position margin", reconciliation.report.account.positionMargin],
                        ["Unrealised P/L", reconciliation.report.account.unrealizedPnl],
                      ] as const).map(([label, comparison]) => (
                        <tr key={label}>
                          <th scope="row">{label}</th>
                          <td>{comparison.exchangeValue ?? "—"}</td>
                          <td>{displayNumber(comparison.paperValue)}</td>
                          <td>{displayNumber(comparison.difference)}</td>
                          <td>{comparisonLabel(comparison)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={styles.contextNote}>
                  DizyPaper is a separate hypothetical account. Differences are
                  observations, not errors and not automatic corrections. Paper
                  state updated {new Date(reconciliation.paperAccount.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" })} UTC.
                </p>
              </section>

              <section className={styles.section} aria-labelledby="position-reconciliation-title">
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.eyebrow}>POSITION-BY-POSITION COMPARISON</p>
                    <h2 id="position-reconciliation-title">Position reconciliation</h2>
                  </div>
                  <span>{reconciliation.report.positions.length} identities</span>
                </div>
                {reconciliation.report.positions.length === 0 ? (
                  <p className={styles.empty}>Neither account has an open position to compare.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Symbol / side</th>
                          <th>Status</th>
                          <th>Margin mode</th>
                          <th>Leverage</th>
                          <th>Contracts</th>
                          <th>Entry</th>
                          <th>Margin</th>
                          <th>Liquidation</th>
                          <th>Context</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconciliation.report.positions.map((position) => (
                          <tr key={position.key}>
                            <th scope="row">{position.symbol} · {titleCase(position.side)}</th>
                            <td>{titleCase(position.status)}</td>
                            <td>{position.marginModeMatches === null ? "—" : position.marginModeMatches ? "Match" : "Different"}</td>
                            <td>{position.leverageMatches === null ? "—" : position.leverageMatches ? "Match" : "Different"}</td>
                            <td>{comparisonLabel(position.contractVolume)}</td>
                            <td>{comparisonLabel(position.entryPrice)}</td>
                            <td>{comparisonLabel(position.margin)}</td>
                            <td>{comparisonLabel(position.liquidationPrice)}</td>
                            <td>{position.warnings.length === 0 ? "Comparable" : position.warnings.join(" ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className={styles.contextNote}>
                  Public marks: {reconciliation.marks.length === 0
                    ? "not required"
                    : reconciliation.marks.map((mark) => `${mark.symbol} ${mark.status === "fresh" ? `${mark.price} (${mark.source})` : "unavailable"}`).join(" · ")}.
                  Reconciliation is informational and never mutates MEXC or DizyPaper.
                </p>
              </section>
            </>
          ) : null}

          <footer className={styles.provenance}>
            Account observed {new Date(snapshot.observedAtMs).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "medium",
              timeZone: "UTC",
            })} UTC from {snapshot.provenance.reads.map((read) => read.endpoint).join(" + ")}.
            {risk.status === "fresh"
              ? ` Risk context observed ${new Date(risk.snapshot.observedAtMs).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" })} UTC from risk-limits.`
              : ""}
            {" "}No key, secret, signature or signed request material is present in this page model.
          </footer>
        </>
      ) : null}
    </main>
  );
}
