import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "../../lib/auth";
import {
  inspectProductionRenderEgressCeremony,
  type RenderEgressCeremonyIdentity,
} from "../../lib/render-egress-ceremony";
import accountStyles from "../account.module.css";
import styles from "./egress.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Query = Record<string, string | string[] | undefined>;
const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const RESULT = new Set(["declared", "observed", "rejected", "invalid"]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function shortDigest(value: string | null) {
  if (!value) return "—";
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
}

function mutationFields(accountId: string, generation: string) {
  return (
    <>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="writeCredentialGeneration" value={generation} />
      <label className={styles.field}>
        <span>Current account password</span>
        <input name="currentPassword" type="password" autoComplete="current-password" maxLength={256} required />
      </label>
      <label className={styles.field}>
        <span>Fresh 6-digit TOTP</span>
        <input name="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required />
      </label>
    </>
  );
}

export default async function OwnerRenderEgressCeremonyPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const result = first(query.result);
  const accountId = first(query.accountId).trim() || "owner-primary";
  const generation = first(query.generation).trim() || "render-egress-test-1";
  const returnParams = new URLSearchParams({
    accountId: ID.test(accountId) ? accountId : "owner-primary",
    generation: ID.test(generation) ? generation : "render-egress-test-1",
  });
  if (RESULT.has(result)) returnParams.set("result", result);
  const user = await requireUser(`/account/egress?${returnParams.toString()}`);
  if (user.id !== "rob" || user.role !== "owner") redirect("/terminal");

  const identity: RenderEgressCeremonyIdentity | null = ID.test(accountId) && ID.test(generation)
    ? Object.freeze({ userId: user.id, accountId, writeCredentialGeneration: generation })
    : null;
  const snapshot = identity ? await inspectProductionRenderEgressCeremony(identity) : null;
  const state = snapshot?.state ?? null;
  const declaredIp = state?.dedicatedIpv4s[0] ?? null;
  const canDeclare = Boolean(snapshot?.runtime && snapshot.observerIpv4 && state?.status === "unknown");
  const canObserve = Boolean(snapshot?.runtime && snapshot.observerIpv4 && state && (state.status === "declared" || state.status === "observed") && state.observationCount < 2 && snapshot.secondObservationReady);

  return (
    <main className={accountStyles.page}>
      <header className={accountStyles.header}>
        <div>
          <p className={accountStyles.eyebrow}>OWNER-ONLY · RENDER EGRESS REHEARSAL</p>
          <h1>Single-IP /32 proof ceremony</h1>
          <p className={accountStyles.intro}>
            Rehearse the exact #330/#332 network proof against the current production Render instance. Both fixed HTTPS observers must agree on one public IPv4, and two durable observations of that same address must be separated by at least 60 seconds.
          </p>
        </div>
        <nav className={accountStyles.actions} aria-label="Render egress ceremony actions">
          <Link className={accountStyles.secondaryAction} href="/account">Back to DizyAccount</Link>
          <a className={accountStyles.primaryAction} href={`/account/egress?accountId=${encodeURIComponent(accountId)}&generation=${encodeURIComponent(generation)}`}>Probe again</a>
        </nav>
      </header>

      <section className={accountStyles.warning} role="status">
        <strong>Rehearsal only.</strong>{" "}This surface cannot attest a MEXC allowlist, accept an exchange credential, activate a write credential, construct the production writer or submit an order. Each mutation requires the current password plus a fresh replay-resistant TOTP.
      </section>

      {result === "declared" ? <section className={accountStyles.notice} role="status"><div><p className={accountStyles.eyebrow}>DECLARATION RECORDED</p><h2>The observer-agreed IPv4 is now the exact temporary /32 identity.</h2><p>Wait for a new TOTP before recording observation 1.</p></div></section> : null}
      {result === "observed" ? <section className={accountStyles.notice} role="status"><div><p className={accountStyles.eyebrow}>OBSERVATION RECORDED</p><h2>The durable proof advanced by one observation.</h2><p>After observation 1, observation 2 remains blocked until at least 60 seconds have elapsed.</p></div></section> : null}
      {result === "rejected" || result === "invalid" ? <section className={accountStyles.warning} role="alert"><strong>No proof state changed.</strong>{" "}The request was rejected because the owner proof, runtime identity, observer agreement, declared address, generation state or observation timing did not satisfy the fail-closed ceremony.</section> : null}

      <section className={accountStyles.statusGrid} aria-label="Render egress proof status">
        <article className={accountStyles.statusCard}><span>Production runtime</span><strong data-status={snapshot?.runtime ? "fresh" : "unavailable"}>{snapshot?.runtime ? "Bound" : "Unavailable"}</strong><small>{snapshot?.runtime ? `Service ${snapshot.runtime.serviceId} · Frankfurt` : "Production Render main required"}</small></article>
        <article className={accountStyles.statusCard}><span>Dual-observer IPv4</span><strong data-status={snapshot?.observerIpv4 ? "fresh" : "unavailable"}>{snapshot?.observerIpv4 ?? "No agreement"}</strong><small>api4.ipify.org + checkip.amazonaws.com</small></article>
        <article className={accountStyles.statusCard}><span>Proof state</span><strong>{state?.status ?? "Unavailable"}</strong><small>Revision {state?.revision ?? "—"} · generation {generation}</small></article>
        <article className={accountStyles.statusCard}><span>Durable observations</span><strong data-status={snapshot?.complete ? "fresh" : undefined}>{state?.observationCount ?? 0} / 2</strong><small>{snapshot?.complete ? "Render rehearsal complete" : "Same exact declared IPv4 required"}</small></article>
      </section>

      <section className={styles.panel} aria-labelledby="identity-title">
        <h2 id="identity-title">Test identity</h2>
        <p>Use a disposable test generation. A generation is intentionally one-way: once declared it is not silently reset or reused.</p>
        <form className={styles.identityForm} action="/account/egress" method="get">
          <label className={styles.field}><span>Account ID</span><input name="accountId" defaultValue={accountId} maxLength={120} required /></label>
          <label className={styles.field}><span>Test write generation</span><input name="generation" defaultValue={generation} maxLength={120} required /></label>
          <button className={styles.secondaryButton} type="submit">Load / probe identity</button>
        </form>
      </section>

      <section className={styles.proofGrid} aria-label="Declared proof details">
        <article className={styles.detailCard}><span>Declared /32</span><strong>{declaredIp ? `${declaredIp}/32` : "Not declared"}</strong></article>
        <article className={styles.detailCard}><span>SHA-256 identity</span><strong className={styles.mono}>{shortDigest(state?.ipSetDigestSha256 ?? null)}</strong></article>
        <article className={styles.detailCard}><span>First observation</span><strong>{state?.firstObservedAt ?? "—"}</strong><small>{state?.firstObservedIp ?? "No durable observation yet"}</small></article>
        <article className={styles.detailCard}><span>Last observation</span><strong>{state?.lastObservedAt ?? "—"}</strong><small>{state?.lastObservedIp ?? "No durable observation yet"}</small></article>
        <article className={styles.detailCard}><span>Last runtime evidence</span><strong className={styles.mono}>{state?.lastObservedCommit ? shortDigest(state.lastObservedCommit) : "—"}</strong><small>{state?.lastObservedInstanceId ?? "No instance recorded"}</small></article>
        <article className={styles.detailCard}><span>Next observation eligible</span><strong>{snapshot?.secondObservationEligibleAt ?? (state?.observationCount === 0 ? "Now" : "—")}</strong><small>{snapshot?.secondObservationReady ? "Timing gate open" : "60-second gate closed"}</small></article>
      </section>

      {canDeclare && identity ? <section className={styles.panel} aria-labelledby="declare-title"><h2 id="declare-title">1. Declare the observer-agreed /32</h2><p>The IP displayed in the browser is informational only. Submission probes both observers again on the server and declares that server-observed value; no IP, service ID, region or revision is accepted from this form.</p><form className={styles.form} action="/api/account/render-egress" method="post"><input type="hidden" name="action" value="declare" />{mutationFields(identity.accountId, identity.writeCredentialGeneration)}<button className={styles.primaryButton} type="submit">Declare current observer IPv4</button></form></section> : null}

      {canObserve && identity ? <section className={styles.panel} aria-labelledby="observe-title"><h2 id="observe-title">{state?.observationCount === 0 ? "2. Record observation 1" : "3. Record observation 2"}</h2><p>The server probes both fixed observers again and refuses the mutation unless they still agree on the exact declared /32. Use a new current TOTP; previously consumed codes cannot be replayed.</p><form className={styles.form} action="/api/account/render-egress" method="post"><input type="hidden" name="action" value="observe" />{mutationFields(identity.accountId, identity.writeCredentialGeneration)}<button className={styles.primaryButton} type="submit">Record observation {state?.observationCount === 0 ? "1" : "2"}</button></form></section> : null}

      {state?.status === "observed" && state.observationCount === 1 && !snapshot?.secondObservationReady ? <section className={styles.panel} aria-labelledby="wait-title"><h2 id="wait-title">Observation 2 is time-locked</h2><p>Recheck this page after <strong>{snapshot?.secondObservationEligibleAt}</strong>. The API also enforces the same 60-second gate before owner TOTP verification.</p></section> : null}

      {snapshot?.complete ? <section className={styles.complete} role="status"><p className={accountStyles.eyebrow}>RENDER REHEARSAL COMPLETE</p><h2>Two separated observations proved the same exact public IPv4.</h2><p>Stop here. #333 deliberately provides no MEXC allowlist attestation or write-credential step.</p></section> : null}

      <p className={accountStyles.provenance}>Current production commit: {snapshot?.runtime?.gitCommit ?? "unavailable"}. Current instance: {snapshot?.runtime?.instanceId ?? "unavailable"}. Proof data is persisted under the existing #330 SQLite authority on the Render disk.</p>
    </main>
  );
}
