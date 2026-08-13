import "server-only";

import { createExecutionAuditEvent } from "./audit";
import { NonExecutingExecutionAdapter, type ExecutionAdapter } from "./adapter";
import { executionCapabilityGate } from "./gate";
import type { ExecutionAuditEvent, ExecutionAuditKind, ExecutionBoundaryResponse, ExecutionPrerequisites, ExecutionResult, SyntheticProviderScenario } from "../types";
import { validateExecutionIntent, type ExecutionIntentInput } from "./validation";
import { createExecutionPreview } from "./preview";
import { evaluateSyntheticProvider, isSyntheticProviderResult } from "./provider";
import { ExecutionStateStore } from "./state-store";

type ServiceOptions = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  syntheticProviderScenario?: SyntheticProviderScenario;
  syntheticProviderFault?: "exception" | "malformed-result";
  executionStatePath?: string;
}>;

export class ExecutionAirlockService {
  private readonly stateStore: ExecutionStateStore;
  private sequence = 0;
  private readonly adapter: ExecutionAdapter = new NonExecutingExecutionAdapter();

  constructor(private readonly options: ServiceOptions = {}) {
    this.stateStore = new ExecutionStateStore(options.executionStatePath);
  }

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
    audit("intent-received");
    const validation = validateExecutionIntent(input, prerequisites, new Date(occurredAt));
    if (!validation.ok) {
      const reason = validation.rejections[0].code;
      audit("validation-rejected", reason);
      return Object.freeze({
        result: Object.freeze({ intentId: identity.intentId, idempotencyKey: identity.idempotencyKey, state: "rejected", executed: false, duplicate: false, reason, preview: null }),
        auditEvents: Object.freeze(events),
      });
    }
    identity = {
      intentId: validation.intent.intentId,
      idempotencyKey: validation.intent.idempotencyKey,
      userId: validation.intent.userId,
      symbol: validation.intent.symbol,
    };
    audit("validation-passed");
    const claim = this.stateStore.claim(validation.intent.userId, validation.intent.accountId, validation.intent.idempotencyKey, occurredAt);
    if (claim.kind === "duplicate") {
      audit("duplicate-intent-detected", "DUPLICATE_INTENT");
      return Object.freeze({ result: Object.freeze({ ...claim.result, duplicate: true, reason: "DUPLICATE_INTENT" }), auditEvents: Object.freeze(events) });
    }
    if (claim.kind === "unavailable") {
      audit("execution-blocked", "EXECUTION_STATE_UNAVAILABLE");
      return Object.freeze({ result: Object.freeze({ intentId: validation.intent.intentId, idempotencyKey: validation.intent.idempotencyKey, state: "blocked", executed: false, duplicate: false, reason: "EXECUTION_STATE_UNAVAILABLE", preview: null }), auditEvents: Object.freeze(events) });
    }
    const persist = (result: ExecutionResult) => this.stateStore.complete(validation.intent.userId, validation.intent.accountId, validation.intent.idempotencyKey, result, occurredAt);
    const durable = (result: ExecutionResult): ExecutionResult => persist(result) ? result : Object.freeze({ intentId: validation.intent.intentId, idempotencyKey: validation.intent.idempotencyKey, state: "blocked", executed: false, duplicate: false, reason: "EXECUTION_STATE_UNAVAILABLE", preview: null });
    const gate = executionCapabilityGate(this.options.environment);
    const reason = gate.reason === "adapter-unavailable" ? "ADAPTER_UNAVAILABLE" : (boundaryKillReason ?? "GLOBAL_EXECUTION_DISABLED");
    const preview = createExecutionPreview(validation.intent, prerequisites);
    if (this.options.syntheticProviderScenario && !boundaryKillReason && gate.reason === "disabled") {
      try {
        if (this.options.syntheticProviderFault === "exception") throw new Error("Synthetic provider fault");
        const providerResult: unknown = this.options.syntheticProviderFault === "malformed-result"
          ? Object.freeze({ executed: true })
          : evaluateSyntheticProvider(this.options.syntheticProviderScenario, { intent: validation.intent, preview });
        if (!isSyntheticProviderResult(providerResult)) {
          audit("provider-failed", "PROVIDER_MALFORMED_RESULT");
          const result = Object.freeze({ intentId: validation.intent.intentId, idempotencyKey: validation.intent.idempotencyKey, state: "blocked" as const, executed: false as const, duplicate: false, reason: "PROVIDER_MALFORMED_RESULT" as const, preview });
          return Object.freeze({ result: durable(result), auditEvents: Object.freeze(events) });
        }
        audit("provider-evaluated", "SYNTHETIC_PROVIDER_OUTCOME");
        const result = Object.freeze({ intentId: validation.intent.intentId, idempotencyKey: validation.intent.idempotencyKey, state: "prepared" as const, executed: false as const, duplicate: false, reason: "SYNTHETIC_PROVIDER_OUTCOME" as const, preview, providerResult });
        return Object.freeze({ result: durable(result), auditEvents: Object.freeze(events) });
      } catch {
        audit("provider-failed", "PROVIDER_EXCEPTION");
        const result = Object.freeze({ intentId: validation.intent.intentId, idempotencyKey: validation.intent.idempotencyKey, state: "blocked" as const, executed: false as const, duplicate: false, reason: "PROVIDER_EXCEPTION" as const, preview });
        return Object.freeze({ result: durable(result), auditEvents: Object.freeze(events) });
      }
    }
    audit(reason === "ADAPTER_UNAVAILABLE" ? "adapter-unavailable" : "kill-switch-active", reason);
    const result = this.adapter.prepare(validation.intent, preview, reason);
    audit("execution-blocked", reason);
    return Object.freeze({ result: durable(result), auditEvents: Object.freeze(events) });
  }
}
