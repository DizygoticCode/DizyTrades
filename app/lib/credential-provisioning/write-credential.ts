import "server-only";

import { databaseSession, verifyAccountPassword, verifyFreshTotp } from "../auth-db";
import {
  SqliteMexcWriteCredentialCustody,
  type MexcWriteCredentialCustodyReceipt,
  type MexcWriteCredentialIdentity,
  type MexcWriteCredentialSecret,
} from "../credential-custody/write-credential";
import {
  RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS,
  type SqliteRenderEgressProofStore,
} from "../execution/internal/render-egress-proof-authority";
import { MEXC_WRITE_EGRESS_ATTESTATION } from "../execution/internal/write-credential-authority-store";

const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const SESSION = /^[A-Za-z0-9_-]{43}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type OwnerMexcWriteCredentialProvisioningProof = Readonly<{
  sessionToken: string;
  currentPassword: string;
  totp: string;
}>;
export type ProvisionMexcWriteCredentialRequest = MexcWriteCredentialIdentity & Readonly<{
  expectedRevision: 0;
  credentials: MexcWriteCredentialSecret;
  ownerProof: OwnerMexcWriteCredentialProvisioningProof;
}>;
export type RevokeMexcWriteCredentialRequest = MexcWriteCredentialIdentity & Readonly<{
  expectedRevision: number;
  ownerProof: OwnerMexcWriteCredentialProvisioningProof;
}>;

const validIdentity = (value: MexcWriteCredentialIdentity) => ID.test(value.userId) && ID.test(value.accountId) && ID.test(value.writeCredentialGeneration);
const identity = (request: MexcWriteCredentialIdentity): MexcWriteCredentialIdentity => Object.freeze({
  userId: request.userId, accountId: request.accountId, writeCredentialGeneration: request.writeCredentialGeneration,
});

async function verifyOwnerMutationProof(targetUserId: string, proof: OwnerMexcWriteCredentialProvisioningProof, now: Date) {
  if (!ID.test(targetUserId) || !SESSION.test(proof.sessionToken) || proof.currentPassword.length < 1 || proof.currentPassword.length > 128 ||
      !/^\d{6}$/.test(proof.totp) || !Number.isFinite(now.getTime())) return false;
  const beforePassword = databaseSession(proof.sessionToken);
  if (!beforePassword || beforePassword.id !== targetUserId || beforePassword.role !== "owner") return false;
  if (!await verifyAccountPassword(beforePassword.id, proof.currentPassword)) return false;
  const beforeTotp = databaseSession(proof.sessionToken);
  if (!beforeTotp || beforeTotp.id !== targetUserId || beforeTotp.role !== "owner") return false;
  if (!verifyFreshTotp(beforeTotp.id, proof.totp, now.getTime())) return false;
  const finalSession = databaseSession(proof.sessionToken);
  return Boolean(finalSession && finalSession.id === targetUserId && finalSession.role === "owner");
}

function liveAllowlistedEvidence(egressStore: SqliteRenderEgressProofStore, id: MexcWriteCredentialIdentity, now: Date) {
  const state = egressStore.read(id);
  if (state.status !== "allowlisted" || state.mexcAllowlistAttestation !== MEXC_WRITE_EGRESS_ATTESTATION ||
      !state.ipSetDigestSha256 || !SHA256.test(state.ipSetDigestSha256) || !state.allowlistedAt || !state.lastObservedAt) return null;
  const observedAt = Date.parse(state.lastObservedAt), allowlistedAt = Date.parse(state.allowlistedAt), nowMs = now.getTime();
  if (!Number.isFinite(observedAt) || !Number.isFinite(allowlistedAt) || observedAt > nowMs || allowlistedAt > nowMs ||
      nowMs - observedAt > RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS) return null;
  return Object.freeze({ revision: state.revision, ipSetDigestSha256: state.ipSetDigestSha256, allowlistedAt: state.allowlistedAt });
}

/**
 * Seals a new write credential only after the exact write generation has a current #330
 * MEXC egress allowlist proof and the owner completes a fresh password+TOTP ceremony.
 * The returned receipt is bounded and contains only non-secret metadata/fingerprints.
 * This function does not call #329: attestation remains a separate fresh-TOTP authority ceremony.
 */
export async function provisionMexcWriteCredential(
  custody: SqliteMexcWriteCredentialCustody,
  egressStore: SqliteRenderEgressProofStore,
  request: ProvisionMexcWriteCredentialRequest,
  now = new Date(),
): Promise<MexcWriteCredentialCustodyReceipt | null> {
  const id = identity(request);
  if (!validIdentity(id) || request.expectedRevision !== 0 || !Number.isFinite(now.getTime())) return null;
  const evidence = liveAllowlistedEvidence(egressStore, id, now); if (!evidence) return null;
  if (!await verifyOwnerMutationProof(request.userId, request.ownerProof, now)) return null;
  return custody.seal(id, request.credentials, evidence, now.toISOString(), request.expectedRevision);
}

/** Emergency custody revocation deliberately does not depend on egress remaining healthy. */
export async function revokeProvisionedMexcWriteCredential(
  custody: SqliteMexcWriteCredentialCustody,
  request: RevokeMexcWriteCredentialRequest,
  now = new Date(),
): Promise<MexcWriteCredentialCustodyReceipt | null> {
  const id = identity(request);
  if (!validIdentity(id) || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1 || !Number.isFinite(now.getTime())) return null;
  if (!await verifyOwnerMutationProof(request.userId, request.ownerProof, now)) return null;
  return custody.revoke(id, now.toISOString(), request.expectedRevision);
}
