import "server-only";

import { createExecutionAuditEvent } from "./audit";
import { executionAuditFailureCode, type ExecutionAuditStore } from "./audit-store";
import { NonExecutingExecutionAdapter, type ExecutionAdapter } from "./adapter";
import { executionCapabilityGate } from "./gate";
import type {
  ExecutionAuditEvent,
  ExecutionAuditKind,
  ExecutionBoundaryResponse,
  ExecutionPrerequisites,
  ExecutionResult,
  SyntheticProviderScenario,
  SyntheticObservation,
} from "../types";
import { validateExecutionIntent, type ExecutionIntentInput } from "./validation";
import { createExecutionPreview } from "./preview";
import { evaluateSyntheticProvider, isSyntheticProviderResult } from "./provider";
import { reconcileSyntheticProviderResult } from "./reconciliation";
import {
  executionStateFailureCode,
  executionStateIdentityFromInput,
  type ExecutionIdempotencyScope,
  type ExecutionStateStore,
} from "./state-store";

type ServiceOptions = Readonly<{
  stateStore: ExecutionStateStore;
  auditStore: ExecutionAuditStore;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  syntheticProviderScenario?: SyntheticProviderScenario;
  syntheticObservation?: SyntheticObservation;
  syntheticProviderFault?: "exception" | "malformed-result";
}>;

export class ExecutionAirlockService {
  private sequence = 0;
  private readonly adapter: ExecutionAdapter = new NonExecutingExecutionAdapter();

  constructor(private readonly options: ServiceOptions) {}

  /** @internal Only ExecutionBoundary may call this implementation. */
  process(input: ExecutionIntentInput, prerequisites: ExecutionPrerequisites, boundaryKillReason: ExecutionResult["reason"] | null): ExecutionBoundaryResponse {
    try {
      return this.processInternal(input, prerequisites, boundaryKillReason);
    } catch (error) {
      return Object.freeze({
        result: Object.freeze({
          intentId: typeof input.intentId === "string" ? input.intentId : "unvalidated-intent",
          idempotencyKey: typeof input.idempotencyKey === "string" ? input.idempotencyKey : "unvalidated-key",
          state: "blocked", executed: false, duplicate: false,
          reason: executionAuditFailureCode(error), preview: null,
        }),
        auditEvents: Object.freeze([]),
      });
    }
  }

  private processInternal(input: ExecutionIntentInput, prerequisites: ExecutionPrerequisites, boundaryKillReason: ExecutionResult["reason"] | null): ExecutionBoundaryResponse {
    const events: ExecutionAuditEvent[] = [];
    const occurredAt = (this.options.now ?? (() => new Date()))().toISOString();
    let identity = {
      intentId: "unvalidated-intent",
      idempotencyKey: "unvalidated-key",
      userId: "unvalidated-user",
      symbol: undefined as string | undefined,
    };
    const auditFailure = (reason: "EXECUTION_AUDIT_UNAVAILABLE" | "EXECUTION_AUDIT_INVALID"): ExecutionBoundaryResponse =>
      Object.freeze({ result: Object.freeze({ intentId: identity.intentId, idempotencyKey: identity.idempotencyKey, state: "blocked", executed: false, duplicate: false, reason, preview: null }), auditEvents: Object.freeze(events) });
    try { this.options.auditStore.readVerified(); } catch (error) { return auditFailure(executionAuditFailureCode(error)); }
    const audit = (kind: ExecutionAuditKind, reason?: ExecutionResult["reason"]) => {
      const event = createExecutionAuditEvent({ eventId: `airlock-${++this.sequence}`, occurredAt, kind, ...identity, ...(reason ? { reason } : {}) });
      this.options.auditStore.append(event, occurredAt);
      events.push(event);
    };
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
    const duplicateResult = (
      stored: ExecutionResult | null,
      intentId: string,
      idempotencyKey: string,
    ): ExecutionBoundaryResponse => {
      audit("duplicate-intent-detected", "DUPLICATE_INTENT");
      if (!stored) {
        return response(Object.freeze({
          intentId,
          idempotencyKey,
          state: "blocked",
          executed: false,
          duplicate: true,
          reason: "DUPLICATE_INTENT",
          preview: null,
        }));
      }
      return response(Object.freeze({ ...stored, duplicate: true, reason: "DUPLICATE_INTENT" }));
    };

    try { audit("intent-received"); } catch (error) { return auditFailure(executionAuditFailureCode(error)); }
    const validation = validateExecutionIntent(input, prerequisites, new Date(occurredAt));
    if (!validation.ok) {
      const reason = validation.rejections[0].code;
      const persistenceIdentity = executionStateIdentityFromInput(input);
      if (!persistenceIdentity) {
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
        intentId: persistenceIdentity.identity.intentId,
        idempotencyKey: persistenceIdentity.scope.idempotencyKey,
        userId: persistenceIdentity.scope.userId,
        symbol: persistenceIdentity.identity.symbol,
      };
      audit("validation-rejected", reason);
      try {
        const claim = this.options.stateStore.claim(
          persistenceIdentity.scope,
          persistenceIdentity.identity,
          occurredAt,
        );
        if (claim.kind === "duplicate") {
          return duplicateResult(
            claim.result,
            persistenceIdentity.identity.intentId,
            persistenceIdentity.scope.idempotencyKey,
          );
        }
      } catch (error) {
        return stateFailure(executionStateFailureCode(error));
      }
      return persist(persistenceIdentity.scope, Object.freeze({
        intentId: persistenceIdentity.identity.intentId,
        idempotencyKey: persistenceIdentity.scope.idempotencyKey,
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
        return duplicateResult(
          claim.result,
          validation.intent.intentId,
          validation.intent.idempotencyKey,
        );
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
        let providerResult: unknown = this.options.syntheticProviderFault === "malformed-result"
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
        if (this.options.syntheticObservation !== undefined) {
          const reconciliation = reconcileSyntheticProviderResult(providerResult, this.options.syntheticObservation);
          providerResult = Object.freeze({ ...providerResult, reconciliation });
          if (!isSyntheticProviderResult(providerResult)) throw new TypeError("Malformed synthetic reconciliation result");
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
