import "server-only";

import { createHash } from "node:crypto";

import type { MexcPrivateReadCredentials } from "./mexc-private-readonly";
import {
  assertMexcReadOnlySoftwareBoundary,
} from "./mexc-readonly-permission-proof";

export const MEXC_READONLY_CREDENTIAL_ACTIVATION_VERSION =
  "mexc-readonly-credential-activation/2.0.0" as const;
export const MEXC_READONLY_PERMISSION_ATTESTATION =
  "account-read+trade-read;no-write/v1" as const;

export type MexcReadOnlyCredentialActivationState =
  | "disabled"
  | "ready";

export type MexcReadOnlyCredentialActivationFailureKind =
  | "invalid-enabled-flag"
  | "disabled-with-private-configuration"
  | "browser-exposed-credential"
  | "incomplete-credentials"
  | "invalid-credentials"
  | "missing-read-only-attestation"
  | "ambiguous-write-configuration"
  | "credential-separation-failed"
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
  accountScope: "owner";
  state: MexcReadOnlyCredentialActivationState;
  credentialSource: "server-environment";
  configured: boolean;
  readyForPrivateReads: boolean;
  requestedPermissions: readonly ["account-read", "trade-read"];
  writePermissionRequested: false;
  operatorReadOnlyAttested: boolean;
  providerPermissionIntrospectionPerformed: false;
  liveTradingEnabled: boolean;
  writerCredentialsConfigured: boolean;
  writerCredentialSeparationProved: boolean;
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
const generationToken = /^[A-Za-z0-9_-]{1,120}$/;
const privateEnvironmentKeys = Object.freeze([
  "OWNER_MEXC_READONLY_API_KEY",
  "OWNER_MEXC_READONLY_API_SECRET",
  "OWNER_MEXC_READONLY_PERMISSION_ATTESTATION",
] as const);
const writerEnvironmentKeys = Object.freeze([
  "MEXC_EXECUTION_ACCESS_KEY",
  "MEXC_EXECUTION_SECRET_KEY",
  "MEXC_EXECUTION_CREDENTIAL_GENERATION",
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
    "Owner MEXC Account Companion enablement must be exactly true or false.",
  );
}

function liveTradingEnabled(environment: Environment) {
  return clean(environment.LIVE_TRADING_ENABLED).toLowerCase() === "true";
}

function assertNoBrowserCredential(environment: Environment) {
  for (const [key, value] of Object.entries(environment)) {
    if (
      /^(?:NEXT_PUBLIC_|PUBLIC_)/i.test(key) &&
      /MEXC/i.test(key) &&
      /(?:KEY|SECRET|CREDENTIAL|ATTESTATION|GENERATION)/i.test(key) &&
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
      "Owner MEXC read-only credentials are not configured correctly.",
    );
  }
}

function assertWriterCredentialSeparation(
  environment: Environment,
  readApiKey: string,
  readApiSecret: string,
) {
  const values = writerEnvironmentKeys.map((key) => clean(environment[key]));
  const configuredCount = values.filter(Boolean).length;
  if (configuredCount === 0) {
    return Object.freeze({ configured: false, separationProved: false });
  }
  if (configuredCount !== writerEnvironmentKeys.length) {
    throw new MexcReadOnlyCredentialActivationError(
      "ambiguous-write-configuration",
      "MEXC execution credentials must be absent or configured as a complete server-only family.",
    );
  }

  const [accessKey, secretKey, generation] = values;
  if (
    accessKey.length < 16 || accessKey.length > 256 ||
    secretKey.length < 16 || secretKey.length > 512 ||
    !printableNonWhitespace.test(accessKey) ||
    !printableNonWhitespace.test(secretKey) ||
    !generationToken.test(generation)
  ) {
    throw new MexcReadOnlyCredentialActivationError(
      "ambiguous-write-configuration",
      "MEXC execution credential separation could not be proven.",
    );
  }
  if (accessKey === readApiKey || secretKey === readApiSecret) {
    throw new MexcReadOnlyCredentialActivationError(
      "credential-separation-failed",
      "MEXC read-only and execution credentials must be independent.",
    );
  }
  return Object.freeze({ configured: true, separationProved: true });
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
  liveTradingEnabled: boolean;
  writerCredentialsConfigured: boolean;
  writerCredentialSeparationProved: boolean;
}) {
  return Object.freeze({
    policyVersion: MEXC_READONLY_CREDENTIAL_ACTIVATION_VERSION,
    accountScope: "owner" as const,
    state: input.state,
    credentialSource: "server-environment" as const,
    configured: input.configured,
    readyForPrivateReads: input.readyForPrivateReads,
    requestedPermissions,
    writePermissionRequested: false as const,
    operatorReadOnlyAttested: input.operatorReadOnlyAttested,
    providerPermissionIntrospectionPerformed: false as const,
    liveTradingEnabled: input.liveTradingEnabled,
    writerCredentialsConfigured: input.writerCredentialsConfigured,
    writerCredentialSeparationProved: input.writerCredentialSeparationProved,
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

  const enabled = enabledFlag(environment.OWNER_MEXC_ACCOUNT_COMPANION_ENABLED);
  const apiKey = clean(environment.OWNER_MEXC_READONLY_API_KEY);
  const apiSecret = clean(environment.OWNER_MEXC_READONLY_API_SECRET);
  const attestation = clean(
    environment.OWNER_MEXC_READONLY_PERMISSION_ATTESTATION,
  );
  const hasPrivateConfiguration = privateEnvironmentKeys.some((key) =>
    Boolean(clean(environment[key])),
  );

  if (!enabled) {
    if (hasPrivateConfiguration) {
      throw new MexcReadOnlyCredentialActivationError(
        "disabled-with-private-configuration",
        "Owner MEXC private configuration is present while Account Companion is disabled.",
      );
    }
    const writer = assertWriterCredentialSeparation(environment, "", "");
    const core = activationCore({
      state: "disabled",
      configured: false,
      readyForPrivateReads: false,
      operatorReadOnlyAttested: false,
      softwareProofDigest: softwareProof.proofDigest,
      liveTradingEnabled: liveTradingEnabled(environment),
      writerCredentialsConfigured: writer.configured,
      writerCredentialSeparationProved: writer.separationProved,
    });
    return Object.freeze({
      report: Object.freeze({
        ...core,
        activationDigest: digest(JSON.stringify(core)),
      }),
      credentials: null,
    });
  }

  if (!apiKey || !apiSecret) {
    throw new MexcReadOnlyCredentialActivationError(
      "incomplete-credentials",
      "Owner MEXC read-only credentials must be configured as a complete server-side pair.",
    );
  }
  validateCredentialText(apiKey, "key");
  validateCredentialText(apiSecret, "secret");
  if (attestation !== MEXC_READONLY_PERMISSION_ATTESTATION) {
    throw new MexcReadOnlyCredentialActivationError(
      "missing-read-only-attestation",
      "Owner MEXC read-only permission attestation is missing or invalid.",
    );
  }
  const writer = assertWriterCredentialSeparation(environment, apiKey, apiSecret);

  const core = activationCore({
    state: "ready",
    configured: true,
    readyForPrivateReads: true,
    operatorReadOnlyAttested: true,
    softwareProofDigest: softwareProof.proofDigest,
    liveTradingEnabled: liveTradingEnabled(environment),
    writerCredentialsConfigured: writer.configured,
    writerCredentialSeparationProved: writer.separationProved,
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
      "Owner MEXC Account Companion is not ready for private reads.",
    );
  }
  return parsed.credentials;
}
