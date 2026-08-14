import "server-only";

import { executionKillSwitchReason, type ExecutionKillSwitches } from "./kill-switch";
import { ExecutionAirlockService } from "./service";
import type { ExecutionStateStore } from "./state-store";
import type { ExecutionAuditStore } from "./audit-store";
import type { ExecutionRiskStore } from "./risk-store";
import { ExecutionReconciliationStoreError, type ExecutionReconciliationStore } from "./reconciliation-store";
import { MEXC_PROVIDER_READBACK_MAX_AGE_MS } from "../../mexc-provider-readback";
import { ExecutionOwnershipStoreError, type ExecutionOwnershipStore } from "./ownership-store";
import type {
  AuthenticatedExecutionCaller,
  ExecutionBoundaryRequest,
  ExecutionBoundaryResponse,
  ExecutionRejectionCode,
  ExecutionResult,
  SyntheticProviderScenario,
  SyntheticObservation,
} from "../types";

export type ExecutionCallerVerifier = (
  assertion: ExecutionBoundaryRequest["callerAssertion"],
) => AuthenticatedExecutionCaller | null;

export type ExecutionBoundaryDependencies = Readonly<{
  authenticateInternalCaller: ExecutionCallerVerifier;
  readKillSwitches: () => ExecutionKillSwitches;
  executionStateStore: ExecutionStateStore;
  executionAuditStore: ExecutionAuditStore;
  executionRiskStore: ExecutionRiskStore;
  executionOwnershipStore?: ExecutionOwnershipStore;
  executionReconciliationStore?: ExecutionReconciliationStore;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  /** Test-only deterministic lifecycle fixture; production composition never sets it. */
  syntheticProviderScenario?: SyntheticProviderScenario;
  /** Test-only separately supplied observation; production composition never sets it. */
  syntheticObservation?: SyntheticObservation;
  syntheticProviderFault?: "exception" | "malformed-result";
}>;

const rejected = (reason: ExecutionRejectionCode): ExecutionBoundaryResponse => Object.freeze({
  result: Object.freeze({
    intentId: "unvalidated-intent",
    idempotencyKey: "unvalidated-key",
    state: "rejected" as const,
    executed: false as const,
    duplicate: false,
    reason,
    preview: null,
  }),
  auditEvents: Object.freeze([]),
});

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isAuthenticatedCaller = (value: unknown): value is AuthenticatedExecutionCaller => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthenticatedExecutionCaller>;
  return isNonEmptyString(candidate.callerId)
    && isNonEmptyString(candidate.userId)
    && isNonEmptyString(candidate.accountId);
};

const isKillSwitchState = (value: unknown): value is ExecutionKillSwitches => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ExecutionKillSwitches>;
  return typeof candidate.globalDisabled === "boolean"
    && typeof candidate.armed === "boolean"
    && candidate.disabledUserIds instanceof Set
    && candidate.disabledAccountKeys instanceof Set
    && typeof candidate.providerStateFresh === "boolean"
    && typeof candidate.maintenance === "boolean"
    && typeof candidate.emergencyStop === "boolean"
    && [...candidate.disabledUserIds].every(isNonEmptyString)
    && [...candidate.disabledAccountKeys].every(isNonEmptyString);
};

/** @internal Constructed only by the composition root or the test-only seam. */
export class InternalExecutionBoundary {
  private readonly airlock: ExecutionAirlockService;

  constructor(private readonly dependencies: ExecutionBoundaryDependencies) {
    this.airlock = new ExecutionAirlockService({
      stateStore: dependencies.executionStateStore,
      auditStore: dependencies.executionAuditStore,
      riskStore: dependencies.executionRiskStore,
      environment: dependencies.environment,
      now: dependencies.now,
      syntheticProviderScenario: dependencies.syntheticProviderScenario,
      syntheticObservation: dependencies.syntheticObservation,
      syntheticProviderFault: dependencies.syntheticProviderFault,
    });
  }

  preview(request: ExecutionBoundaryRequest): ExecutionBoundaryResponse {
    let caller: AuthenticatedExecutionCaller | null;
    try {
      const authenticated = this.dependencies.authenticateInternalCaller(request.callerAssertion);
      if (authenticated === null) return rejected("CALLER_UNAUTHENTICATED");
      if (!isAuthenticatedCaller(authenticated)) return rejected("BOUNDARY_DEPENDENCY_FAILURE");
      caller = authenticated;
    } catch {
      return rejected("BOUNDARY_DEPENDENCY_FAILURE");
    }

    if (caller.callerId !== request.callerAssertion.callerId) {
      return rejected("CALLER_UNAUTHENTICATED");
    }
    if (caller.userId !== request.userId || caller.accountId !== request.accountId) {
      return rejected("CALLER_IDENTITY_MISMATCH");
    }

    let killReason: ExecutionResult["reason"] | null;
    try {
      const switches: unknown = this.dependencies.readKillSwitches();
      if (!isKillSwitchState(switches)) return rejected("BOUNDARY_DEPENDENCY_FAILURE");
      killReason = executionKillSwitchReason(switches, caller);
    } catch {
      return rejected("BOUNDARY_DEPENDENCY_FAILURE");
    }

    // Ownership is checked before reconciliation and before the airlock can
    // reach any provider-evaluation seam. Existing kill switches retain
    // precedence through nullish assignment.
    if (this.dependencies.executionOwnershipStore) {
      try {
        const ownership = this.dependencies.executionOwnershipStore.read(caller);
        const observedAt = ownership.proofObservedAt === null ? NaN : Date.parse(ownership.proofObservedAt);
        const age = (this.dependencies.now?.() ?? new Date()).getTime() - observedAt;
        const stale = !Number.isFinite(age) || age < 0 || age > MEXC_PROVIDER_READBACK_MAX_AGE_MS;
        const ownershipReason: ExecutionResult["reason"] | null = ownership.status === "unknown"
          ? "EXECUTION_OWNERSHIP_UNPROVED"
          : ownership.status === "revoked"
            ? "EXECUTION_OWNERSHIP_REVOKED"
            : ownership.status !== "active"
              ? "EXECUTION_OWNERSHIP_INACTIVE"
              : stale ? "EXECUTION_OWNERSHIP_PROOF_STALE" : null;
        killReason ??= ownershipReason;
      } catch (error) {
        killReason ??= error instanceof ExecutionOwnershipStoreError ? error.code : "EXECUTION_OWNERSHIP_UNAVAILABLE";
      }
    }

    // Reconciliation remains a separate, downstream account-local brake.
    if (this.dependencies.executionReconciliationStore) {
      try {
        const reconciliation = this.dependencies.executionReconciliationStore.read(caller);
        const observedAt = reconciliation.observedAt === null ? NaN : Date.parse(reconciliation.observedAt);
        const age = (this.dependencies.now?.() ?? new Date()).getTime() - observedAt;
        const staleClean = reconciliation.status === "clean"
          && (!Number.isFinite(age) || age < 0 || age > MEXC_PROVIDER_READBACK_MAX_AGE_MS);
        if (reconciliation.status !== "clean" || staleClean) killReason ??= reconciliation.status === "quarantined"
          ? "EXECUTION_ACCOUNT_QUARANTINED" : "EXECUTION_RECONCILIATION_UNKNOWN";
      } catch (error) {
        killReason ??= error instanceof ExecutionReconciliationStoreError
          ? error.code : "EXECUTION_RECONCILIATION_UNAVAILABLE";
      }
    }

    return this.airlock.process(
      { ...request.intent, userId: caller.userId, accountId: caller.accountId },
      request.prerequisites,
      killReason,
    );
  }
}
