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
  ProductionExecutionHostEgressAuthority,
  inspectProductionExecutionHostEgressCeremony,
  openProductionExecutionHostEgressAuthority,
  type ExecutionHostEgressCeremonySnapshot,
  type ExecutionHostEgressState,
  type ExecutionHostOwnerProof,
  type ExecutionHostRuntimeEvidence,
} from "./internal/execution-host-egress-authority";
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
export { inspectProductionExecutionHostEgressCeremony };
export type { ExecutionHostEgressCeremonySnapshot, ExecutionHostRuntimeEvidence };

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
export type ExecutionHostCeremonyOwnerProof = ExecutionHostOwnerProof;
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

type CompatibleExecutionHostRuntimeEvidence = ExecutionHostRuntimeEvidence | RenderRuntimeEvidence;

function secondObservationTiming(state: RenderEgressState, nowMs: number) {
  if (!state.lastObservedAt) return { eligibleAt: null, ready: true };
  const last = Date.parse(state.lastObservedAt);
  if (!Number.isFinite(last)) return { eligibleAt: null, ready: false };
  const eligibleMs = last + RENDER_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS;
  return { eligibleAt: new Date(eligibleMs).toISOString(), ready: nowMs >= eligibleMs };
}

function normalizeRenderEgressState(state: RenderEgressState): ExecutionHostEgressState {
  return Object.freeze({
    revision: state.revision,
    status: state.status,
    provider: "render" as const,
    hostId: state.renderServiceId,
    dedicatedIpv4s: state.dedicatedIpv4s,
    ipSetDigestSha256: state.ipSetDigestSha256,
    observationCount: state.observationCount,
    firstObservedIp: state.firstObservedIp,
    firstObservedAt: state.firstObservedAt,
    lastObservedIp: state.lastObservedIp,
    lastObservedAt: state.lastObservedAt,
    mexcAllowlistAttestation: state.mexcAllowlistAttestation,
    allowlistedAt: state.allowlistedAt,
    revokedAt: state.revokedAt,
    updatedAt: state.updatedAt,
  });
}

/** Legacy Render-specific inspection retained for the existing Render egress page. */
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

/** Legacy Render-specific mutation retained for the existing Render egress page. */
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

/** Legacy Render-specific mutation retained for the existing Render egress page. */
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

export async function declareProductionExecutionHostEgressCeremony(
  identity: WriteProvisioningIdentity,
  ownerProof: ExecutionHostCeremonyOwnerProof,
): Promise<ExecutionHostEgressState | null> {
  const authority = openProductionExecutionHostEgressAuthority();
  if (!authority) return null;
  try {
    const result = await authority.declare(identity, ownerProof, new Date());
    return result ? authority.read(identity) : null;
  } catch {
    return null;
  } finally {
    authority.close();
  }
}

export async function observeProductionExecutionHostEgressCeremony(
  identity: WriteProvisioningIdentity,
  ownerProof: ExecutionHostCeremonyOwnerProof,
): Promise<ExecutionHostEgressState | null> {
  const authority = openProductionExecutionHostEgressAuthority();
  if (!authority) return null;
  try {
    const result = await authority.observe(identity, ownerProof, new Date());
    return result ? authority.read(identity) : null;
  } catch {
    return null;
  } finally {
    authority.close();
  }
}

/**
 * Application-facing bridge from write-key provisioning/activation into execution authority.
 * The production path is provider-neutral. Direct Render-store injection is retained only as
 * a compatibility boundary for the established Render proof regressions.
 */
export class MexcWriteProvisioningAuthority {
  private readonly executionHostAuthority: ProductionExecutionHostEgressAuthority | null;
  private readonly legacyRenderEgressStore: SqliteRenderEgressProofStore | null;

  constructor(
    egressAuthority: ProductionExecutionHostEgressAuthority | SqliteRenderEgressProofStore,
    private readonly credentialAuthorityStore: ExecutionWriteCredentialAuthorityStore,
  ) {
    if (egressAuthority instanceof SqliteRenderEgressProofStore) {
      this.executionHostAuthority = null;
      this.legacyRenderEgressStore = egressAuthority;
    } else {
      this.executionHostAuthority = egressAuthority;
      this.legacyRenderEgressStore = null;
    }
  }

  private readEgress(identity: WriteProvisioningIdentity): ExecutionHostEgressState {
    if (this.executionHostAuthority) return this.executionHostAuthority.read(identity);
    return normalizeRenderEgressState(this.legacyRenderEgressStore!.read(identity));
  }

