import "server-only";

import {
  MexcAccountStateError,
  type MexcAccountStateSnapshot,
} from "./mexc-account-state";
import { MexcPrivateReadOnlyError } from "./mexc-private-readonly";

export const MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION =
  "mexc-account-availability/1.0.0" as const;

export type MexcAccountFailureReason =
  | "not-configured"
  | "authentication"
  | "ip-whitelist"
  | "account-read-permission"
  | "trade-read-permission"
  | "write-permission-rejected"
  | "rate-limit"
  | "stale-request"
  | "timeout"
  | "provider"
  | "invalid-response"
  | "schema"
  | "clock-skew"
  | "unknown";

export type MexcAccountRecoveryAction =
  | "retry"
  | "reconfigure"
  | "security-review"
  | "code-review";

export type MexcAccountFailure = Readonly<{
  reason: MexcAccountFailureReason;
  action: MexcAccountRecoveryAction;
  occurredAtMs: number;
  providerCode: number | null;
  message: string;
}>;

export type MexcAccountFreshState = Readonly<{
  policyVersion: typeof MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION;
  status: "fresh";
  decisionEligible: true;
  evaluatedAtMs: number;
  ageMs: number;
  maxAgeMs: number;
  snapshot: MexcAccountStateSnapshot;
  failure: null;
}>;

export type MexcAccountStaleState = Readonly<{
  policyVersion: typeof MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION;
  status: "stale";
  decisionEligible: false;
  evaluatedAtMs: number;
  ageMs: number;
  maxAgeMs: number;
  staleReason: "age-limit" | "refresh-failed";
  staleSinceMs: number;
  snapshot: MexcAccountStateSnapshot;
  failure: MexcAccountFailure | null;
}>;

export type MexcAccountUnavailableState = Readonly<{
  policyVersion: typeof MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION;
  status: "unavailable";
  decisionEligible: false;
  evaluatedAtMs: number;
  snapshot: null;
  failure: MexcAccountFailure;
}>;

export type MexcAccountAvailabilityState =
  | MexcAccountFreshState
  | MexcAccountStaleState
  | MexcAccountUnavailableState;

export type MexcAccountFreshnessPolicy = Readonly<{
  nowMs: number;
  maxAgeMs: number;
  maxFutureSkewMs?: number;
}>;

export type MexcAccountRefreshOutcome =
  | Readonly<{ ok: true; snapshot: MexcAccountStateSnapshot }>
  | Readonly<{ ok: false; error: unknown }>;

export class MexcAccountDecisionStateError extends Error {
  constructor(
    public readonly status: MexcAccountAvailabilityState["status"],
    public readonly reason: MexcAccountFailureReason | "stale",
  ) {
    super("Fresh MEXC account state is required for this decision.");
    this.name = "MexcAccountDecisionStateError";
  }
}

function positiveSafeInteger(value: unknown, field: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new TypeError(`${field} must be a positive safe integer.`);
  }
  return value;
}

function nonNegativeSafeInteger(value: unknown, field: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new TypeError(`${field} must be a non-negative safe integer.`);
  }
  return value;
}

function policy(input: MexcAccountFreshnessPolicy) {
  const nowMs = positiveSafeInteger(input.nowMs, "nowMs");
  const maxAgeMs = positiveSafeInteger(input.maxAgeMs, "maxAgeMs");
  if (maxAgeMs > 300_000) {
    throw new TypeError("maxAgeMs cannot exceed five minutes.");
  }
  const maxFutureSkewMs = nonNegativeSafeInteger(
    input.maxFutureSkewMs ?? 2_000,
    "maxFutureSkewMs",
  );
  if (maxFutureSkewMs > 30_000) {
    throw new TypeError("maxFutureSkewMs cannot exceed thirty seconds.");
  }
  return Object.freeze({ nowMs, maxAgeMs, maxFutureSkewMs });
}

