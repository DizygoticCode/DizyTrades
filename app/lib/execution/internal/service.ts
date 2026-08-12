import "server-only";

import { createExecutionAuditEvent } from "./audit";
import { NonExecutingExecutionAdapter, type ExecutionAdapter } from "./adapter";
import { executionCapabilityGate } from "./gate";
import type {
  ExecutionAuditEvent,
  ExecutionAuditKind,
  ExecutionBoundaryResponse,
  ExecutionPrerequisites,
  ExecutionResult,
  SyntheticProviderScenario,
} from "../types";
import { validateExecutionIntent, type ExecutionIntentInput } from "./validation";
import { createExecutionPreview } from "./preview";
import { evaluateSyntheticProvider, isSyntheticProviderResult } from "./provider";
import {
  executionStateFailureCode,
  type ExecutionIdempotencyScope,
  type ExecutionStateStore,
} from "./state-store";

type ServiceOptions = Readonly<{
  stateStore: ExecutionStateStore;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  syntheticProviderScenario?: SyntheticProviderScenario;
  syntheticProviderFault?: "exception" | "malformed-result";
}>;

export class ExecutionAirlockService {
  private sequence = 0;
  private readonly adapter: ExecutionAdapter = new NonExecutingExecutionAdapter();

  constructor(private readonly options: ServiceOptions) {}

  /** @internal Only ExecutionBoundary may call this implementation. */
  process(input: ExecutionIntentInput, prerequisites: ExecutionPrerequisites, boundaryKillReason: ExecutionResult["reason"] | null): ExecutionBoundaryResponse {
    const events: ExecutionAuditEvent[] = [];
    const occurredAt = (this.options.now ?? (() => new Date()))().toISOString();
    let identity = {
      intentId: "unvalidated-intent",
      idempotencyKey: "unvalidated-key",
      userId: "unvalidated-user",
      symbol: undefined as string | undefined,
    };
    const audit = (kind: ExecutionAuditKind, reason?: ExecutionResult["reason"]) => events.push(createExecutionAuditEvent({
      eventId: `airlock-${++this.sequence}`,
      occurredAt, kind, ...identity, ...(reason ? { reason } : {}),
    }));
    const response = (result: ExecutionResult): ExecutionBoundaryResponse =>
      Object.freeze({ result, auditEvents: Object.freeze(events) });
    const stateFailure = (reason: "EXECUTION_STATE_UNAVAILABLE" | "EXECUTION_STATE_INVALID", preview: ExecutionResult["preview"] = null): ExecutionBoundaryResponse => {
      audit("execution-state-failed", reason);
      return response(Object.freeze({
        intentId: identity.intentId,
        idempotencyKey: identity.idempotencyKey,
        state: "blocked",
        executed: false,
        duplicate: false,
        reason,
        preview,
      }));
    };
    const persist = (scope: ExecutionIdempotencyScope, result: ExecutionResult): ExecutionBoundaryResponse => {
      try {
        this.options.stateStore.complete(scope, result, occurredAt);
        return response(result);
      } catch (error) {
        return stateFailure(executionStateFailureCode(error), result.preview);
      }
    };

    audit("intent-received");
    const validation = validateExecutionIntent(input, prerequisites, new Date(occurredAt));
    if (!validation.ok) {
      const reason = validation.rejections[0].code;
      audit("validation-rejected", reason);
      return response(Object.freeze({
        intentId: identity.intentId,
        idempotencyKey: identity.idempotencyKey,
        state: "rejected",
        executed: false,
        duplicate: false,
        reason,
        preview: null,
      }));
    }

    identity = {
      intentId: validation.intent.intentId,
      idempotencyKey: validation.intent.idempotencyKey,
      userId: validation.intent.userId,
      symbol: validation.intent.symbol,
    };
    audit("validation-passed");

    const idempotencyScope = Object.freeze({
      userId: validation.intent.userId,
      accountId: validation.intent.accountId,
      idempotencyKey: validation.intent.idempotencyKey,
    });
    try {
      const claim = this.options.stateStore.claim(idempotencyScope, {
        intentId: validation.intent.intentId,
        symbol: validation.intent.symbol,
      }, occurredAt);
      if (claim.kind === "duplicate") {
        audit("duplicate-intent-detected", "DUPLICATE_INTENT");
        if (!claim.result) {
          return response(Object.freeze({
            intentId: validation.intent.intentId,
            idempotencyKey: validation.intent.idempotencyKey,
            state: "blocked",
            executed: false,
            duplicate: true,
            reason: "DUPLICATE_INTENT",
            preview: null,
          }));
        }
        return response(Object.freeze({ ...claim.result, duplicate: true, reason: "DUPLICATE_INTENT" }));
      }
    } catch (error) {
      return stateFailure(executionStateFailureCode(error));
    }

    const gate = executionCapabilityGate(this.options.environment);
    const reason = gate.reason === "adapter-unavailable"
      ? "ADAPTER_UNAVAILABLE"
      : (boundaryKillReason ?? "GLOBAL_EXECUTION_DISABLED");
    const preview = createExecutionPreview(validation.intent, prerequisites);

    if (this.options.syntheticProviderScenario && !boundaryKillReason && gate.reason === "disabled") {
      try {
        if (this.options.syntheticProviderFault === "exception") throw new Error("Synthetic provider fault");
        const providerResult: unknown = this.options.syntheticProviderFault === "malformed-result"
          ? Object.freeze({ executed: true })
          : evaluateSyntheticProvider(this.options.syntheticProviderScenario, { intent: validation.intent, preview });
        if (!isSyntheticProviderResult(providerResult)) {
          audit("provider-failed", "PROVIDER_MALFORMED_RESULT");
          return persist(idempotencyScope, Object.freeze({
            intentId: validation.intent.intentId,
            idempotencyKey: validation.intent.idempotencyKey,
            state: "blocked",
            executed: false,
            duplicate: false,
            reason: "PROVIDER_MALFORMED_RESULT",
            preview,
          }));
        }
        audit("provider-evaluated", "SYNTHETIC_PROVIDER_OUTCOME");
        return persist(idempotencyScope, Object.freeze({
          intentId: validation.intent.intentId,
          idempotencyKey: validation.intent.idempotencyKey,
          state: "prepared",
          executed: false,
          duplicate: false,
          reason: "SYNTHETIC_PROVIDER_OUTCOME",
          preview,
          providerResult,
        }));
      } catch {
        audit("provider-failed", "PROVIDER_EXCEPTION");
        return persist(idempotencyScope, Object.freeze({
          intentId: validation.intent.intentId,
          idempotencyKey: validation.intent.idempotencyKey,
          state: "blocked",
          executed: false,
          duplicate: false,
          reason: "PROVIDER_EXCEPTION",
          preview,
        }));
      }
    }

    audit(reason === "ADAPTER_UNAVAILABLE" ? "adapter-unavailable" : "kill-switch-active", reason);
    const result = this.adapter.prepare(validation.intent, preview, reason);
    audit("execution-blocked", reason);
    return persist(idempotencyScope, result);
  }
}
