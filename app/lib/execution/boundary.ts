import "server-only";

import { executionKillSwitchReason, type ExecutionKillSwitches } from "./internal/kill-switch";
import { ExecutionAirlockService } from "./internal/service";
import type {
  AuthenticatedExecutionCaller,
  ExecutionBoundaryRequest,
  ExecutionBoundaryResponse,
  ExecutionRejectionCode,
  ExecutionResult,
} from "./types";

export type ExecutionCallerVerifier = (
  assertion: ExecutionBoundaryRequest["callerAssertion"],
) => AuthenticatedExecutionCaller | null;

export type ExecutionBoundaryOptions = Readonly<{
  authenticateInternalCaller: ExecutionCallerVerifier;
  readKillSwitches: () => ExecutionKillSwitches;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
}>;

const rejected = (
  _request: ExecutionBoundaryRequest,
  reason: ExecutionRejectionCode,
): ExecutionBoundaryResponse => Object.freeze({
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

/**
 * The sole application-facing entry to the non-executing airlock.
 * Authentication and all kill switches are resolved here, never by a caller.
 */
export class ExecutionBoundary {
  private readonly airlock: ExecutionAirlockService;

  constructor(private readonly options: ExecutionBoundaryOptions) {
    this.airlock = new ExecutionAirlockService({ environment: options.environment, now: options.now });
  }

  preview(request: ExecutionBoundaryRequest): ExecutionBoundaryResponse {
    let caller: AuthenticatedExecutionCaller | null = null;
    try {
      caller = this.options.authenticateInternalCaller(request.callerAssertion);
    } catch {
      return rejected(request, "CALLER_UNAUTHENTICATED");
    }
    if (!caller || caller.callerId !== request.callerAssertion.callerId) {
      return rejected(request, "CALLER_UNAUTHENTICATED");
    }
    if (caller.userId !== request.userId || caller.accountId !== request.accountId) {
      return rejected(request, "CALLER_IDENTITY_MISMATCH");
    }

    let switches: ExecutionKillSwitches;
    try {
      switches = this.options.readKillSwitches();
    } catch {
      return rejected(request, "BOUNDARY_DEPENDENCY_FAILURE");
    }
    const killReason: ExecutionResult["reason"] = executionKillSwitchReason(switches, caller);
    return this.airlock.process(
      { ...request.intent, userId: caller.userId, accountId: caller.accountId },
      request.prerequisites,
      killReason,
    );
  }
}
