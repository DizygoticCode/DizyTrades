import "server-only";

import { SqliteMexcWriteCredentialCustody } from "./credential-custody/write-credential";
import {
  inspectProductionExecutionHostEgressCeremony,
  openProductionMexcWriteProvisioningAuthority,
  type WriteProvisioningOwnerProof,
} from "./execution/write-provisioning-authority";
import {
  inspectProductionWriteCredentialCeremony,
  productionWriteCredentialCeremonyIdentity,
  type ProductionWriteCredentialCeremonySnapshot,
} from "./write-credential-provisioning-ceremony";

export type ProductionWriteCredentialActivationSnapshot = ProductionWriteCredentialCeremonySnapshot & Readonly<{
  activationEligible: boolean;
}>;

export type ProductionWriteCredentialActivationConfirmation = Readonly<{
  orderPlacingOnlyConfirmed: true;
  mexcIpAllowlistConfirmed: true;
}>;

export async function inspectProductionWriteCredentialActivationCeremony(): Promise<ProductionWriteCredentialActivationSnapshot | null> {
  const snapshot = await inspectProductionWriteCredentialCeremony();
  if (!snapshot) return null;
  const authority = snapshot.credentialAuthority;
  const custody = snapshot.custody;
  const egress = snapshot.egress;
  const state = egress?.state;
  const activationEligible = Boolean(
    authority?.status === "attested"
    && authority.revision >= 1
    && authority.credentialFingerprintSha256
    && custody?.status === "sealed"
    && custody.credentialFingerprintSha256 === authority.credentialFingerprintSha256
    && state?.status === "allowlisted"
    && state.dedicatedIpv4s.length === 1
    && egress?.runtime
    && egress.observerIpv4
    && state.provider === egress.runtime.provider
    && state.hostId === egress.runtime.hostId
    && state.dedicatedIpv4s[0] === egress.observerIpv4,
  );
  return Object.freeze({ ...snapshot, activationEligible });
}

export async function activateProductionWriteCredential(
  confirmation: ProductionWriteCredentialActivationConfirmation,
  ownerProof: WriteProvisioningOwnerProof,
) {
  if (!confirmation.orderPlacingOnlyConfirmed || !confirmation.mexcIpAllowlistConfirmed) return null;
  const identity = productionWriteCredentialCeremonyIdentity();
  if (!identity) return null;
  const egress = await inspectProductionExecutionHostEgressCeremony(identity);
  if (!egress?.runtime || !egress.observerIpv4) return null;

  let handle: ReturnType<typeof openProductionMexcWriteProvisioningAuthority> | null = null;
  const custody = new SqliteMexcWriteCredentialCustody();
  try {
    handle = openProductionMexcWriteProvisioningAuthority();
    const authority = handle.authority.inspectCredentialAuthority(identity);
    if (authority.status !== "attested" || authority.revision < 1) return null;
    const sealed = custody.read(identity);
    if (!sealed || sealed.status !== "sealed") return null;
    return await handle.authority.activateAttestedCredential(
      identity,
      authority.revision,
      sealed,
      egress.runtime,
      egress.observerIpv4,
      ownerProof,
      new Date(),
    );
  } catch {
    return null;
  } finally {
    custody.close();
    handle?.close();
  }
}