  private async attestEgressAllowlist(
    identity: WriteProvisioningIdentity,
    ownerProof: ExecutionHostCeremonyOwnerProof,
    state: ExecutionHostEgressState,
    now: Date,
  ) {
    if (this.executionHostAuthority) return this.executionHostAuthority.attestMexcAllowlist(identity, ownerProof, now);
    return attestMexcEgressAllowlisted(this.legacyRenderEgressStore!, {
      ...identity,
      expectedRevision: state.revision,
      ipSetDigestSha256: state.ipSetDigestSha256!,
      mexcAllowlistAttestation: MEXC_WRITE_EGRESS_ATTESTATION,
      ownerProof,
    }, now);
  }

  private currentHostMatches(
    identity: WriteProvisioningIdentity,
    runtime: CompatibleExecutionHostRuntimeEvidence,
    observerIpv4: string,
    now: Date,
  ) {
    if (this.executionHostAuthority) {
      if (!("provider" in runtime)) return false;
      return this.executionHostAuthority.currentHostMatches(identity, runtime, observerIpv4, now);
    }
    const state = this.legacyRenderEgressStore!.read(identity);
    const runtimeServiceId = "provider" in runtime
      ? runtime.provider === "render" ? runtime.hostId : null
      : runtime.serviceId;
    if (!runtimeServiceId || state.renderServiceId !== runtimeServiceId) return false;
    if (
      state.status !== "allowlisted"
      || state.mexcAllowlistAttestation !== MEXC_WRITE_EGRESS_ATTESTATION
      || state.dedicatedIpv4s.length !== 1
      || state.dedicatedIpv4s[0] !== observerIpv4
      || !state.lastObservedAt
      || !state.allowlistedAt
    ) return false;
    const observedAt = Date.parse(state.lastObservedAt);
    const allowlistedAt = Date.parse(state.allowlistedAt);
    const nowMs = now.getTime();
    return Number.isFinite(observedAt)
      && Number.isFinite(allowlistedAt)
      && observedAt <= nowMs
      && allowlistedAt <= nowMs
      && nowMs - observedAt <= RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS;
  }

  inspectEgress(identity: WriteProvisioningIdentity): ExecutionHostEgressState {
    return this.readEgress(identity);
  }

  inspectCredentialAuthority(identity: WriteProvisioningIdentity): WriteCredentialAuthorityState {
    return this.credentialAuthorityStore.read(identity);
  }

  async attestCurrentEgressAllowlist(
    identity: WriteProvisioningIdentity,
    ownerProof: ExecutionHostCeremonyOwnerProof,
    now: Date,
  ): Promise<ExecutionHostEgressState | null> {
    if (!Number.isFinite(now.getTime())) return null;
    const state = this.readEgress(identity);
    if (
      state.status !== "observed"
      || state.revision < 1
      || state.observationCount < 2
      || !state.ipSetDigestSha256
      || !SHA256.test(state.ipSetDigestSha256)
    ) return null;
    const existing = this.credentialAuthorityStore.read(identity);
    if (existing.status !== "unknown" || existing.revision !== 0) return null;
    const result = await this.attestEgressAllowlist(identity, ownerProof, state, now);
    return result ? this.readEgress(identity) : null;
  }

  currentEgressEvidence(identity: WriteProvisioningIdentity, now: Date): WriteProvisioningEgressEvidence | null {
    if (!Number.isFinite(now.getTime())) return null;
    const existing = this.credentialAuthorityStore.read(identity);
    if (existing.status !== "unknown" || existing.revision !== 0) return null;
    if (this.executionHostAuthority) return this.executionHostAuthority.currentEvidence(identity, now);
    const state = this.readEgress(identity);
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
    runtime: CompatibleExecutionHostRuntimeEvidence,
    observerIpv4: string,
    ownerProof: WriteProvisioningOwnerProof,
    now: Date,
  ): Promise<WriteCredentialAuthorityState | null> {
    if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return null;
    const authority = this.credentialAuthorityStore.read(identity);
    const egress = this.readEgress(identity);
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
      || !egress.ipSetDigestSha256
      || !SHA256.test(egress.ipSetDigestSha256)
      || !egress.allowlistedAt
      || custody.egressProofRevision !== egress.revision
      || custody.egressIpSetDigestSha256 !== egress.ipSetDigestSha256
      || custody.egressAllowlistedAt !== egress.allowlistedAt
      || !this.currentHostMatches(identity, runtime, observerIpv4, now)
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
  const egressAuthority = openProductionExecutionHostEgressAuthority();
  if (!egressAuthority) throw new Error("EXECUTION_HOST_EGRESS_AUTHORITY_UNAVAILABLE");
  const credentialAuthorityStore = new SqliteExecutionWriteCredentialAuthorityStore();
  return Object.freeze({
    authority: new MexcWriteProvisioningAuthority(egressAuthority, credentialAuthorityStore),
    close: () => {
      try {
        egressAuthority.close();
      } finally {
        credentialAuthorityStore.close();
      }
    },
  });
}