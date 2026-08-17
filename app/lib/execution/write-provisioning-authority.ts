import "server-only";

import {
  RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS,
  type SqliteRenderEgressProofStore,
} from "./internal/render-egress-proof-authority";
import {
  attestWriteCredentialAuthority,
  revokeWriteCredentialAuthority,
  type OwnerWriteCredentialAuthorityProof,
} from "./internal/write-credential-attestation-authority";
import {
  MEXC_WRITE_EGRESS_ATTESTATION,
  MEXC_WRITE_PERMISSION_ATTESTATION,
  type ExecutionWriteCredentialAuthorityStore,
  type WriteCredentialAuthorityState,
} from "./internal/write-credential-authority-store";

export { MEXC_WRITE_PERMISSION_ATTESTATION };

const SHA256 = /^[a-f0-9]{64}$/;

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

export type WriteProvisioningOwnerProof = OwnerWriteCredentialAuthorityProof;

/**
 * The only application-facing bridge from write-key provisioning into execution authority.
 * It accepts identity, bounded evidence, a precomputed fingerprint and owner proof only.
 * Raw credentials, custody, transport, writer construction and activation are intentionally absent.
 */
export class MexcWriteProvisioningAuthority {
  constructor(
    private readonly egressStore: SqliteRenderEgressProofStore,
    private readonly credentialAuthorityStore: ExecutionWriteCredentialAuthorityStore,
  ) {}

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
