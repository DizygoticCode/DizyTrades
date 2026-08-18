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
  type RenderEgressIdentity,
} from "./render-egress-proof-authority";
import {
  STATIC_HOST_EGRESS_ATTESTATION,
  STATIC_HOST_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS,
  STATIC_HOST_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS,
  SqliteStaticHostEgressProofStore,
  attestStaticHostMexcEgressAllowlisted,
  currentStaticHostMatches,
  declareStaticHostEgress,
  observeStaticHostEgress,
  probeProductionStaticHostEgressIpv4,
  staticHostRuntimeEvidenceFromEnvironment,
  type OwnerStaticHostEgressProof,
  type StaticHostEgressIdentity,
} from "./static-host-egress-proof-authority";
import { MEXC_WRITE_EGRESS_ATTESTATION } from "./write-credential-authority-store";

export type ExecutionHostProvider = "render" | "static";
export type ExecutionHostIdentity = Readonly<{ userId: string; accountId: string; writeCredentialGeneration: string }>;
export type ExecutionHostOwnerProof = OwnerRenderEgressProof & OwnerStaticHostEgressProof;
export type ExecutionHostRuntimeEvidence = Readonly<{
  provider: ExecutionHostProvider;
  hostId: string;
  gitCommit: string | null;
}>;
export type ExecutionHostEgressState = Readonly<{
  revision: number;
  status: "unknown" | "declared" | "observed" | "allowlisted" | "revoked";
  provider: ExecutionHostProvider;
  hostId: string | null;
  dedicatedIpv4s: readonly string[];
  ipSetDigestSha256: string | null;
  observationCount: number;
  firstObservedIp: string | null;
  firstObservedAt: string | null;
  lastObservedIp: string | null;
  lastObservedAt: string | null;
  mexcAllowlistAttestation: typeof MEXC_WRITE_EGRESS_ATTESTATION | null;
  allowlistedAt: string | null;
  revokedAt: string | null;
  updatedAt: string | null;
}>;
export type ExecutionHostEgressCeremonySnapshot = Readonly<{
  provider: ExecutionHostProvider;
  runtime: ExecutionHostRuntimeEvidence | null;
  observerIpv4: string | null;
  state: ExecutionHostEgressState;
  secondObservationEligibleAt: string | null;
  secondObservationReady: boolean;
  complete: boolean;
}>;

function configuredProvider(env: Readonly<Record<string, string | undefined>> = process.env): ExecutionHostProvider | null {
  const raw = env.EXECUTION_HOST_PROVIDER?.trim();
  if (!raw || raw === "render") return "render";
  return raw === "static" ? "static" : null;
}

function timing(lastObservedAt: string | null, minimumDelayMs: number, nowMs: number) {
  if (!lastObservedAt) return { eligibleAt: null, ready: true };
  const last = Date.parse(lastObservedAt);
  if (!Number.isFinite(last)) return { eligibleAt: null, ready: false };
  const eligibleMs = last + minimumDelayMs;
  return { eligibleAt: new Date(eligibleMs).toISOString(), ready: nowMs >= eligibleMs };
}

