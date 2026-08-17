import "server-only";

import {
  RENDER_DEDICATED_EGRESS_ATTESTATION,
  RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS,
  RENDER_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS,
  SqliteRenderEgressProofStore,
  attestMexcEgressAllowlisted,
  declareRenderDedicatedEgress,
  observeRenderDedicatedEgress,
  probeProductionRenderEgressIpv4,
  renderRuntimeEvidenceFromEnvironment,
  type OwnerRenderEgressProof,
  type RenderEgressState,
  type RenderRuntimeEvidence,
} from "./internal/render-egress-proof-authority";
import {
  activateWriteCredentialAuthority,
  attestWriteCredentialAuthority,
  revokeWriteCredentialAuthority,
  type OwnerWriteCredentialAuthorityProof,
} from "./internal/write-credential-attestation-authority";
import {
  MEXC_WRITE_EGRESS_ATTESTATION,
  MEXC_WRITE_PERMISSION_ATTESTATION,
  SqliteExecutionWriteCredentialAuthorityStore,
  type ExecutionWriteCredentialAuthorityStore,
  type WriteCredentialAuthorityState,
} from "./internal/write-credential-authority-store";

export { MEXC_WRITE_PERMISSION_ATTESTATION };

const SHA256 = /^[a-f0-9]{64}$/;
const RENDER_EGRESS_CEREMONY_REGION = "frankfurt" as const;

export type WriteProvisioningIdentity = Readonly<{
  userId: string;
  accountId: string;
  writeCredentialGeneration: string;
}>;

export type WriteProvisioningEgressEvidence = Readonly<{
  revision: number;
  ipSetDigestSha256: string;
  allowlistedAt: string;
}>;

export type WriteActivationCustodyEvidence = Readonly<{
  status: "sealed" | "revoked";
  credentialFingerprintSha256: string;
  egressProofRevision: number;
  egressIpSetDigestSha256: string;
  egressAllowlistedAt: string;
}>;

export type WriteProvisioningOwnerProof = OwnerWriteCredentialAuthorityProof;
export type RenderEgressCeremonyOwnerProof = OwnerRenderEgressProof;
export type RenderEgressCeremonySnapshot = Readonly<{
  region: typeof RENDER_EGRESS_CEREMONY_REGION;
  runtime: RenderRuntimeEvidence | null;
  observerIpv4: string | null;
  state: RenderEgressState;
  secondObservationEligibleAt: string | null;
  secondObservationReady: boolean;
  complete: boolean;
}>;

function secondObservationTiming(state: RenderEgressState, nowMs: number) {
  if (!state.lastObservedAt) return { eligibleAt: null, ready: true };
  const last = Date.parse(state.lastObservedAt);
  if (!Number.isFinite(last)) return { eligibleAt: null, ready: false };
  const eligibleMs = last + RENDER_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS;
  return {
    eligibleAt: new Date(eligibleMs).toISOString(),
    ready: nowMs >= eligibleMs,
  };
}

export async function inspectProductionRenderEgressCeremony(
  identity: WriteProvisioningIdentity,
): Promise<RenderEgressCeremonySnapshot | null> {
  const store = new SqliteRenderEgressProofStore();
  try {
    const runtime = renderRuntimeEvidenceFromEnvironment();
    const state = store.read(identity);
    const observerIpv4 = runtime ? await probeProductionRenderEgressIpv4() : null;
    const timing = secondObservationTiming(state, Date.now());
    return Object.freeze({
      region: RENDER_EGRESS_CEREMONY_REGION,
      runtime,
      observerIpv4,
      state,
      secondObservationEligibleAt: timing.eligibleAt,
      secondObservationReady: timing.ready,
      complete: state.status === "observed" && state.observationCount >= 2,
    });
  } catch {
    return null;
  } finally {
    store.close();
  }
}