function failureDescriptor(reason: MexcAccountFailureReason) {
  switch (reason) {
    case "not-configured":
      return Object.freeze({
        action: "reconfigure" as const,
        message: "A read-only MEXC account connection is not configured.",
      });
    case "authentication":
      return Object.freeze({
        action: "reconfigure" as const,
        message: "MEXC rejected the configured read-only credentials.",
      });
    case "ip-whitelist":
      return Object.freeze({
        action: "reconfigure" as const,
        message: "MEXC rejected the server IP whitelist configuration.",
      });
    case "account-read-permission":
      return Object.freeze({
        action: "reconfigure" as const,
        message: "The MEXC key does not have Account read permission.",
      });
    case "trade-read-permission":
      return Object.freeze({
        action: "reconfigure" as const,
        message: "The MEXC key does not have Trade read permission.",
      });
    case "write-permission-rejected":
      return Object.freeze({
        action: "security-review" as const,
        message: "A requested MEXC capability would require write permission and was rejected.",
      });
    case "rate-limit":
      return Object.freeze({
        action: "retry" as const,
        message: "MEXC rate-limited the private account read.",
      });
    case "stale-request":
      return Object.freeze({
        action: "retry" as const,
        message: "MEXC rejected the private read timestamp or receive window.",
      });
    case "timeout":
      return Object.freeze({
        action: "retry" as const,
        message: "The MEXC private account read timed out.",
      });
    case "provider":
      return Object.freeze({
        action: "retry" as const,
        message: "MEXC could not provide private account state.",
      });
    case "invalid-response":
      return Object.freeze({
        action: "code-review" as const,
        message: "MEXC returned an invalid private account response.",
      });
    case "schema":
      return Object.freeze({
        action: "code-review" as const,
        message: "MEXC private account data did not match the reviewed schema.",
      });
    case "clock-skew":
      return Object.freeze({
        action: "code-review" as const,
        message: "MEXC account-state timing exceeded the allowed clock skew.",
      });
    default:
      return Object.freeze({
        action: "code-review" as const,
        message: "MEXC private account state is unavailable for an unknown reason.",
      });
  }
}

function privateFailureReason(
  kind: MexcPrivateReadOnlyError["kind"],
): MexcAccountFailureReason {
  switch (kind) {
    case "account-read-permission-required":
      return "account-read-permission";
    case "trade-read-permission-required":
      return "trade-read-permission";
    case "write-permission-required":
      return "write-permission-rejected";
    case "authentication":
    case "ip-whitelist":
    case "rate-limit":
    case "stale-request":
    case "provider":
    case "invalid-response":
    case "timeout":
      return kind;
  }
}

export function classifyMexcAccountFailure(
  error: unknown,
  occurredAtMs: number,
): MexcAccountFailure {
  const atMs = positiveSafeInteger(occurredAtMs, "occurredAtMs");
  let reason: MexcAccountFailureReason = "unknown";
  let providerCode: number | null = null;

  if (error instanceof MexcPrivateReadOnlyError) {
    reason = privateFailureReason(error.kind);
    providerCode = error.providerCode;
  } else if (error instanceof MexcAccountStateError) {
    reason = "schema";
  }

  const descriptor = failureDescriptor(reason);
  return Object.freeze({
    reason,
    action: descriptor.action,
    occurredAtMs: atMs,
    providerCode,
    message: descriptor.message,
  });
}

function unavailable(
  evaluatedAtMs: number,
  failure: MexcAccountFailure,
): MexcAccountUnavailableState {
  return Object.freeze({
    policyVersion: MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION,
    status: "unavailable",
    decisionEligible: false,
    evaluatedAtMs,
    snapshot: null,
    failure,
  });
}

export function createMexcAccountNotConfiguredState(
  evaluatedAtMs: number,
): MexcAccountUnavailableState {
  const nowMs = positiveSafeInteger(evaluatedAtMs, "evaluatedAtMs");
  const descriptor = failureDescriptor("not-configured");
  return unavailable(
    nowMs,
    Object.freeze({
      reason: "not-configured",
      action: descriptor.action,
      occurredAtMs: nowMs,
      providerCode: null,
      message: descriptor.message,
    }),
  );
}

