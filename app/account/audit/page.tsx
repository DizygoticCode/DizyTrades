import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "../../lib/auth";
import {
  MexcOwnerShadowAuditIntegrityError,
  readOwnerMexcShadowAudit,
  type MexcOwnerShadowAuditEntry,
} from "../../lib/mexc-owner-shadow-audit";
import styles from "../account.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function titleCase(value: string) {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function shortDigest(value: string | null) {
  if (value === null) return "Genesis";
  return `${value.slice(0, 12)}…${value.slice(-6)}`;
}

function eventSummary(entry: MexcOwnerShadowAuditEntry) {
  if (entry.kind === "account-reconciliation") {
    const snapshot = record(entry.payload.accountSnapshot);
    const reconciliation = record(entry.payload.reconciliation);
    const summary = record(reconciliation?.summary);
    const assets = array(snapshot?.assets).length;
    const positions = array(snapshot?.positions).length;
    const aligned = number(summary?.aligned) ?? 0;
    const different = number(summary?.different) ?? 0;
    return `${assets} assets · ${positions} positions · ${aligned} aligned · ${different} different`;
  }
  if (entry.kind === "hypothetical-order-preview") {
    const request = record(entry.payload.request);
    const market = record(entry.payload.market);
    const projected = record(entry.payload.projectedPaper);
    const symbol = text(request?.symbol) ?? "Unknown symbol";
    const side = text(request?.side) ?? "unknown side";
    const notional = number(market?.notional);
    const available = number(projected?.availableMargin);
    return `${symbol} · ${titleCase(side)} · notional ${notional ?? "—"} · projected available ${available ?? "—"}`;
  }
  const action = text(entry.payload.action) ?? "connection state changed";
  const reason = text(entry.payload.reason);
  return reason ? `${titleCase(action)} · ${reason}` : titleCase(action);
}

export default async function OwnerShadowAuditPage() {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/terminal");

  let entries: readonly MexcOwnerShadowAuditEntry[] = [];
  let integrityFailure: string | null = null;
  try {
    entries = await readOwnerMexcShadowAudit(user.id);
  } catch (error) {
    integrityFailure = error instanceof MexcOwnerShadowAuditIntegrityError
      ? error.message
      : "The immutable shadow audit ledger could not be read.";
  }
  const recent = entries.slice(-100).reverse();
  const latest = entries.at(-1) ?? null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OWNER-ONLY · APPEND-ONLY · HASH-CHAINED</p>
          <h1>Shadow audit ledger</h1>
          <p className={styles.intro}>
            A persistent record of successful MEXC ↔ DizyPaper reconciliations,
            hypothetical previews and connection-control events. The browser sees
            bounded summaries only; credentials, signatures, headers and raw
            provider bodies are forbidden from the ledger.
          </p>
        </div>
        <nav className={styles.actions} aria-label="Audit ledger actions">
          <Link className={styles.secondaryAction} href="/account">
            Back to DizyAccount
          </Link>
          <a className={styles.primaryAction} href="/account/audit">
            Verify ledger again
          </a>
        </nav>
      </header>

      <section className={styles.statusGrid} aria-label="Audit ledger status">
        <article className={styles.statusCard}>
          <span>Integrity</span>
          <strong data-status={integrityFailure === null ? "fresh" : "unavailable"}>
            {integrityFailure === null ? "Verified" : "Failed"}
          </strong>
          <small>Every digest and previous-digest link is checked on read</small>
        </article>
        <article className={styles.statusCard}>
          <span>Recorded events</span>
          <strong>{entries.length}</strong>
          <small>Most recent 100 shown below</small>
        </article>
        <article className={styles.statusCard}>
          <span>Latest sequence</span>
          <strong>{latest?.sequence ?? "—"}</strong>
          <small>{latest ? new Date(latest.recordedAtMs).toISOString() : "No events recorded"}</small>
        </article>
        <article className={styles.statusCard}>
          <span>Latest digest</span>
          <strong>{latest ? shortDigest(latest.digest) : "—"}</strong>
          <small>SHA-256 hash-chain head</small>
        </article>
      </section>

      {integrityFailure ? (
        <section className={styles.notice} role="alert">
          <div>
            <p className={styles.eyebrow}>LEDGER INTEGRITY FAILURE</p>
            <h2>{integrityFailure}</h2>
            <p>
              New account reconciliation and preview results are not trusted until
              the persistent ledger is investigated. Existing MEXC state is not modified.
            </p>
          </div>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="shadow-audit-events-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>NORMALISED SUMMARIES ONLY</p>
            <h2 id="shadow-audit-events-title">Audit events</h2>
          </div>
          <span>{recent.length} displayed</span>
        </div>
        {recent.length === 0 ? (
          <p className={styles.empty}>
            No immutable Account Companion event has been recorded yet.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Recorded UTC</th>
                  <th>Event</th>
                  <th>Summary</th>
                  <th>Source policy</th>
                  <th>Previous digest</th>
                  <th>Digest</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((entry) => (
                  <tr key={entry.eventId}>
                    <th scope="row">#{entry.sequence}</th>
                    <td>{new Date(entry.recordedAtMs).toISOString()}</td>
                    <td>{titleCase(entry.kind)}</td>
                    <td>{eventSummary(entry)}</td>
                    <td>{entry.sourcePolicyVersion}</td>
                    <td title={entry.previousDigest ?? "Genesis"}>{shortDigest(entry.previousDigest)}</td>
                    <td title={entry.digest}>{shortDigest(entry.digest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className={styles.provenance}>
        Ledger schema: mexc-owner-shadow-audit/1.0.0. Persistence is local to the
        existing DizyTrades data root and does not create another database or paid
        service. Audit persistence failure blocks a result from being labelled fresh.
      </p>
    </main>
  );
}
