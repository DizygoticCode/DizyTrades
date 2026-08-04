import "server-only";

import { createHash } from "node:crypto";

import type { MexcPrivateReadCredentials } from "./mexc-private-readonly";
import {
  assertMexcReadOnlySoftwareBoundary,
} from "./mexc-readonly-permission-proof";

export const MEXC_READONLY_CREDENTIAL_ACTIVATION_VERSION =
  "mexc-readonly-credential-activation/1.0.0" as const;
export const MEXC_READONLY_PERMISSION_ATTESTATION =
  "account-read+trade-read;no-write/v1" as const;

export type MexcReadOnlyCredentialActivationState =
  | "disabled"
  | "ready";

export type MexcReadOnlyCredentialActivationFailureKind =
  | "invalid-enabled-flag"
  | "disabled-with-private-configuration"
  | "live-trading-enabled"
  | "browser-exposed-credential"
  | "incomplete-credentials"
  | "invalid-credentials"
  | "missing-read-only-attestation"
  | "software-boundary-failed"
  | "not-ready";

export class MexcReadOnlyCredentialActivationError extends Error {
  constructor(
    public readonly kind: MexcReadOnlyCredentialActivationFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "MexcReadOnlyCredentialActivationError";
  }
}

export type MexcReadOnlyCredentialActivationReport = Readonly<{
  policyVersion: typeof MEXC_READONLY_CREDENTIAL_ACTIVATION_VERSION;
  state: MexcReadOnlyCredentialActivationState;
  credentialSource: "server-environment";
  configured: boolean;
  readyForPrivateReads: boolean;
  requestedPermissions: readonly ["account-read", "trade-read"];
  writePermissionRequested: false;
  operatorReadOnlyAttested: boolean;
  providerPermissionIntrospectionPerformed: false;
  liveTradingEnabled: false;
  browserExposureForbidden: true;
  softwareBoundaryProved: true;
  softwareProofDigest: string;
  activationDigest: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

const requestedPermissions = Object.freeze([
  "account-read",
  "trade-read",
] as const);
const printableNonWhitespace = /^[\x21-\x7e]+$/;
const privateEnvironmentKeys = Object.freeze([
  "MEXC_READONLY_API_KEY",
  "MEXC_READONLY_API_SECRET",
  "MEXC_READONLY_PERMISSION_ATTESTATION",
] as const);

function clean(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function enabledFlag(value: string | undefined) {
  const normalised = clean(value).toLowerCase();
  if (!normalised || normalised === "false") return false;
  if (normalised === "true") return true;
  throw new MexcReadOnlyCredentialActivationError(
    "invalid-enabled-flag",
    "MEXC Account Companion enablement must be exactly true or false.",
  );
}

function assertNoBrowserCredential(environment: Environment) {
  for (const [key, value] of Object.entries(environment)) {
    if (
      key.startsWith("NEXT_PUBLIC_") &&
      /MEXC/i.test(key) &&
      /(?:KEY|SECRET|CREDENTIAL|ATTESTATION)/i.test(key) &&
      clean(value)
    ) {
      throw new MexcReadOnlyCredentialActivationError(
        "browser-exposed-credential",
        "MEXC private configuration must never use a browser-exposed environment variable.",
      );
    }
  }
}

function validateCredentialText(
  value: string,
  kind: "key" | "secret",
) {
  const minimum = kind === "key" ? 8 : 16;
  const maximum = kind === "key" ? 256 : 512;
  if (
    value.length < minimum ||
    value.length > maximum ||
    !printableNonWhitespace.test(value)
  ) {
    throw new MexcReadOnlyCredentialActivationError(
      "invalid-credentials",
      "MEXC read-only credentials are not configured correctly.",
    );
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function activationCore(input: {
  state: MexcReadOnlyCredentialActivationState;
  configured: boolean;
  readyForPrivateReads: boolean;
  operatorReadOnlyAttested: boolean;
  softwareProofDigest: string;
}) {
  return Object.freeze({
    policyVersion: MEXC_READONLY_CREDENTIAL_ACTIVATION_VERSION,
    state: input.state,
    credentialSource: "server-environment" as const,
    configured: input.configured,
    readyForPrivateReads: input.readyForPrivateReads,
    requestedPermissions,
    writePermissionRequested: false as const,
    operatorReadOnlyAttested: input.operatorReadOnlyAttested,
    providerPermissionIntrospectionPerformed: false as const,
    liveTradingEnabled: false as const,
    browserExposureForbidden: true as const,
    softwareBoundaryProved: true as const,
    softwareProofDigest: input.softwareProofDigest,
  });
}

function parseMexcReadOnlyCredentialActivation(environment: Environment) {
  assertNoBrowserCredential(environment);

  let softwareProof;
  try {
    softwareProof = assertMexcReadOnlySoftwareBoundary();
  } catch {
    throw new MexcReadOnlyCredentialActivationError(
      "software-boundary-failed",
      "The MEXC private software boundary is not proven read-only.",
    );
  }

  const enabled = enabledFlag(environment.MEXC_ACCOUNT_COMPANION_ENABLED);
  const apiKey = clean(environment.MEXC_READONLY_API_KEY);
  const apiSecret = clean(environment.MEXC_READONLY_API_SECRET);
  const attestation = clean(environment.MEXC_READONLY_PERMISSION_ATTESTATION);
  const hasPrivateConfiguration = privateEnvironmentKeys.some((key) =>
    Boolean(clean(environment[key])),
  );

  if (!enabled) {
    if (hasPrivateConfiguration) {
      throw new MexcReadOnlyCredentialActivationError(
        "disabled-with-private-configuration",
        "MEXC private configuration is present while Account Companion is disabled.",
      );
    }
    const core = activationCore({
      state: "disabled",
      configured: false,
      readyForPrivateReads: false,
      operatorReadOnlyAttested: false,
      softwareProofDigest: softwareProof.proofDigest,
    });
    return Object.freeze({
      report: Object.freeze({
        ...core,
        activationDigest: digest(JSON.stringify(core)),
      }),
      credentials: null,
    });
  }

  if (clean(environment.LIVE_TRADING_ENABLED).toLowerCase() !== "false") {
    throw new MexcReadOnlyCredentialActivationError(
      "live-trading-enabled",
      "MEXC Account Companion requires LIVE_TRADING_ENABLED=false.",
    );
  }
  if (!apiKey || !apiSecret) {
    throw new MexcReadOnlyCredentialActivationError(
      "incomplete-credentials",
      "MEXC read-only credentials must be configured as a complete server-side pair.",
    );
  }
  validateCredentialText(apiKey, "key");
  validateCredentialText(apiSecret, "secret");
  if (attestation !== MEXC_READONLY_PERMISSION_ATTESTATION) {
    throw new MexcReadOnlyCredentialActivationError(
      "missing-read-only-attestation",
      "MEXC read-only permission attestation is missing or invalid.",
    );
  }

  const core = activationCore({
    state: "ready",
    configured: true,
    readyForPrivateReads: true,
    operatorReadOnlyAttested: true,
    softwareProofDigest: softwareProof.proofDigest,
  });
  const credentials = Object.freeze({ apiKey, apiSecret });
  return Object.freeze({
    report: Object.freeze({
      ...core,
      activationDigest: digest(JSON.stringify(core)),
    }),
    credentials,
  });
}

export function buildMexcReadOnlyCredentialActivationReport(
  environment: Environment = process.env,
): MexcReadOnlyCredentialActivationReport {
  return parseMexcReadOnlyCredentialActivation(environment).report;
}

export function requireMexcReadOnlyCredentials(
  environment: Environment = process.env,
): MexcPrivateReadCredentials {
  const parsed = parseMexcReadOnlyCredentialActivation(environment);
  if (!parsed.credentials || !parsed.report.readyForPrivateReads) {
    throw new MexcReadOnlyCredentialActivationError(
      "not-ready",
      "MEXC Account Companion is not ready for private reads.",
    );
  }
  return parsed.credentials;
}
