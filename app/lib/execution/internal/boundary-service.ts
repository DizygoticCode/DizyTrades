import "server-only";

import { executionKillSwitchReason, type ExecutionKillSwitches } from "./kill-switch";
import { ExecutionAirlockService } from "./service";
import type {
  AuthenticatedExecutionCaller,
  ExecutionBoundaryRequest,
  ExecutionBoundaryResponse,
  ExecutionRejectionCode,
  ExecutionResult,
  SyntheticProviderScenario,
} from "../types";

export type ExecutionCallerVerifier = (
  assertion: ExecutionBoundaryRequest["callerAssertion"],
) => AuthenticatedExecutionCaller | null;

export type ExecutionBoundaryDependencies = Readonly<{
  authenticateInternalCaller: ExecutionCallerVerifier;
  readKillSwitches: () => ExecutionKillSwitches;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  /** Test-only deterministic lifecycle fixture; production composition never sets it. */
  syntheticProviderScenario?: SyntheticProviderScenario;
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
    && candidate.disabledUserIds instanceof Set
    && candidate.disabledAccountIds instanceof Set
    && typeof candidate.providerStateFresh === "boolean"
    && typeof candidate.maintenance === "boolean"
    && typeof candidate.emergencyStop === "boolean"
    && [...candidate.disabledUserIds].every(isNonEmptyString)
    && [...candidate.disabledAccountIds].every(isNonEmptyString);
};

/** @internal Constructed only by the composition root or the test-only seam. */
export class InternalExecutionBoundary {
  private readonly airlock: ExecutionAirlockService;

  constructor(private readonly dependencies: ExecutionBoundaryDependencies) {
    this.airlock = new ExecutionAirlockService({
      environment: dependencies.environment,
      now: dependencies.now,
      syntheticProviderScenario: dependencies.syntheticProviderScenario,
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

    return this.airlock.process(
      { ...request.intent, userId: caller.userId, accountId: caller.accountId },
      request.prerequisites,
      killReason,
    );
  }
}