function normalizeRenderState(state: ReturnType<SqliteRenderEgressProofStore["read"]>): ExecutionHostEgressState {
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

function normalizeStaticState(state: ReturnType<SqliteStaticHostEgressProofStore["read"]>): ExecutionHostEgressState {
  return Object.freeze({ ...state, provider: "static" as const });
}

export class ProductionExecutionHostEgressAuthority {
  private readonly renderStore: SqliteRenderEgressProofStore | null;
  private readonly staticStore: SqliteStaticHostEgressProofStore | null;

  constructor(readonly provider: ExecutionHostProvider) {
    this.renderStore = provider === "render" ? new SqliteRenderEgressProofStore() : null;
    this.staticStore = provider === "static" ? new SqliteStaticHostEgressProofStore() : null;
  }

  read(identity: ExecutionHostIdentity): ExecutionHostEgressState {
    if (this.provider === "render") return normalizeRenderState(this.renderStore!.read(identity as RenderEgressIdentity));
    return normalizeStaticState(this.staticStore!.read(identity as StaticHostEgressIdentity));
  }

  runtime(env: Readonly<Record<string, string | undefined>> = process.env): ExecutionHostRuntimeEvidence | null {
    if (this.provider === "render") {
      const runtime = renderRuntimeEvidenceFromEnvironment(env);
      return runtime ? Object.freeze({ provider: "render" as const, hostId: runtime.serviceId, gitCommit: runtime.gitCommit }) : null;
    }
    const runtime = staticHostRuntimeEvidenceFromEnvironment(env);
    return runtime ? Object.freeze({ provider: "static" as const, hostId: runtime.hostId, gitCommit: null }) : null;
  }

  async probeIpv4() {
    return this.provider === "render" ? probeProductionRenderEgressIpv4() : probeProductionStaticHostEgressIpv4();
  }

  async declare(identity: ExecutionHostIdentity, ownerProof: ExecutionHostOwnerProof, now = new Date()) {
    const runtime = this.runtime();
    if (!runtime) return null;
    const state = this.read(identity);
    if (state.status !== "unknown" || state.revision !== 0) return null;
    const ipv4 = await this.probeIpv4();
    if (!ipv4) return null;
    if (this.provider === "render") {
      const renderRuntime = renderRuntimeEvidenceFromEnvironment();
      if (!renderRuntime) return null;
      return declareRenderDedicatedEgress(this.renderStore!, {
        ...identity,
        expectedRevision: 0,
        renderServiceId: renderRuntime.serviceId,
        renderRegion: "frankfurt",
        dedicatedIpv4s: Object.freeze([ipv4]),
        renderAttestation: RENDER_DEDICATED_EGRESS_ATTESTATION,
        ownerProof,
      }, now);
    }
    return declareStaticHostEgress(this.staticStore!, {
      ...identity,
      expectedRevision: 0,
      hostId: runtime.hostId,
      dedicatedIpv4: ipv4,
      staticHostAttestation: STATIC_HOST_EGRESS_ATTESTATION,
      ownerProof,
    }, now);
  }

  async observe(identity: ExecutionHostIdentity, ownerProof: ExecutionHostOwnerProof, now = new Date()) {
    const runtime = this.runtime();
    if (!runtime) return null;
    const state = this.read(identity);
    if ((state.status !== "declared" && state.status !== "observed") || state.revision < 1 || state.observationCount >= 2 || state.hostId !== runtime.hostId || state.dedicatedIpv4s.length !== 1) return null;
    const ipv4 = await this.probeIpv4();
    if (!ipv4 || state.dedicatedIpv4s[0] !== ipv4) return null;
    const minimumDelay = this.provider === "render" ? RENDER_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS : STATIC_HOST_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS;
    if (!timing(state.lastObservedAt, minimumDelay, now.getTime()).ready) return null;
    if (this.provider === "render") {
      const renderRuntime = renderRuntimeEvidenceFromEnvironment();
      if (!renderRuntime) return null;
      return observeRenderDedicatedEgress(this.renderStore!, { ...identity, expectedRevision: state.revision, ownerProof }, renderRuntime, ipv4, now);
    }
    const staticRuntime = staticHostRuntimeEvidenceFromEnvironment();
    if (!staticRuntime) return null;
    return observeStaticHostEgress(this.staticStore!, { ...identity, expectedRevision: state.revision, ownerProof }, staticRuntime, ipv4, now);
  }

  async attestMexcAllowlist(identity: ExecutionHostIdentity, ownerProof: ExecutionHostOwnerProof, now = new Date()) {
    const state = this.read(identity);
    if (state.status !== "observed" || state.revision < 1 || state.observationCount < 2 || !state.ipSetDigestSha256) return null;
    const request = { ...identity, expectedRevision: state.revision, ipSetDigestSha256: state.ipSetDigestSha256, mexcAllowlistAttestation: MEXC_WRITE_EGRESS_ATTESTATION, ownerProof } as const;
    return this.provider === "render"
      ? attestMexcEgressAllowlisted(this.renderStore!, request, now)
      : attestStaticHostMexcEgressAllowlisted(this.staticStore!, request, now);
  }

  currentEvidence(identity: ExecutionHostIdentity, now: Date) {
    if (!Number.isFinite(now.getTime())) return null;
    const state = this.read(identity);
    if (state.status !== "allowlisted" || state.mexcAllowlistAttestation !== MEXC_WRITE_EGRESS_ATTESTATION || !state.ipSetDigestSha256 || !state.allowlistedAt || !state.lastObservedAt) return null;
    const observedAt = Date.parse(state.lastObservedAt);
    const allowlistedAt = Date.parse(state.allowlistedAt);
    const maxAge = this.provider === "render" ? RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS : STATIC_HOST_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS;
    const nowMs = now.getTime();
    if (!Number.isFinite(observedAt) || !Number.isFinite(allowlistedAt) || observedAt > nowMs || allowlistedAt > nowMs || nowMs - observedAt > maxAge) return null;
    return Object.freeze({ revision: state.revision, ipSetDigestSha256: state.ipSetDigestSha256, allowlistedAt: state.allowlistedAt });
  }

  currentHostMatches(identity: ExecutionHostIdentity, runtime: ExecutionHostRuntimeEvidence, observedIpv4: string, now: Date) {
    const state = this.read(identity);
    if (runtime.provider !== this.provider || state.provider !== this.provider || state.hostId !== runtime.hostId) return false;
    if (this.provider === "static") {
      const staticRuntime = staticHostRuntimeEvidenceFromEnvironment();
      return Boolean(staticRuntime && currentStaticHostMatches(state as ReturnType<SqliteStaticHostEgressProofStore["read"]>, staticRuntime, observedIpv4, now));
    }
    if (state.status !== "allowlisted" || state.mexcAllowlistAttestation !== MEXC_WRITE_EGRESS_ATTESTATION || state.dedicatedIpv4s.length !== 1 || state.dedicatedIpv4s[0] !== observedIpv4 || !state.lastObservedAt || !state.allowlistedAt) return false;
    const observedAt = Date.parse(state.lastObservedAt);
    const allowlistedAt = Date.parse(state.allowlistedAt);
    const nowMs = now.getTime();
    return Number.isFinite(observedAt) && Number.isFinite(allowlistedAt) && observedAt <= nowMs && allowlistedAt <= nowMs && nowMs - observedAt <= RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS;
  }

  close() {
    this.renderStore?.close();
    this.staticStore?.close();
  }
}

export function openProductionExecutionHostEgressAuthority(env: Readonly<Record<string, string | undefined>> = process.env) {
  const provider = configuredProvider(env);
  return provider ? new ProductionExecutionHostEgressAuthority(provider) : null;
}

export async function inspectProductionExecutionHostEgressCeremony(identity: ExecutionHostIdentity): Promise<ExecutionHostEgressCeremonySnapshot | null> {
  const authority = openProductionExecutionHostEgressAuthority();
  if (!authority) return null;
  try {
    const runtime = authority.runtime();
    const state = authority.read(identity);
    const observerIpv4 = runtime ? await authority.probeIpv4() : null;
    const minimumDelay = authority.provider === "render" ? RENDER_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS : STATIC_HOST_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS;
    const second = timing(state.lastObservedAt, minimumDelay, Date.now());
    return Object.freeze({ provider: authority.provider, runtime, observerIpv4, state, secondObservationEligibleAt: second.eligibleAt, secondObservationReady: second.ready, complete: state.status === "observed" && state.observationCount >= 2 });
  } catch {
    return null;
  } finally {
    authority.close();
  }
}