export async function declareProductionRenderEgressCeremony(
  identity: WriteProvisioningIdentity,
  ownerProof: RenderEgressCeremonyOwnerProof,
): Promise<RenderEgressState | null> {
  const store = new SqliteRenderEgressProofStore();
  try {
    const runtime = renderRuntimeEvidenceFromEnvironment();
    if (!runtime) return null;
    const current = store.read(identity);
    if (current.status !== "unknown" || current.revision !== 0) return null;
    const observerIpv4 = await probeProductionRenderEgressIpv4();
    if (!observerIpv4) return null;
    return await declareRenderDedicatedEgress(store, {
      ...identity,
      expectedRevision: 0,
      renderServiceId: runtime.serviceId,
      renderRegion: RENDER_EGRESS_CEREMONY_REGION,
      dedicatedIpv4s: Object.freeze([observerIpv4]),
      renderAttestation: RENDER_DEDICATED_EGRESS_ATTESTATION,
      ownerProof,
    });
  } catch {
    return null;
  } finally {
    store.close();
  }
}

export async function observeProductionRenderEgressCeremony(
  identity: WriteProvisioningIdentity,
  ownerProof: RenderEgressCeremonyOwnerProof,
): Promise<RenderEgressState | null> {
  const store = new SqliteRenderEgressProofStore();
  try {
    const runtime = renderRuntimeEvidenceFromEnvironment();
    if (!runtime) return null;
    const current = store.read(identity);
    if (
      (current.status !== "declared" && current.status !== "observed")
      || current.revision < 1
      || current.observationCount >= 2
      || current.renderServiceId !== runtime.serviceId
      || current.dedicatedIpv4s.length !== 1
    ) return null;
    const observerIpv4 = await probeProductionRenderEgressIpv4();
    if (!observerIpv4 || current.dedicatedIpv4s[0] !== observerIpv4) return null;
    const now = new Date();
    const timing = secondObservationTiming(current, now.getTime());
    if (!timing.ready) return null;
    return await observeRenderDedicatedEgress(
      store,
      { ...identity, expectedRevision: current.revision, ownerProof },
      runtime,
      observerIpv4,
      now,
    );
  } catch {
    return null;
  } finally {
    store.close();
  }
}

/**
 * The only application-facing bridge from write-key provisioning/activation into execution authority.
 * Raw credentials, transport and writer construction are intentionally absent.
 */
export class MexcWriteProvisioningAuthority {
  constructor(
    private readonly egressStore: SqliteRenderEgressProofStore,
    private readonly credentialAuthorityStore: ExecutionWriteCredentialAuthorityStore,
  ) {}

  inspectEgress(identity: WriteProvisioningIdentity): RenderEgressState {
    return this.egressStore.read(identity);
  }

  inspectCredentialAuthority(identity: WriteProvisioningIdentity): WriteCredentialAuthorityState {
    return this.credentialAuthorityStore.read(identity);
  }

  async attestCurrentEgressAllowlist(
    identity: WriteProvisioningIdentity,
    ownerProof: RenderEgressCeremonyOwnerProof,
    now: Date,
  ): Promise<RenderEgressState | null> {
    if (!Number.isFinite(now.getTime())) return null;
    const state = this.egressStore.read(identity);
    if (
      state.status !== "observed"
      || state.revision < 1
      || state.observationCount < 2
      || !state.ipSetDigestSha256
      || !SHA256.test(state.ipSetDigestSha256)
    ) return null;
    const existing = this.credentialAuthorityStore.read(identity);
    if (existing.status !== "unknown" || existing.revision !== 0) return null;
    return attestMexcEgressAllowlisted(this.egressStore, {
      ...identity,
      expectedRevision: state.revision,
      ipSetDigestSha256: state.ipSetDigestSha256,
      mexcAllowlistAttestation: MEXC_WRITE_EGRESS_ATTESTATION,
      ownerProof,
    }, now);
  }

  currentEgressEvidence(identity: WriteProvisioningIdentity, now: Date): WriteProvisioningEgressEvidence | null {
    if (!Number.isFinite(now.getTime())) return null;
    const state = this.egressStore.read(identity);
    if (
      state.status !== "allowlisted"
      || state.mexcAllowlistAttestation !== MEXC_WRITE_EGRESS_ATTESTATION
      || !state.ipSetDigestSha256
      || !SHA256.test(state.ipSetDigestSha256)
      || !state.allowlistedAt
      || !state.lastObservedAt
    ) return null;
    const observedAt = Date.parse(state.lastObservedAt);
    const allowlistedAt = Date.parse(state.allowlistedAt);
    const nowMs = now.getTime();
    if (
      !Number.isFinite(observedAt)
      || !Number.isFinite(allowlistedAt)
      || observedAt > nowMs
      || allowlistedAt > nowMs
      || nowMs - observedAt > RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS
    ) return null;
    const existing = this.credentialAuthorityStore.read(identity);
    if (existing.status !== "unknown" || existing.revision !== 0) return null;
    return Object.freeze({
      revision: state.revision,
      ipSetDigestSha256: state.ipSetDigestSha256,
      allowlistedAt: state.allowlistedAt,
    });
  }

