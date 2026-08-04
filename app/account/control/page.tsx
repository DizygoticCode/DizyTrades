import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "../../lib/auth";
import {
  MEXC_OWNER_SHUTDOWN_CONFIRMATION,
  readOwnerMexcConnectionControl,
} from "../../lib/mexc-owner-connection-control";
import accountStyles from "../account.module.css";
import styles from "./control.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function titleCase(value: string) {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default async function OwnerConnectionControlPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/terminal");

  const query = await searchParams;
  const result = first(query.result);
  const audit = first(query.audit);
  const control = await readOwnerMexcConnectionControl();

  return (
    <main className={accountStyles.page}>
      <header className={accountStyles.header}>
        <div>
          <p className={accountStyles.eyebrow}>OWNER-ONLY · EMERGENCY FAIL-CLOSED CONTROL</p>
          <h1>MEXC connection shutdown</h1>
          <p className={accountStyles.intro}>
            Seal all Account Companion private reads locally before credentials are
            parsed or any provider request is attempted. The seal persists in the
            existing data root across application restarts.
          </p>
        </div>
        <nav className={accountStyles.actions} aria-label="Connection-control actions">
          <Link className={accountStyles.secondaryAction} href="/account">
            Back to DizyAccount
          </Link>
          <a className={accountStyles.primaryAction} href="/account/control">
            Recheck state
          </a>
        </nav>
      </header>

      <section className={accountStyles.statusGrid} aria-label="Connection-control status">
        <article className={accountStyles.statusCard}>
          <span>Local private-read state</span>
          <strong data-status={control.localPrivateReadsBlocked ? "unavailable" : "fresh"}>
            {control.localPrivateReadsBlocked ? "Sealed" : "Active"}
          </strong>
          <small>Generation {control.generation} · {titleCase(control.reason)}</small>
        </article>
        <article className={accountStyles.statusCard}>
          <span>Control integrity</span>
          <strong data-status={control.integrity === "failed" ? "unavailable" : "fresh"}>
            {titleCase(control.integrity)}
          </strong>
          <small>{control.message ?? "Persistent control state verified"}</small>
        </article>
        <article className={accountStyles.statusCard}>
          <span>Server credential pair</span>
          <strong>{control.credentialPairPresent ? "Still present" : "Absent or incomplete"}</strong>
          <small>Values are never returned to this page</small>
        </article>
        <article className={accountStyles.statusCard}>
          <span>Removal confirmation</span>
          <strong data-status={control.credentialRemovalConfirmed ? "fresh" : "unavailable"}>
            {control.credentialRemovalConfirmed ? "Confirmed absent" : "Not confirmed"}
          </strong>
          <small>
            Companion flag: {control.companionEnabledFlag} · attestation: {control.permissionAttestationPresent ? "present" : "absent"}
          </small>
        </article>
      </section>

      {result === "sealed" ? (
        <section className={accountStyles.warning} role="status">
          <strong>Private MEXC reads are locally sealed.</strong>{" "}
          {audit === "recorded"
            ? "The shutdown event was appended to the immutable ledger."
            : "The seal succeeded, but the shutdown audit event could not be confirmed."}
        </section>
      ) : null}

      {result === "error" ? (
        <section className={accountStyles.notice} role="alert">
          <div>
            <p className={accountStyles.eyebrow}>SHUTDOWN REQUEST REJECTED</p>
            <h2>The local seal was not changed.</h2>
            <p>
              Confirm the exact phrase, use the authenticated owner session and
              submit from this page.
            </p>
          </div>
        </section>
      ) : null}

      {control.localPrivateReadsBlocked ? (
        <section className={styles.panel} aria-labelledby="sealed-title">
          <h2 id="sealed-title" className={styles.danger}>Local private reads are sealed</h2>
          <p>
            DizyTrades will return an explicit inactive state without requiring the
            API key or secret and without calling MEXC private endpoints. This seal
            is intentionally not reversible from the browser.
          </p>
          <h3>Complete physical credential removal in Render</h3>
          <ol className={styles.steps}>
            <li>Remove <span className={styles.code}>OWNER_MEXC_READONLY_API_KEY</span>.</li>
            <li>Remove <span className={styles.code}>OWNER_MEXC_READONLY_API_SECRET</span>.</li>
            <li>Remove <span className={styles.code}>OWNER_MEXC_READONLY_PERMISSION_ATTESTATION</span>.</li>
            <li>Set <span className={styles.code}>OWNER_MEXC_ACCOUNT_COMPANION_ENABLED=false</span>.</li>
            <li>Keep <span className={styles.code}>LIVE_TRADING_ENABLED=false</span>.</li>
            <li>Redeploy, then return here until removal reads <strong className={styles.good}>Confirmed absent</strong>.</li>
          </ol>
          <p>
            DizyTrades cannot delete Render environment variables itself. It only
            verifies their presence or absence without exposing their values.
          </p>
        </section>
      ) : (
        <section className={styles.panel} aria-labelledby="shutdown-title">
          <h2 id="shutdown-title" className={styles.danger}>Emergency local shutdown</h2>
          <p>
            This immediately disables all Account Companion private reads. It does
            not alter MEXC, close positions, revoke the key at MEXC or delete Render
            configuration. Existing public charts and DizyPaper remain available.
          </p>
          <form className={styles.form} action="/account/control/shutdown" method="post">
            <label className={styles.field}>
              <span>Exact confirmation phrase</span>
              <input
                name="confirmation"
                autoComplete="off"
                required
                placeholder={MEXC_OWNER_SHUTDOWN_CONFIRMATION}
              />
            </label>
            <label className={styles.field}>
              <span>Optional operator reason</span>
              <textarea
                name="operatorReason"
                maxLength={240}
                placeholder="Reason for sealing the read-only connection"
              />
            </label>
            <button className={styles.shutdown} type="submit">
              Seal all private MEXC reads
            </button>
          </form>
        </section>
      )}

      <p className={accountStyles.provenance}>
        Connection-control schema: {control.schemaVersion}. A missing control file
        defaults to active; an invalid or unreadable control file fails closed as
        sealed. Browser reactivation is deliberately unavailable.
      </p>
    </main>
  );
}
