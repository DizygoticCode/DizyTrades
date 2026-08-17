import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "../../../lib/auth";
import { inspectProductionWriteCredentialActivationCeremony } from "../../../lib/write-credential-activation-ceremony";
import accountStyles from "../../account.module.css";
import styles from "../../egress/egress.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Query = Record<string, string | string[] | undefined>;
const RESULT = new Set(["active", "rejected", "invalid", "unconfigured"]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function shortDigest(value: string | null | undefined) {
  if (!value) return "—";
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
}

export default async function OwnerWriteCredentialActivationPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const result = first(query.result);
  const returnTarget = RESULT.has(result) ? `/account/write-credential/activate?result=${encodeURIComponent(result)}` : "/account/write-credential/activate";
  const user = await requireUser(returnTarget);
  if (user.id !== "rob" || user.role !== "owner") redirect("/terminal");

  const snapshot = await inspectProductionWriteCredentialActivationCeremony();
  const identity = snapshot?.identity ?? null;
  const authority = snapshot?.credentialAuthority ?? null;
  const custody = snapshot?.custody ?? null;
  const egress = snapshot?.egress ?? null;
  const state = egress?.state ?? null;
  const active = authority?.status === "active";
  const canActivate = Boolean(snapshot?.activationEligible && authority?.status === "attested" && custody?.status === "sealed");

  return (
    <main className={accountStyles.page}>
      <header className={accountStyles.header}>
        <div>
          <p className={accountStyles.eyebrow}>OWNER-ONLY · WRITE CREDENTIAL ACTIVATION</p>
          <h1>Activate one exact attested MEXC write generation</h1>
          <p className={accountStyles.intro}>
            Promote the single server-owned generation from <strong>attested</strong> to <strong>active</strong> only after rechecking its sealed fingerprint, exact Render /32 evidence and current production observer address. Activation authorizes the generation in #329; it does not connect a writer or submit an exchange order.
          </p>
        </div>
        <nav className={accountStyles.actions} aria-label="Write credential activation actions">
          <Link className={accountStyles.secondaryAction} href="/account/write-credential">Back to provisioning</Link>
          <a className={accountStyles.primaryAction} href="/account/write-credential/activate">Refresh activation evidence</a>
        </nav>
      </header>

      <section className={accountStyles.warning} role="status">
        <strong>Execution transport remains disconnected.</strong>{" "}This ceremony cannot construct or connect the production writer, change deployment activation flags, decrypt the write credential, or send a MEXC POST/order.
      </section>

      {result === "active" ? <section className={accountStyles.notice} role="status"><div><p className={accountStyles.eyebrow}>GENERATION ACTIVE</p><h2>#329 now marks the exact generation active.</h2><p>The production writer is still disconnected and no exchange request was sent.</p></div></section> : null}
      {result === "rejected" || result === "invalid" ? <section className={accountStyles.warning} role="alert"><strong>No activation transition was recorded.</strong>{" "}The request failed owner proof, operator confirmation, custody/fingerprint agreement, egress freshness, current public-IP agreement or authority CAS checks.</section> : null}
      {result === "unconfigured" ? <section className={accountStyles.warning} role="alert"><strong>The server-owned provisioning identity is unavailable.</strong>{" "}No activation was attempted.</section> : null}

      {!identity ? (
        <section className={styles.panel}><h2>Server-owned generation unavailable</h2><p>Complete and configure the #339 provisioning ceremony first. This page accepts no account or generation identifier from the browser.</p></section>
      ) : (
        <>
          <section className={accountStyles.statusGrid} aria-label="Write credential activation status">
            <article className={accountStyles.statusCard}><span>Exact account</span><strong>{identity.accountId}</strong><small>Owner {identity.userId} · server configured</small></article>
            <article className={accountStyles.statusCard}><span>Write generation</span><strong>{identity.writeCredentialGeneration}</strong><small>Browser override: impossible</small></article>
            <article className={accountStyles.statusCard}><span>#329 authority</span><strong data-status={active ? "fresh" : authority?.status === "attested" ? "fresh" : undefined}>{authority?.status ?? "Unavailable"}</strong><small>Revision {authority?.revision ?? "—"}</small></article>
            <article className={accountStyles.statusCard}><span>#331 custody</span><strong data-status={custody?.status === "sealed" ? "fresh" : undefined}>{custody?.status ?? "Unavailable"}</strong><small>Fingerprint {shortDigest(custody?.credentialFingerprintSha256)}</small></article>
            <article className={accountStyles.statusCard}><span>Render /32</span><strong data-status={state?.status === "allowlisted" ? "fresh" : undefined}>{state?.dedicatedIpv4s[0] ? `${state.dedicatedIpv4s[0]}/32` : "Unavailable"}</strong><small>{state?.status ?? "No durable egress state"}</small></article>
            <article className={accountStyles.statusCard}><span>Writer / transport</span><strong>DISCONNECTED</strong><small>#341 remains a separate future boundary</small></article>
          </section>

          <section className={styles.proofGrid} aria-label="Activation evidence">
            <article className={styles.detailCard}><span>Current observer IPv4</span><strong>{egress?.observerIpv4 ?? "No agreement"}</strong><small>Must equal the durable /32 above</small></article>
            <article className={styles.detailCard}><span>Production service</span><strong>{egress?.runtime?.serviceId ?? "Unavailable"}</strong><small>Must match the durable #330 service identity</small></article>
            <article className={styles.detailCard}><span>Last egress observation</span><strong>{state?.lastObservedAt ?? "—"}</strong><small>Activation enforces the existing freshness window</small></article>
            <article className={styles.detailCard}><span>Egress digest</span><strong className={styles.mono}>{shortDigest(state?.ipSetDigestSha256)}</strong><small>Must match the sealed custody receipt</small></article>
            <article className={styles.detailCard}><span>Authority fingerprint</span><strong className={styles.mono}>{shortDigest(authority?.credentialFingerprintSha256)}</strong><small>Must match #331 exactly</small></article>
            <article className={styles.detailCard}><span>Activated at</span><strong>{authority?.activatedAt ?? "Never"}</strong><small>No writer connection follows automatically</small></article>
          </section>

          {canActivate ? (
            <section className={styles.panel} aria-labelledby="activate-title">
              <h2 id="activate-title">Activate this exact generation</h2>
              <p>This is a durable authority transition. Reconfirm the external MEXC restrictions, then authorize it with the current owner password and a fresh replay-resistant TOTP. The server resolves the account, generation and expected authority revision itself.</p>
              <form className={styles.form} action="/api/account/write-credential/activate" method="post" autoComplete="off">
                <label className={styles.field}><span><input type="checkbox" name="orderPlacingOnlyConfirmed" value="confirmed" required /> I confirm this dedicated MEXC key still has Order Placing permission only.</span></label>
                <label className={styles.field}><span><input type="checkbox" name="mexcIpAllowlistConfirmed" value="confirmed" required /> I confirm MEXC is still restricted to exactly the proven public /32 shown above.</span></label>
                <label className={styles.field}><span><input type="checkbox" name="activateExactGeneration" value="confirmed" required /> I intend to activate exactly this server-owned account/generation and understand that writer connection remains separate.</span></label>
                <label className={styles.field}><span>Current account password</span><input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required /></label>
                <label className={styles.field}><span>Fresh 6-digit TOTP</span><input name="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>
                <button className={styles.primaryButton} type="submit">Activate exact attested generation</button>
              </form>
            </section>
          ) : null}

          {!active && !canActivate ? <section className={accountStyles.warning} role="alert"><strong>Activation is fail-closed.</strong>{" "}The exact generation must be attested, sealed custody must match its fingerprint and egress receipt, and the current production observer/service must agree with the durable allowlisted /32. Refresh the evidence or return to provisioning; this page will not bypass a failed prerequisite.</section> : null}

          {active ? <section className={styles.complete} role="status"><p className={accountStyles.eyebrow}>#340 AUTHORITY TRANSITION COMPLETE</p><h2>Generation active. Writer still disconnected.</h2><p>No credential was decrypted and no MEXC write request was made. Production writer composition remains a separately reviewed #341 boundary.</p></section> : null}
        </>
      )}
    </main>
  );
}
