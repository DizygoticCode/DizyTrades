import "server-only";

import type { MexcContractMetadata } from "../mexc-contract-metadata";

export const EXECUTION_CONTRACT_VERSION = "execution-airlock/1.0.0" as const;
export const SYNTHETIC_PROVIDER_CONTRACT_VERSION = "synthetic-provider/1.0.0" as const;
export const SYNTHETIC_RECONCILIATION_CONTRACT_VERSION = "synthetic-reconciliation/1.0.0" as const;

export type SyntheticObservation =
  | "would-observe-accepted"
  | "would-observe-rejected"
  | "would-observe-missing";
export type SyntheticReconciliationResolution =
  | "matched-accepted"
  | "matched-rejected"
  | "conflict"
  | "unresolved-timeout"
  | "unresolved-unknown"
  | "recovered-accepted"
  | "recovered-rejected";
export type SyntheticReconciliationResult = Readonly<{
  contractVersion: typeof SYNTHETIC_RECONCILIATION_CONTRACT_VERSION;
  provenance: "deterministic-synthetic-fixture";
  initialProviderOutcome: SyntheticProviderScenario;
  observedOutcome: SyntheticObservation;
  resolution: SyntheticReconciliationResolution;
  certainty: "terminal" | "unresolved" | "conflict";
  executed: false;
}>;

export type SyntheticProviderScenario = "would-accept" | "would-reject" | "would-timeout" | "would-unknown";
export type SyntheticProviderResult = Readonly<{
  contractVersion: typeof SYNTHETIC_PROVIDER_CONTRACT_VERSION;
  providerKind: "non-executing";
  provenance: "deterministic-synthetic-fixture";
  outcome: SyntheticProviderScenario;
  executed: false;
  reasonClass: "none" | "policy" | "timeout" | "indeterminate";
  reconciliation?: SyntheticReconciliationResult;
}>;

export type ExecutionState =
  | "received"
  | "rejected"
  | "validated"
  | "blocked"
  | "prepared"
  | "submitted"
  | "acknowledged"
  | "reconciled"
  | "failed"
  | "cancelled";

export type ExecutionIntent = Readonly<{
  contractVersion: typeof EXECUTION_CONTRACT_VERSION;
  intentId: string;
  idempotencyKey: string;
  userId: string;
  accountId: string;
  symbol: string;
  marketType: "futures";
  side: "long" | "short";
  orderType: "market" | "limit";
  quantity: number;
  price?: number;
  leverage: number;
  reduceOnly: boolean;
  source: "manual" | "signal";
  createdAt: string;
}>;

export type ExecutionRejectionCode =
  | "CALLER_UNAUTHENTICATED"
  | "CALLER_IDENTITY_MISMATCH"
  | "BOUNDARY_DEPENDENCY_FAILURE"
  | "INVALID_IDENTITY"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_SYMBOL"
  | "UNKNOWN_SYMBOL"
  | "INVALID_SIDE"
  | "INVALID_ORDER_TYPE"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "INVALID_LEVERAGE"
  | "INVALID_REDUCE_ONLY"
  | "INVALID_SOURCE"
  | "INVALID_TIMESTAMP"
  | "PREREQUISITE_STATE_STALE"
  | "POLICY_SYMBOL_DENIED"
  | "POLICY_LEVERAGE_EXCEEDED"
  | "POLICY_NOTIONAL_EXCEEDED"
  | "REFERENCE_PRICE_MISSING"
  | "REFERENCE_PRICE_STALE"
  | "ACCOUNT_STATE_MISSING"
  | "ACCOUNT_STATE_IDENTITY_MISMATCH"
  | "ACCOUNT_STATE_STALE"
  | "REDUCE_ONLY_VIOLATION";

export type ExecutionRejection = Readonly<{
  code: ExecutionRejectionCode;
  field: string;
  message: string;
}>;

/** Narrow, server-to-server request accepted by the isolated boundary. */
export type ExecutionBoundaryRequest = Readonly<{
  callerAssertion: Readonly<{ callerId: string; assertionId: string }>;
  userId: string;
  accountId: string;
  intent: Readonly<Record<string, unknown>>;
  prerequisites: ExecutionPrerequisites;
}>;

export type ExecutionPrerequisites = Readonly<{
  contracts: ReadonlyMap<string, MexcContractMetadata> | null;
  referencePrices: ReadonlyMap<string, Readonly<{ price: number; observedAt: string }>> | null;
  accountState: Readonly<{
    userId: string;
    accountId: string;
    observedAt: string;
    positions: readonly Readonly<{ symbol: string; side: "long" | "short"; quantity: number }>[];
  }> | null;
}>;

export type AuthenticatedExecutionCaller = Readonly<{
  callerId: string;
  userId: string;
  accountId: string;
}>;

export type ExecutionValidationResult =
  | Readonly<{ ok: true; intent: ExecutionIntent; rejections: readonly [] }>
  | Readonly<{ ok: false; intent: null; rejections: readonly ExecutionRejection[] }>;

export type ExecutionBlockCode =
  | "GLOBAL_EXECUTION_DISABLED"
  | "USER_EXECUTION_DISABLED"
  | "ACCOUNT_EXECUTION_DISABLED"
  | "PROVIDER_STATE_STALE"
  | "MAINTENANCE_STOP"
  | "EMERGENCY_STOP"
  | "DUPLICATE_INTENT"
  | "ADAPTER_UNAVAILABLE"
  | "PROVIDER_EXCEPTION"
  | "PROVIDER_MALFORMED_RESULT"
  | "SYNTHETIC_PROVIDER_OUTCOME"
  | "EXECUTION_STATE_UNAVAILABLE"
  | "EXECUTION_STATE_INVALID"
  | "EXECUTION_AUDIT_UNAVAILABLE"
  | "EXECUTION_AUDIT_INVALID";

export type ExecutionResult = Readonly<{
  intentId: string;
  idempotencyKey: string;
  state: "blocked" | "rejected" | "prepared";
  executed: false;
  duplicate: boolean;
  reason: ExecutionBlockCode | ExecutionRejectionCode;
  preview: Readonly<{
    symbol: string;
    side: "long" | "short";
    orderType: "market" | "limit";
    quantity: number;
    normalizedContractVolume: number;
    referencePrice: number;
    estimatedNotional: number;
    estimatedMargin: number;
    policyVersion: string;
    price?: number;
    leverage: number;
    reduceOnly: boolean;
  }> | null;
  providerResult?: SyntheticProviderResult;
}>;

export type ExecutionAuditKind =
  | "intent-received" | "validation-passed" | "validation-rejected"
  | "execution-blocked" | "duplicate-intent-detected" | "kill-switch-active"
  | "adapter-unavailable"
  | "provider-evaluated" | "provider-failed"
  | "execution-state-failed";

export type ExecutionAuditEvent = Readonly<{
  schemaVersion: "execution-audit/1.0.0";
  eventId: string;
  occurredAt: string;
  kind: ExecutionAuditKind;
  intentId: string;
  idempotencyDigest: string;
  actorDigest: string;
  symbol?: string;
  reason?: ExecutionBlockCode | ExecutionRejectionCode;
}>;

export type ExecutionBoundaryResponse = Readonly<{
  result: ExecutionResult;
  auditEvents: readonly ExecutionAuditEvent[];
}>;
