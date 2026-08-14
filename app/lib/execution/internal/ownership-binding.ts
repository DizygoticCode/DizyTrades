import "server-only";

import { createHash } from "node:crypto";

export const EXECUTION_OWNERSHIP_BINDING_VERSION = "owner-mexc-readonly-account-binding/1.0.0" as const;
export const EXECUTION_OWNERSHIP_BINDING_ATTESTATION = "owner-mexc-readonly-exact-account/v1" as const;
export const EXECUTION_OWNERSHIP_USER_ID = "rob" as const;

const ACCOUNT = /^[A-Za-z0-9_:@.-]{1,120}$/;
const GENERATION = /^[1-9][0-9]{0,8}$/;
type Environment = Readonly<Record<string, string | undefined>>;

export type ExecutionOwnershipBinding = Readonly<{
  version: typeof EXECUTION_OWNERSHIP_BINDING_VERSION;
  userId: typeof EXECUTION_OWNERSHIP_USER_ID;
  accountId: string;
  credentialGeneration: string;
  bindingDigest: string;
}>;

export class ExecutionOwnershipBindingError extends Error {
  constructor(readonly code: "EXECUTION_OWNERSHIP_BINDING_INVALID") {
    super("EXECUTION_OWNERSHIP_BINDING_INVALID");
    this.name = "ExecutionOwnershipBindingError";
  }
}

const clean = (value: string | undefined) => typeof value === "string" ? value.trim() : "";
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/**
 * Server-only operator attestation that maps the single owner Account Companion
 * credential generation to one exact DizyTrades account identity. It contains no
 * MEXC key, secret, credential fingerprint, session token, or request-provided claim.
 * Missing configuration means deliberately unbound/default-deny.
 */
export function readProductionExecutionOwnershipBinding(
  environment: Environment = process.env,
): ExecutionOwnershipBinding | null {
  for (const [key, value] of Object.entries(environment)) {
    if (
      key.startsWith("NEXT_PUBLIC_")
      && /MEXC|EXECUTION/i.test(key)
      && /BINDING|ACCOUNT|ATTESTATION|GENERATION/i.test(key)
      && clean(value)
    ) throw new ExecutionOwnershipBindingError("EXECUTION_OWNERSHIP_BINDING_INVALID");
  }

  const accountId = clean(environment.OWNER_MEXC_EXECUTION_ACCOUNT_ID);
  const attestation = clean(environment.OWNER_MEXC_EXECUTION_ACCOUNT_BINDING_ATTESTATION);
  const credentialGeneration = clean(environment.OWNER_MEXC_EXECUTION_CREDENTIAL_GENERATION);
  const configured = [accountId, attestation, credentialGeneration].filter(Boolean).length;

  if (configured === 0) return null;
  if (
    configured !== 3
    || !ACCOUNT.test(accountId)
    || !GENERATION.test(credentialGeneration)
    || attestation !== EXECUTION_OWNERSHIP_BINDING_ATTESTATION
  ) throw new ExecutionOwnershipBindingError("EXECUTION_OWNERSHIP_BINDING_INVALID");

  const core = Object.freeze({
    version: EXECUTION_OWNERSHIP_BINDING_VERSION,
    userId: EXECUTION_OWNERSHIP_USER_ID,
    accountId,
    credentialGeneration,
  });
  return Object.freeze({ ...core, bindingDigest: digest(JSON.stringify(core)) });
}

export function ownershipBindingMatches(
  binding: ExecutionOwnershipBinding | null,
  identity: Readonly<{ userId: string; accountId: string }>,
) {
  return Boolean(binding && binding.userId === identity.userId && binding.accountId === identity.accountId);
}
