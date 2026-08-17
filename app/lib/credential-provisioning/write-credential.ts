import "server-only";

import { databaseSession, verifyAccountPassword } from "../auth-db";
import {
  SqliteMexcWriteCredentialCustody,
  type MexcWriteCredentialCustodyReceipt,
  type MexcWriteCredentialIdentity,
  type MexcWriteCredentialSecret,
} from "../credential-custody/write-credential";
import {
  MEXC_WRITE_PERMISSION_ATTESTATION,
  MexcWriteProvisioningAuthority,
  type WriteProvisioningOwnerProof,
} from "../execution/write-provisioning-authority";

const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const SESSION = /^[A-Za-z0-9_-]{43}$/;

export type OwnerMexcWriteCredentialProvisioningProof = WriteProvisioningOwnerProof;
export type ProvisionMexcWriteCredentialRequest = MexcWriteCredentialIdentity & Readonly<{
  expectedRevision: 0;
  credentials: MexcWriteCredentialSecret;
  permissionAttestation: typeof MEXC_WRITE_PERMISSION_ATTESTATION;
  ownerProof: OwnerMexcWriteCredentialProvisioningProof;
}>;
export type RevokeMexcWriteCredentialRequest = MexcWriteCredentialIdentity & Readonly<{
  expectedCustodyRevision: number;
  expectedAuthorityRevision: number;
  ownerProof: OwnerMexcWriteCredentialProvisioningProof;
}>;

const validIdentity = (value: MexcWriteCredentialIdentity) => ID.test(value.userId) && ID.test(value.accountId) && ID.test(value.writeCredentialGeneration);
const identity = (request: MexcWriteCredentialIdentity): MexcWriteCredentialIdentity => Object.freeze({
  userId: request.userId, accountId: request.accountId, writeCredentialGeneration: request.writeCredentialGeneration,
});

/** Password/session preflight only. The TOTP is syntax-checked here but consumed exactly once by #329 after custody is sealed. */
async function verifyOwnerPreflight(targetUserId: string, proof: OwnerMexcWriteCredentialProvisioningProof) {
  if (!ID.test(targetUserId) || !SESSION.test(proof.sessionToken) || proof.currentPassword.length < 1 || proof.currentPassword.length > 128 || !/^\d{6}$/.test(proof.totp)) return false;
  const beforePassword = databaseSession(proof.sessionToken);
  if (!beforePassword || beforePassword.id !== targetUserId || beforePassword.role !== "owner") return false;
  if (!await verifyAccountPassword(beforePassword.id, proof.currentPassword)) return false;
  const afterPassword = databaseSession(proof.sessionToken);
  return Boolean(afterPassword && afterPassword.id === targetUserId && afterPassword.role === "owner");
}

export async function provisionMexcWriteCredential(
  custody: SqliteMexcWriteCredentialCustody,
  authority: MexcWriteProvisioningAuthority,
  request: ProvisionMexcWriteCredentialRequest,
  now = new Date(),
): Promise<MexcWriteCredentialCustodyReceipt | null> {
  const id = identity(request);
  if (!validIdentity(id) || request.expectedRevision !== 0 || request.permissionAttestation !== MEXC_WRITE_PERMISSION_ATTESTATION || !Number.isFinite(now.getTime())) return null;
  const evidence = authority.currentEgressEvidence(id, now); if (!evidence) return null;
  if (!await verifyOwnerPreflight(request.userId, request.ownerProof)) return null;
  const sealed = custody.seal(id, request.credentials, evidence, now.toISOString(), 0);
  const attested = await authority.attestSealedCredential(id, sealed.credentialFingerprintSha256, request.permissionAttestation, request.ownerProof, now);
  if (!attested || attested.status !== "attested" || attested.revision !== 1 || attested.credentialFingerprintSha256 !== sealed.credentialFingerprintSha256) {
    custody.discardFailedAttestation(id, now.toISOString(), 1);
    return null;
  }
  return sealed;
}

/** Revokes #329 first. If custody then becomes unavailable, execution authority is already fail-closed. */
export async function revokeProvisionedMexcWriteCredential(
  custody: SqliteMexcWriteCredentialCustody,
  authority: MexcWriteProvisioningAuthority,
  request: RevokeMexcWriteCredentialRequest,
  now = new Date(),
): Promise<MexcWriteCredentialCustodyReceipt | null> {
  const id = identity(request);
  if (!validIdentity(id) || !Number.isSafeInteger(request.expectedCustodyRevision) || request.expectedCustodyRevision < 1 ||
      !Number.isSafeInteger(request.expectedAuthorityRevision) || request.expectedAuthorityRevision < 1 || !Number.isFinite(now.getTime())) return null;
  const revokedAuthority = await authority.revokeAttestedCredential(id, request.expectedAuthorityRevision, request.ownerProof, now);
  if (!revokedAuthority || revokedAuthority.status !== "revoked") return null;
  return custody.revoke(id, now.toISOString(), request.expectedCustodyRevision);
}
