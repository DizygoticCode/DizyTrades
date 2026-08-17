import "server-only";

import { databaseSession, verifyAccountPassword, verifyFreshTotp } from "../../auth-db";
import {
  createProductionExecutionWriteCredentialAuthorityStore,
  MEXC_WRITE_EGRESS_ATTESTATION,
  MEXC_WRITE_PERMISSION_ATTESTATION,
  type ExecutionWriteCredentialAuthorityStore,
  type WriteCredentialAuthorityIdentity,
  type WriteCredentialAuthorityState,
} from "./write-credential-authority-store";

const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SESSION = /^[A-Za-z0-9_-]{43}$/;

export type OwnerWriteCredentialAuthorityProof = Readonly<{
  sessionToken: string;
  currentPassword: string;
  totp: string;
}>;

type BaseMutationRequest = Readonly<{
  userId: string;
  accountId: string;
  writeCredentialGeneration: string;
  expectedRevision: number;
  ownerProof: OwnerWriteCredentialAuthorityProof;
}>;

export type AttestWriteCredentialAuthorityRequest = BaseMutationRequest & Readonly<{
  credentialFingerprintSha256: string;
  permissionAttestation: typeof MEXC_WRITE_PERMISSION_ATTESTATION;
  egressAttestation: typeof MEXC_WRITE_EGRESS_ATTESTATION;
}>;
export type TransitionWriteCredentialAuthorityRequest = BaseMutationRequest;

const validBase = (request: BaseMutationRequest) =>
  ID.test(request.userId)
  && ID.test(request.accountId)
  && ID.test(request.writeCredentialGeneration)
  && Number.isSafeInteger(request.expectedRevision)
  && request.expectedRevision >= 0;

async function verifyOwnerMutationProof(
  targetUserId: string,
  proof: OwnerWriteCredentialAuthorityProof,
  now: Date,
) {
  if (
    !ID.test(targetUserId)
    || !SESSION.test(proof.sessionToken)
    || proof.currentPassword.length < 1
    || proof.currentPassword.length > 128
    || !/^\d{6}$/.test(proof.totp)
    || !Number.isFinite(now.getTime())
  ) return false;

  const beforePassword = databaseSession(proof.sessionToken);
  if (!beforePassword || beforePassword.id !== targetUserId || beforePassword.role !== "owner") return false;
  if (!await verifyAccountPassword(beforePassword.id, proof.currentPassword)) return false;

  // Password verification is intentionally async. Re-read the database session after it
  // completes so a session revoked during scrypt cannot authorize the TOTP ceremony.
  const beforeTotp = databaseSession(proof.sessionToken);
  if (!beforeTotp || beforeTotp.id !== targetUserId || beforeTotp.role !== "owner") return false;
  if (!verifyFreshTotp(beforeTotp.id, proof.totp, now.getTime())) return false;

  // The one-time TOTP is consumed before this final check. If the owner session disappears
  // during the ceremony the mutation fails closed and the proof cannot be replayed.
  const finalSession = databaseSession(proof.sessionToken);
  return Boolean(finalSession && finalSession.id === targetUserId && finalSession.role === "owner");
}

const identity = (request: BaseMutationRequest): WriteCredentialAuthorityIdentity => Object.freeze({
  userId: request.userId,
  accountId: request.accountId,
  writeCredentialGeneration: request.writeCredentialGeneration,
});

/**
 * Records only a precomputed SHA-256 credential fingerprint and explicit external
 * permission/egress attestations. Raw MEXC credentials are neither accepted nor read.
 */
export async function attestWriteCredentialAuthority(
  store: ExecutionWriteCredentialAuthorityStore,
  request: AttestWriteCredentialAuthorityRequest,
  now = new Date(),
): Promise<WriteCredentialAuthorityState | null> {
  if (
    !validBase(request)
    || request.expectedRevision !== 0
    || !SHA256.test(request.credentialFingerprintSha256)
    || request.permissionAttestation !== MEXC_WRITE_PERMISSION_ATTESTATION
    || request.egressAttestation !== MEXC_WRITE_EGRESS_ATTESTATION
    || !await verifyOwnerMutationProof(request.userId, request.ownerProof, now)
  ) return null;
  return store.attest(
    identity(request),
    request.credentialFingerprintSha256,
    request.permissionAttestation,
    request.egressAttestation,
    now.toISOString(),
    request.expectedRevision,
  );
}

export async function activateWriteCredentialAuthority(
  store: ExecutionWriteCredentialAuthorityStore,
  request: TransitionWriteCredentialAuthorityRequest,
  now = new Date(),
): Promise<WriteCredentialAuthorityState | null> {
  if (
    !validBase(request)
    || request.expectedRevision < 1
    || !await verifyOwnerMutationProof(request.userId, request.ownerProof, now)
  ) return null;
  return store.activate(identity(request), now.toISOString(), request.expectedRevision);
}

export async function revokeWriteCredentialAuthority(
  store: ExecutionWriteCredentialAuthorityStore,
  request: TransitionWriteCredentialAuthorityRequest,
  now = new Date(),
): Promise<WriteCredentialAuthorityState | null> {
  if (
    !validBase(request)
    || request.expectedRevision < 1
    || !await verifyOwnerMutationProof(request.userId, request.ownerProof, now)
  ) return null;
  return store.revoke(identity(request), now.toISOString(), request.expectedRevision);
}

/** Server-only production mutation seams. No public route or writer composition imports these. */
export async function attestProductionWriteCredentialAuthority(
  request: AttestWriteCredentialAuthorityRequest,
  store: ExecutionWriteCredentialAuthorityStore = createProductionExecutionWriteCredentialAuthorityStore(),
  now = new Date(),
) {
  return attestWriteCredentialAuthority(store, request, now);
}

export async function activateProductionWriteCredentialAuthority(
  request: TransitionWriteCredentialAuthorityRequest,
  store: ExecutionWriteCredentialAuthorityStore = createProductionExecutionWriteCredentialAuthorityStore(),
  now = new Date(),
) {
  return activateWriteCredentialAuthority(store, request, now);
}

export async function revokeProductionWriteCredentialAuthority(
  request: TransitionWriteCredentialAuthorityRequest,
  store: ExecutionWriteCredentialAuthorityStore = createProductionExecutionWriteCredentialAuthorityStore(),
  now = new Date(),
) {
  return revokeWriteCredentialAuthority(store, request, now);
}