export function evaluateMexcAccountSnapshot(
  snapshot: MexcAccountStateSnapshot,
  input: MexcAccountFreshnessPolicy,
): MexcAccountAvailabilityState {
  const checked = policy(input);
  if (
    !Number.isSafeInteger(snapshot.observedAtMs) ||
    snapshot.observedAtMs <= 0 ||
    snapshot.observedAtMs > checked.nowMs + checked.maxFutureSkewMs
  ) {
    const descriptor = failureDescriptor("clock-skew");
    return unavailable(
      checked.nowMs,
      Object.freeze({
        reason: "clock-skew",
        action: descriptor.action,
        occurredAtMs: checked.nowMs,
        providerCode: null,
        message: descriptor.message,
      }),
    );
  }

  const ageMs = Math.max(0, checked.nowMs - snapshot.observedAtMs);
  if (ageMs <= checked.maxAgeMs) {
    return Object.freeze({
      policyVersion: MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION,
      status: "fresh",
      decisionEligible: true,
      evaluatedAtMs: checked.nowMs,
      ageMs,
      maxAgeMs: checked.maxAgeMs,
      snapshot,
      failure: null,
    });
  }

  return Object.freeze({
    policyVersion: MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION,
    status: "stale",
    decisionEligible: false,
    evaluatedAtMs: checked.nowMs,
    ageMs,
    maxAgeMs: checked.maxAgeMs,
    staleReason: "age-limit",
    staleSinceMs: snapshot.observedAtMs + checked.maxAgeMs + 1,
    snapshot,
    failure: null,
  });
}

function previousSnapshot(
  state: MexcAccountAvailabilityState | null,
): MexcAccountStateSnapshot | null {
  return state?.status === "fresh" || state?.status === "stale"
    ? state.snapshot
    : null;
}

export function transitionMexcAccountAvailability(input: Readonly<{
  previous: MexcAccountAvailabilityState | null;
  outcome: MexcAccountRefreshOutcome;
  policy: MexcAccountFreshnessPolicy;
}>): MexcAccountAvailabilityState {
  const checked = policy(input.policy);
  if (input.outcome.ok) {
    return evaluateMexcAccountSnapshot(input.outcome.snapshot, checked);
  }

  const failure = classifyMexcAccountFailure(
    input.outcome.error,
    checked.nowMs,
  );
  const retained = previousSnapshot(input.previous);
  if (!retained) return unavailable(checked.nowMs, failure);
  if (
    !Number.isSafeInteger(retained.observedAtMs) ||
    retained.observedAtMs <= 0 ||
    retained.observedAtMs > checked.nowMs + checked.maxFutureSkewMs
  ) {
    const descriptor = failureDescriptor("clock-skew");
    return unavailable(
      checked.nowMs,
      Object.freeze({
        reason: "clock-skew",
        action: descriptor.action,
        occurredAtMs: checked.nowMs,
        providerCode: null,
        message: descriptor.message,
      }),
    );
  }

  const ageMs = Math.max(0, checked.nowMs - retained.observedAtMs);
  return Object.freeze({
    policyVersion: MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION,
    status: "stale",
    decisionEligible: false,
    evaluatedAtMs: checked.nowMs,
    ageMs,
    maxAgeMs: checked.maxAgeMs,
    staleReason: "refresh-failed",
    staleSinceMs:
      input.previous?.status === "stale"
        ? input.previous.staleSinceMs
        : checked.nowMs,
    snapshot: retained,
    failure,
  });
}

export function requireFreshMexcAccountSnapshot(
  state: MexcAccountAvailabilityState,
): MexcAccountStateSnapshot {
  if (state.status === "fresh") return state.snapshot;
  throw new MexcAccountDecisionStateError(
    state.status,
    state.status === "stale" ? "stale" : state.failure.reason,
  );
}
