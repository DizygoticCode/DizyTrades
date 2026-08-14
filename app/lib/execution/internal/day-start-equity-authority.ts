import "server-only";

import {
  MEXC_PROVIDER_READBACK_MAX_AGE_MS,
  MEXC_PROVIDER_READBACK_VERSION,
  type MexcProviderAccountRiskReadback,
} from "../../mexc-provider-readback";
import type { ExecutionOwnershipBinding } from "./ownership-binding";
import type { ExecutionOwnershipState } from "./ownership-store";
import type { ReconciliationState } from "./reconciliation-store";
import {
  type ExecutionDayStartEquityBaseline,
  type ExecutionDayStartEquityStore,
  utcDayFor,
} from "./day-start-equity-store";

export class ExecutionDayStartEquityAuthorityError extends Error {
  constructor(readonly code:
    | "EXECUTION_DAY_START_EQUITY_PREREQUISITE_FAILED"
    | "EXECUTION_DAY_START_EQUITY_IDENTITY_MISMATCH"
    | "EXECUTION_DAY_START_EQUITY_STALE") {
    super("EXECUTION_DAY_START_EQUITY_AUTHORITY_FAILURE");
    this.name = "ExecutionDayStartEquityAuthorityError";
  }
}

const fail = (code: ExecutionDayStartEquityAuthorityError["code"]): never => {
  throw new ExecutionDayStartEquityAuthorityError(code);
};
const age = (timestamp: string | null | undefined, now: Date) => {
  const parsed = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  return Number.isFinite(parsed) ? now.getTime() - parsed : Number.POSITIVE_INFINITY;
};
const fresh = (timestamp: string | null | undefined, now: Date) => {
  const value = age(timestamp, now);
  return Number.isFinite(value) && value >= 0 && value <= MEXC_PROVIDER_READBACK_MAX_AGE_MS;
};
const validReadback = (
  readback: MexcProviderAccountRiskReadback,
  identity: Readonly<{ userId: string; accountId: string }>,
  now: Date,
) => readback.version === MEXC_PROVIDER_READBACK_VERSION
  && readback.provider === "mexc"
  && readback.settlementCurrency === "USDT"
  && readback.userId === identity.userId
  && readback.accountId === identity.accountId
  && Number.isFinite(readback.equity) && readback.equity > 0
  && Number.isFinite(readback.availableMargin) && readback.availableMargin >= 0
  && readback.availableMargin <= readback.equity * 2
  && Array.isArray(readback.positions)
  && fresh(readback.observedAt, now);

export type DayStartCaptureEvidence = Readonly<{
  identity: Readonly<{ userId: string; accountId: string }>;
  binding: ExecutionOwnershipBinding;
  ownership: ExecutionOwnershipState;
  reconciliation: ReconciliationState;
  readback: MexcProviderAccountRiskReadback;
}>;

/**
 * Captures one immutable UTC-day baseline only from the independently bound,
 * active owner account while authoritative reconciliation is fresh and clean.
 * The capture observation must also be flat: the current non-executing production
 * reconciliation contract owns no positions, so a provider position here is not
 * eligible to become a day-start baseline.
 */
export function captureAuthoritativeDayStartEquity(
  store: ExecutionDayStartEquityStore,
  evidence: DayStartCaptureEvidence,
  now = new Date(),
): ExecutionDayStartEquityBaseline {
  if (!Number.isFinite(now.getTime())) return fail("EXECUTION_DAY_START_EQUITY_PREREQUISITE_FAILED");
  const { identity, binding, ownership, reconciliation, readback } = evidence;
  if (binding.userId !== identity.userId || binding.accountId !== identity.accountId
    || readback.userId !== identity.userId || readback.accountId !== identity.accountId) {
    return fail("EXECUTION_DAY_START_EQUITY_IDENTITY_MISMATCH");
  }
  if (ownership.status !== "active"
    || ownership.bindingDigest !== binding.bindingDigest
    || !fresh(ownership.proofObservedAt, now)
    || reconciliation.status !== "clean"
    || reconciliation.reason !== "CLEAN"
    || reconciliation.revision < 1
    || !fresh(reconciliation.observedAt, now)
    || !validReadback(readback, identity, now)
    || readback.positions.length !== 0) {
    return fail("EXECUTION_DAY_START_EQUITY_PREREQUISITE_FAILED");
  }
  return store.capture(Object.freeze({
    userId: identity.userId,
    accountId: identity.accountId,
    utcDay: utcDayFor(readback.observedAt),
    equity: readback.equity,
    providerVersion: readback.version,
    providerObservedAt: readback.observedAt,
    bindingDigest: binding.bindingDigest,
    credentialGeneration: binding.credentialGeneration,
    reconciliationRevision: reconciliation.revision,
  }), now);
}

export type DayStartRiskEvidence = Readonly<{
  identity: Readonly<{ userId: string; accountId: string }>;
  binding: ExecutionOwnershipBinding;
  reconciliation: ReconciliationState;
  readback: MexcProviderAccountRiskReadback;
}>;

/**
 * Produces the existing riskSnapshot contract only when the immutable baseline
 * is for the current UTC day and the current exact-account provider evidence is
 * still fresh and clean. Any uncertainty returns null so the existing risk
 * officer continues to fail closed with RISK_SNAPSHOT_MISSING/INVALID.
 */
export function authoritativeRiskSnapshotFromDayStart(
  store: ExecutionDayStartEquityStore,
  evidence: DayStartRiskEvidence,
  now = new Date(),
) {
  try {
    if (!Number.isFinite(now.getTime())) return null;
    const { identity, binding, reconciliation, readback } = evidence;
    if (binding.userId !== identity.userId || binding.accountId !== identity.accountId
      || reconciliation.status !== "clean" || reconciliation.reason !== "CLEAN"
      || reconciliation.revision < 1 || !fresh(reconciliation.observedAt, now)
      || !validReadback(readback, identity, now)) return null;
    const baseline = store.read(identity, utcDayFor(now));
    if (!baseline
      || baseline.bindingDigest !== binding.bindingDigest
      || baseline.credentialGeneration !== binding.credentialGeneration
      || baseline.providerVersion !== MEXC_PROVIDER_READBACK_VERSION) return null;
    return Object.freeze({
      userId: identity.userId,
      accountId: identity.accountId,
      observedAt: readback.observedAt,
      equity: readback.equity,
      availableMargin: readback.availableMargin,
      dayStartEquity: baseline.equity,
    });
  } catch {
    return null;
  }
}
