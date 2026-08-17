import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "../../lib/auth";
import {
  MEXC_WRITE_PROVISIONING_ACCOUNT_ID_ENV,
  MEXC_WRITE_PROVISIONING_GENERATION_ENV,
  inspectProductionWriteCredentialCeremony,
} from "../../lib/write-credential-provisioning-ceremony";
import accountStyles from "../account.module.css";
import styles from "../egress/egress.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Query = Record<string, string | string[] | undefined>;
const RESULT = new Set(["declared", "observed", "allowlisted", "provisioned", "rejected", "invalid", "unconfigured"]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function shortDigest(value: string | null | undefined) {
  if (!value) return "—";
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
}

function ownerProofFields() {
  return (
    <>
      <label className={styles.field}>
        <span>Current account password</span>
        <input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required />
      </label>
      <label className={styles.field}>
        <span>Fresh 6-digit TOTP</span>
        <input name="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required />
      </label>
    </>
  );
}

export default async function OwnerWriteCredentialProvisioningPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const result = first(query.result);
  const returnTarget = RESULT.has(result) ? `/account/write-credential?result=${encodeURIComponent(result)}` : "/account/write-credential";
  const user = await requireUser(returnTarget);
  if (user.id !== "rob" || user.role !== "owner") redirect("/terminal");

  const snapshot = await inspectProductionWriteCredentialCeremony();
  const identity = snapshot?.identity ?? null;
  const egress = snapshot?.egress ?? null;
  const state = egress?.state ?? null;
  const authority = snapshot?.credentialAuthority ?? null;
  const custody = snapshot?.custody ?? null;
  const canDeclare = Boolean(identity && egress?.runtime && egress.observerIpv4 && state?.status === "unknown");
  const canObserve = Boolean(
    identity
    && egress?.runtime
    && egress.observerIpv4
    && state
    && (state.status === "declared" || state.status === "observed")
    && state.observationCount < 2
    && egress.secondObservationReady,
  );
  const canAllowlist = Boolean(identity && state?.status === "observed" && state.observationCount >= 2 && authority?.status === "unknown");
  const canProvision = Boolean(identity && state?.status === "allowlisted" && authority?.status === "unknown" && snapshot?.custodyAvailable && !custody);
  const attested = authority?.status === "attested" && custody?.status === "sealed";

  return (
    <main className={accountStyles.page}>
      <header className={accountStyles.header}>
        <div>
          <p className={accountStyles.eyebrow}>OWNER-ONLY · WRITE CREDENTIAL PROVISIONING</p>
          <h1>Dedicated MEXC write-key ceremony</h1>
          <p className={accountStyles.intro}>
            Bind one server-owned account/generation to the proven Render /32, attest a dedicated MEXC Order Placing key, and immediately seal it into encrypted custody. Successful completion ends at <strong>attested</strong>, never active.
          </p>
        </div>
        <nav className={accountStyles.actions} aria-label="Write credential provisioning actions">
          <Link className={accountStyles.secondaryAction} href="/account">Back to DizyAccount</Link>
          <a className={accountStyles.primaryAction} href="/account/write-credential">Refresh ceremony</a>
        </nav>
      </header>

      <section className={accountStyles.warning} role="status">
        <strong>Execution remains disabled.</strong>{" "}This surface cannot activate a write generation, construct or connect the production writer, change deployment activation flags, or submit a MEXC order. Every state mutation requires the current password and a fresh replay-resistant TOTP.
      </section>

      {result === "declared" ? <section className={accountStyles.notice} role="status"><div><p className={accountStyles.eyebrow}>EGRESS DECLARED</p><h2>The exact server-owned generation now has a declared Render /32.</h2><p>Use a new owner proof for each observation.</p></div></section> : null}
      {result === "observed" ? <section className={accountStyles.notice} role="status"><div><p className={accountStyles.eyebrow}>OBSERVATION RECORDED</p><h2>The durable egress proof advanced.</h2><p>Two observations of the same address, separated by at least 60 seconds, are required.</p></div></section> : null}
      {result === "allowlisted" ? <section className={accountStyles.notice} role="status"><div><p className={accountStyles.eyebrow}>MEXC /32 ATTESTED</p><h2>The exact generation is now bound to the operator-confirmed MEXC IP allowlist.</h2><p>Use another fresh TOTP for credential sealing and #329 attestation.</p></div></section> : null}
      {result === "provisioned" ? <section className={accountStyles.notice} role="status"><div><p className={accountStyles.eyebrow}>CREDENTIAL SEALED + ATTESTED</p><h2>The dedicated credential is encrypted at rest and the exact generation is attested.</h2><p>No activation occurred and no order route was enabled.</p></div></section> : null}
      {result === "rejected" || result === "invalid" ? <section className={accountStyles.warning} role="alert"><strong>No successful ceremony transition was recorded.</strong>{" "}The request failed a bounded input, owner proof, egress, permission, custody or authority check. Credential material is never returned in the redirect.</section> : null}
      {result === "unconfigured" ? <section className={accountStyles.warning} role="alert"><strong>Server-owned identity is not configured.</strong>{" "}No mutation was attempted.</section> : null}

      {!identity ? (
        <section className={styles.panel} aria-labelledby="configuration-title">
          <h2 id="configuration-title">Server-owned identity required</h2>
          <p>
            Configure non-secret server variables <code>{MEXC_WRITE_PROVISIONING_ACCOUNT_ID_ENV}</code> and <code>{MEXC_WRITE_PROVISIONING_GENERATION_ENV}</code>. The browser is deliberately unable to supply or override either value.
          </p>
        </section>
      ) : (
        <>
          <section className={accountStyles.statusGrid} aria-label="Write credential ceremony status">
            <article className={accountStyles.statusCard}><span>Exact account</span><strong>{identity.accountId}</strong><small>Owner {identity.userId} · server configured</small></article>
            <article className={accountStyles.statusCard}><span>Write generation</span><strong>{identity.writeCredentialGeneration}</strong><small>Browser override: impossible</small></article>
            <article className={accountStyles.statusCard}><span>Render /32 proof</span><strong data-status={state?.status === "allowlisted" ? "fresh" : undefined}>{state?.status ?? "Unavailable"}</strong><small>{state?.dedicatedIpv4s[0] ? `${state.dedicatedIpv4s[0]}/32 · ${state.observationCount} observations` : "Not declared"}</small></article>
            <article className={accountStyles.statusCard}><span>#329 authority</span><strong data-status={authority?.status === "attested" ? "fresh" : undefined}>{authority?.status ?? "Unavailable"}</strong><small>Revision {authority?.revision ?? "—"} · activation not available here</small></article>
            <article className={accountStyles.statusCard}><span>#331 custody</span><strong data-status={custody?.status === "sealed" ? "fresh" : snapshot?.custodyAvailable ? undefined : "unavailable"}>{custody?.status ?? (snapshot?.custodyAvailable ? "Empty" : "Unavailable")}</strong><small>{custody ? `Revision ${custody.revision}` : "No credential receipt exposed"}</small></article>
            <article className={accountStyles.statusCard}><span>Execution capability</span><strong>OFF</strong><small>No writer activation or MEXC order POST</small></article>
          </section>

          <section className={styles.proofGrid} aria-label="Write credential evidence">
            <article className={styles.detailCard}><span>Current observer IPv4</span><strong>{egress?.observerIpv4 ?? "No agreement"}</strong><small>Dual fixed HTTPS observers</small></article>
            <article className={styles.detailCard}><span>Egress digest</span><strong className={styles.mono}>{shortDigest(state?.ipSetDigestSha256)}</strong><small>Exact single-host identity</small></article>
            <article className={styles.detailCard}><span>Last observation</span><strong>{state?.lastObservedAt ?? "—"}</strong><small>{state?.lastObservedIp ?? "No durable observation"}</small></article>
            <article className={styles.detailCard}><span>Allowlisted at</span><strong>{state?.allowlistedAt ?? "—"}</strong><small>{state?.mexcAllowlistAttestation ?? "No MEXC egress attestation"}</small></article>
            <article className={styles.detailCard}><span>Credential fingerprint</span><strong className={styles.mono}>{shortDigest(authority?.credentialFingerprintSha256 ?? custody?.credentialFingerprintSha256)}</strong><small>SHA-256 only · secret never displayed</small></article>
            <article className={styles.detailCard}><span>Authority activation</span><strong>{authority?.activatedAt ?? "Never"}</strong><small>#339 contains no activation capability</small></article>
          </section>

          {canDeclare ? <section className={styles.panel} aria-labelledby="declare-title"><h2 id="declare-title">1. Declare this generation&apos;s Render /32</h2><p>The server probes both fixed observers and declares only their exact agreed production IPv4. No IP, account, generation, service ID, region or CAS revision is accepted from the browser.</p><form className={styles.form} action="/api/account/write-credential" method="post"><input type="hidden" name="action" value="declare" />{ownerProofFields()}<button className={styles.primaryButton} type="submit">Declare current production /32</button></form></section> : null}

          {canObserve ? <section className={styles.panel} aria-labelledby="observe-title"><h2 id="observe-title">{state?.observationCount === 0 ? "2. Record observation 1" : "3. Record observation 2"}</h2><p>The server probes again and rejects any address change. Observation 2 remains time-locked for at least 60 seconds after observation 1.</p><form className={styles.form} action="/api/account/write-credential" method="post"><input type="hidden" name="action" value="observe" />{ownerProofFields()}<button className={styles.primaryButton} type="submit">Record observation {state?.observationCount === 0 ? "1" : "2"}</button></form></section> : null}

          {state?.status === "observed" && state.observationCount === 1 && !egress?.secondObservationReady ? <section className={styles.panel} aria-labelledby="wait-title"><h2 id="wait-title">Observation 2 is time-locked</h2><p>Recheck after <strong>{egress?.secondObservationEligibleAt}</strong>. The API enforces the same timing boundary.</p></section> : null}

          {canAllowlist ? <section className={styles.panel} aria-labelledby="allowlist-title"><h2 id="allowlist-title">4. Attest the MEXC IP restriction</h2><p>First create or configure the dedicated MEXC Futures credential so its API permission is Order Placing only and its IP restriction is exactly the proven address shown above. This step records only the allowlist attestation; it accepts no credential material.</p><form className={styles.form} action="/api/account/write-credential" method="post"><input type="hidden" name="action" value="allowlist" /><label className={styles.field}><span><input type="checkbox" name="mexcIpAllowlistConfirmed" value="confirmed" required /> I confirm MEXC is restricted to exactly this proven public /32.</span></label>{ownerProofFields()}<button className={styles.primaryButton} type="submit">Attest exact MEXC /32 allowlist</button></form></section> : null}

          {canProvision ? <section className={styles.panel} aria-labelledby="provision-title"><h2 id="provision-title">5. Seal the dedicated Order Placing credential</h2><p>Credential material is accepted only by this server POST, encrypted immediately into #331 custody, fingerprinted, and passed to #329 only as a SHA-256 fingerprint plus permission/egress attestations. It is never returned or rendered after submission.</p><form className={styles.form} action="/api/account/write-credential" method="post" autoComplete="off"><input type="hidden" name="action" value="provision" /><label className={styles.field}><span>MEXC access key</span><input name="accessKey" type="password" minLength={1} maxLength={512} autoComplete="off" required /></label><label className={styles.field}><span>MEXC secret key</span><input name="secretKey" type="password" minLength={1} maxLength={512} autoComplete="off" required /></label><label className={styles.field}><span><input type="checkbox" name="orderPlacingOnlyConfirmed" value="confirmed" required /> I confirm this dedicated key has Order Placing permission only.</span></label><label className={styles.field}><span><input type="checkbox" name="mexcIpAllowlistConfirmed" value="confirmed" required /> I confirm this key remains restricted to the exact proven /32 above.</span></label>{ownerProofFields()}<button className={styles.primaryButton} type="submit">Seal + attest credential</button></form></section> : null}

          {attested ? <section className={styles.complete} role="status"><p className={accountStyles.eyebrow}>#339 CEREMONY COMPLETE</p><h2>Credential sealed. Generation attested. Execution still disabled.</h2><p>The credential fingerprint agrees across #331 custody and #329 authority. There is no activation control on this page; activation remains a separate future review boundary.</p></section> : null}

          {!snapshot?.custodyAvailable ? <section className={accountStyles.warning} role="alert"><strong>Write custody is unavailable.</strong>{" "}Provisioning remains fail-closed until the existing #331 custody environment contract is enabled and valid.</section> : null}

          <p className={accountStyles.provenance}>Production runtime commit: {egress?.runtime?.gitCommit ?? "unavailable"}. Credential fingerprint: {shortDigest(authority?.credentialFingerprintSha256 ?? custody?.credentialFingerprintSha256)}. No raw credential material is present in this page model.</p>
        </>
      )}
    </main>
  );
}
