import "server-only";

import { SqliteMexcWriteCredentialCustody } from "./credential-custody/write-credential";
import { provisionMexcWriteCredential } from "./credential-provisioning/write-credential";
import {
  MEXC_WRITE_PERMISSION_ATTESTATION,
  declareProductionExecutionHostEgressCeremony,
  inspectProductionExecutionHostEgressCeremony,
  observeProductionExecutionHostEgressCeremony,
  openProductionMexcWriteProvisioningAuthority,
  type ExecutionHostCeremonyOwnerProof,
  type ExecutionHostEgressCeremonySnapshot,
  type WriteProvisioningIdentity,
  type WriteProvisioningOwnerProof,
} from "./execution/write-provisioning-authority";

export const MEXC_WRITE_PROVISIONING_ACCOUNT_ID_ENV = "MEXC_WRITE_PROVISIONING_ACCOUNT_ID" as const;
export const MEXC_WRITE_PROVISIONING_GENERATION_ENV = "MEXC_WRITE_PROVISIONING_GENERATION" as const;

const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const OWNER_USER_ID = "rob" as const;

export type ProductionWriteCredentialCeremonyIdentity = WriteProvisioningIdentity & Readonly<{ userId: typeof OWNER_USER_ID }>;
export type ProductionWriteCredentialCeremonySnapshot = Readonly<{
  identity: ProductionWriteCredentialCeremonyIdentity;
  egress: ExecutionHostEgressCeremonySnapshot | null;
  credentialAuthority: Readonly<{
    revision: number;
    status: "unknown" | "attested" | "active" | "revoked";
    credentialFingerprintSha256: string | null;
    attestedAt: string | null;
    activatedAt: string | null;
    revokedAt: string | null;
  }> | null;
  custody: Readonly<{
    revision: number;
    status: "sealed" | "revoked";
    credentialFingerprintSha256: string;
    egressProofRevision: number;
    egressIpSetDigestSha256: string;
    egressAllowlistedAt: string;
    createdAt: string;
    updatedAt: string;
    revokedAt: string | null;
  }> | null;
  custodyAvailable: boolean;
}>;

export function productionWriteCredentialCeremonyIdentity(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProductionWriteCredentialCeremonyIdentity | null {
  const accountId = env[MEXC_WRITE_PROVISIONING_ACCOUNT_ID_ENV]?.trim() || "";
  const writeCredentialGeneration = env[MEXC_WRITE_PROVISIONING_GENERATION_ENV]?.trim() || "";
  if (!ID.test(accountId) || !ID.test(writeCredentialGeneration)) return null;
  return Object.freeze({ userId: OWNER_USER_ID, accountId, writeCredentialGeneration });
}

export async function inspectProductionWriteCredentialCeremony(): Promise<ProductionWriteCredentialCeremonySnapshot | null> {
  const identity = productionWriteCredentialCeremonyIdentity();
  if (!identity) return null;
  const egress = await inspectProductionExecutionHostEgressCeremony(identity);
  let handle: ReturnType<typeof openProductionMexcWriteProvisioningAuthority> | null = null;
  const custody = new SqliteMexcWriteCredentialCustody();
  let credentialAuthority: ProductionWriteCredentialCeremonySnapshot["credentialAuthority"] = null;
  let custodyReceipt: ProductionWriteCredentialCeremonySnapshot["custody"] = null;
  let custodyAvailable = true;
  try {
    handle = openProductionMexcWriteProvisioningAuthority();
    const state = handle.authority.inspectCredentialAuthority(identity);
    credentialAuthority = Object.freeze({
      revision: state.revision,
      status: state.status,
      credentialFingerprintSha256: state.credentialFingerprintSha256,
      attestedAt: state.attestedAt,
      activatedAt: state.activatedAt,
      revokedAt: state.revokedAt,
    });
    try {
      const sealed = custody.read(identity);
      custodyReceipt = sealed ? Object.freeze({
        revision: sealed.revision,
        status: sealed.status,
        credentialFingerprintSha256: sealed.credentialFingerprintSha256,
        egressProofRevision: sealed.egressProofRevision,
        egressIpSetDigestSha256: sealed.egressIpSetDigestSha256,
        egressAllowlistedAt: sealed.egressAllowlistedAt,
        createdAt: sealed.createdAt,
        updatedAt: sealed.updatedAt,
        revokedAt: sealed.revokedAt,
      }) : null;
    } catch {
      custodyAvailable = false;
    }
    return Object.freeze({ identity, egress, credentialAuthority, custody: custodyReceipt, custodyAvailable });
  } catch {
    return null;
  } finally {
    custody.close();
    handle?.close();
  }
}

export async function declareProductionWriteCredentialEgress(ownerProof: ExecutionHostCeremonyOwnerProof) {
  const identity = productionWriteCredentialCeremonyIdentity();
  if (!identity) return null;
  return declareProductionExecutionHostEgressCeremony(identity, ownerProof);
}

export async function observeProductionWriteCredentialEgress(ownerProof: ExecutionHostCeremonyOwnerProof) {
  const identity = productionWriteCredentialCeremonyIdentity();
  if (!identity) return null;
  return observeProductionExecutionHostEgressCeremony(identity, ownerProof);
}

export async function attestProductionWriteCredentialEgressAllowlisted(ownerProof: ExecutionHostCeremonyOwnerProof) {
  const identity = productionWriteCredentialCeremonyIdentity();
  if (!identity) return null;
  let handle: ReturnType<typeof openProductionMexcWriteProvisioningAuthority> | null = null;
  try {
    handle = openProductionMexcWriteProvisioningAuthority();
    return await handle.authority.attestCurrentEgressAllowlist(identity, ownerProof, new Date());
  } catch {
    return null;
  } finally {
    handle?.close();
  }
}

export async function provisionProductionWriteCredential(
  credentials: Readonly<{ accessKey: string; secretKey: string }>,
  ownerProof: WriteProvisioningOwnerProof,
) {
  const identity = productionWriteCredentialCeremonyIdentity();
  if (!identity) return null;
  let handle: ReturnType<typeof openProductionMexcWriteProvisioningAuthority> | null = null;
  const custody = new SqliteMexcWriteCredentialCustody();
  try {
    handle = openProductionMexcWriteProvisioningAuthority();
    return await provisionMexcWriteCredential(custody, handle.authority, {
      ...identity,
      expectedRevision: 0,
      credentials,
      permissionAttestation: MEXC_WRITE_PERMISSION_ATTESTATION,
      ownerProof,
    }, new Date());
  } catch {
    return null;
  } finally {
    custody.close();
    handle?.close();
  }
}