  async attestSealedCredential(
    identity: WriteProvisioningIdentity,
    credentialFingerprintSha256: string,
    permissionAttestation: typeof MEXC_WRITE_PERMISSION_ATTESTATION,
    ownerProof: WriteProvisioningOwnerProof,
    now: Date,
  ): Promise<WriteCredentialAuthorityState | null> {
    return attestWriteCredentialAuthority(this.credentialAuthorityStore, {
      ...identity,
      expectedRevision: 0,
      credentialFingerprintSha256,
      permissionAttestation,
      egressAttestation: MEXC_WRITE_EGRESS_ATTESTATION,
      ownerProof,
    }, now);
  }

  async activateAttestedCredential(
    identity: WriteProvisioningIdentity,
    expectedRevision: number,
    custody: WriteActivationCustodyEvidence,
    runtime: RenderRuntimeEvidence,
    observerIpv4: string,
    ownerProof: WriteProvisioningOwnerProof,
    now: Date,
  ): Promise<WriteCredentialAuthorityState | null> {
    if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return null;
    const authority = this.credentialAuthorityStore.read(identity);
    const egress = this.egressStore.read(identity);
    if (
      authority.status !== "attested"
      || authority.revision !== expectedRevision
      || !authority.credentialFingerprintSha256
      || !SHA256.test(authority.credentialFingerprintSha256)
      || authority.permissionAttestation !== MEXC_WRITE_PERMISSION_ATTESTATION
      || authority.egressAttestation !== MEXC_WRITE_EGRESS_ATTESTATION
      || custody.status !== "sealed"
      || custody.credentialFingerprintSha256 !== authority.credentialFingerprintSha256
      || egress.status !== "allowlisted"
      || egress.mexcAllowlistAttestation !== MEXC_WRITE_EGRESS_ATTESTATION
      || egress.renderServiceId !== runtime.serviceId
      || egress.dedicatedIpv4s.length !== 1
      || egress.dedicatedIpv4s[0] !== observerIpv4
      || !egress.ipSetDigestSha256
      || !egress.allowlistedAt
      || !egress.lastObservedAt
      || custody.egressProofRevision !== egress.revision
      || custody.egressIpSetDigestSha256 !== egress.ipSetDigestSha256
      || custody.egressAllowlistedAt !== egress.allowlistedAt
    ) return null;
    const observedAt = Date.parse(egress.lastObservedAt);
    const allowlistedAt = Date.parse(egress.allowlistedAt);
    const nowMs = now.getTime();
    if (
      !Number.isFinite(observedAt)
      || !Number.isFinite(allowlistedAt)
      || observedAt > nowMs
      || allowlistedAt > nowMs
      || nowMs - observedAt > RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS
    ) return null;
    return activateWriteCredentialAuthority(this.credentialAuthorityStore, {
      ...identity,
      expectedRevision,
      ownerProof,
    }, now);
  }

  async revokeAttestedCredential(
    identity: WriteProvisioningIdentity,
    expectedRevision: number,
    ownerProof: WriteProvisioningOwnerProof,
    now: Date,
  ): Promise<WriteCredentialAuthorityState | null> {
    return revokeWriteCredentialAuthority(this.credentialAuthorityStore, {
      ...identity,
      expectedRevision,
      ownerProof,
    }, now);
  }
}

export type ProductionMexcWriteProvisioningAuthorityHandle = Readonly<{
  authority: MexcWriteProvisioningAuthority;
  close: () => void;
}>;

export function openProductionMexcWriteProvisioningAuthority(): ProductionMexcWriteProvisioningAuthorityHandle {
  const egressStore = new SqliteRenderEgressProofStore();
  const credentialAuthorityStore = new SqliteExecutionWriteCredentialAuthorityStore();
  return Object.freeze({
    authority: new MexcWriteProvisioningAuthority(egressStore, credentialAuthorityStore),
    close: () => {
      try {
        egressStore.close();
      } finally {
        credentialAuthorityStore.close();
      }
    },
  });
}
