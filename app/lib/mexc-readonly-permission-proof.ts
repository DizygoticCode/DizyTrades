import "server-only";

import { createHash } from "node:crypto";

import {
  MEXC_PRIVATE_READONLY_POLICY_VERSION,
  mexcPrivateReadCapabilityManifest,
} from "./mexc-private-readonly";

export const MEXC_READONLY_PERMISSION_PROOF_VERSION =
  "mexc-readonly-permission-proof/1.0.0" as const;

const expectedEndpoints = Object.freeze([
  Object.freeze({
    id: "all-assets",
    method: "GET",
    path: "/api/v1/private/account/assets",
    permission: "trade-read",
  }),
  Object.freeze({
    id: "open-positions",
    method: "GET",
    path: "/api/v1/private/position/open_positions",
    permission: "trade-read",
  }),
  Object.freeze({
    id: "risk-limits",
    method: "GET",
    path: "/api/v1/private/account/risk_limit",
    permission: "trade-read",
  }),
  Object.freeze({
    id: "single-asset",
    method: "GET",
    path: "/api/v1/private/account/asset/{currency}",
    permission: "account-read",
  }),
  Object.freeze({
    id: "tiered-fee-rate",
    method: "GET",
    path: "/api/v1/private/account/tiered_fee_rate",
    permission: "trade-read",
  }),
] as const);

const forbiddenCapabilities = Object.freeze([
  "order-submit",
  "order-cancel",
  "order-cancel-all",
  "change-leverage",
  "change-margin",
  "change-position-mode",
  "asset-transfer",
  "withdrawal",
] as const);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Permission proof contains a non-finite number.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => {
        const entry = record[key];
        if (entry === undefined) {
          throw new TypeError("Permission proof cannot contain undefined values.");
        }
        return `${JSON.stringify(key)}:${canonicalJson(entry)}`;
      })
      .join(",")}}`;
  }
  throw new TypeError("Permission proof contains an unsupported value.");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sortedEndpointMatrix(
  endpoints: readonly Readonly<{
    id: string;
    method: string;
    path: string;
    permission: string;
  }>[] ,
) {
  return endpoints
    .map((endpoint) =>
      Object.freeze({
        id: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        permission: endpoint.permission,
      }),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildMexcReadOnlyPermissionProof() {
  const manifest = mexcPrivateReadCapabilityManifest();
  const endpoints = Object.freeze(sortedEndpointMatrix(manifest.endpoints));
  const expected = Object.freeze(sortedEndpointMatrix(expectedEndpoints));
  const methods = Object.freeze([...manifest.methods].sort());
  const permissions = Object.freeze([...manifest.permissions].sort());
  const endpointIds = endpoints.map((endpoint) => endpoint.id);

  const checks = Object.freeze({
    transportPolicyVersionExact:
      manifest.policyVersion === MEXC_PRIVATE_READONLY_POLICY_VERSION,
    baseOriginPinned: manifest.baseOrigin === "https://api.mexc.com",
    methodSetExact: canonicalJson(methods) === canonicalJson(["GET"]),
    permissionSetExact:
      canonicalJson(permissions) === canonicalJson(["account-read", "trade-read"]),
    endpointMatrixExact:
      canonicalJson(endpoints) === canonicalJson(expected),
    endpointIdsUnique: new Set(endpointIds).size === endpointIds.length,
    writeCapabilityDisabled: manifest.writeCapability === false,
  });
  const softwareBoundaryProved = Object.values(checks).every(Boolean);

  const core = Object.freeze({
    proofVersion: MEXC_READONLY_PERMISSION_PROOF_VERSION,
    transportPolicyVersion: manifest.policyVersion,
    generatedFrom: "runtime-capability-manifest" as const,
    baseOrigin: manifest.baseOrigin,
    methods,
    permissions,
    endpoints,
    writeCapability: manifest.writeCapability,
    forbiddenCapabilities,
    checks,
    softwareBoundaryProved,
    realCredentialConfigured: false as const,
    realKeyPermissionAttested: false as const,
    credentialAttestationStatus: "not-performed" as const,
  });

  return Object.freeze({
    ...core,
    proofDigest: sha256(canonicalJson(core)),
  });
}

export function assertMexcReadOnlySoftwareBoundary() {
  const proof = buildMexcReadOnlyPermissionProof();
  if (!proof.softwareBoundaryProved || proof.writeCapability !== false) {
    throw new Error("MEXC private software boundary is not read-only.");
  }
  return proof;
}
