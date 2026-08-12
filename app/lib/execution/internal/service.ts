import "server-only";

import { createExecutionAuditEvent } from "./audit";
import { NonExecutingExecutionAdapter, type ExecutionAdapter } from "./adapter";
import { executionCapabilityGate } from "./gate";
import type { ExecutionAuditEvent, ExecutionAuditKind, ExecutionBoundaryResponse, ExecutionPrerequisites, ExecutionResult, SyntheticProviderScenario } from "../types";
import { validateExecutionIntent, type ExecutionIntentInput } from "./validation";
import { createExecutionPreview } from "./preview";
import { evaluateSyntheticProvider, isSyntheticProviderResult } from "./provider";

type ServiceOptions = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  syntheticProviderScenario?: SyntheticProviderScenario;
  syntheticProviderFault?: "exception" | "malformed-result";
}>;

export class ExecutionAirlockService {
  private readonly processed = new Map<string, ExecutionResult>();
  private sequence = 0;
  private readonly adapter: ExecutionAdapter = new NonExecutingExecutionAdapter();

  constructor(private readonly options: ServiceOptions = {}) {}

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
    const idempotencyScope = JSON.stringify([
      validation.intent.userId,
      validation.intent.accountId,
      validation.intent.idempotencyKey,
    ]);
    const duplicate = this.processed.get(idempotencyScope);
    if (duplicate) {
      audit("duplicate-intent-detected", "DUPLICATE_INTENT");
      return Object.freeze({ result: Object.freeze({ ...duplicate, duplicate: true, reason: "DUPLICATE_INTENT" }), auditEvents: Object.freeze(events) });
    }
    const gate = executionCapabilityGate(this.options.environment);
    const reason = gate.reason === "adapter-unavailable" ? "ADAPTER_UNAVAILABLE" : (boundaryKillReason ?? "GLOBAL_EXECUTION_DISABLED");
    const preview = createExecutionPreview(validation.intent, prerequisites);
    if (this.options.syntheticProviderScenario && !boundaryKillReason && gate.reason !== "adapter-unavailable") {
      try {
        if (this.options.syntheticProviderFault === "exception") throw new Error("Synthetic provider fault");
        const providerResult: unknown = this.options.syntheticProviderFault === "malformed-result"
          ? Object.freeze({ executed: true })
          : evaluateSyntheticProvider(this.options.syntheticProviderScenario, { intent: validation.intent, preview });
        if (!isSyntheticProviderResult(providerResult)) {
          audit("provider-failed", "PROVIDER_MALFORMED_RESULT");
          return Object.freeze({ result: Object.freeze({ intentId: validation.intent.intentId, idempotencyKey: validation.intent.idempotencyKey, state: "blocked", executed: false, duplicate: false, reason: "PROVIDER_MALFORMED_RESULT", preview }), auditEvents: Object.freeze(events) });
        }
        audit("provider-evaluated", "SYNTHETIC_PROVIDER_OUTCOME");
        const result = Object.freeze({ intentId: validation.intent.intentId, idempotencyKey: validation.intent.idempotencyKey, state: "prepared" as const, executed: false as const, duplicate: false, reason: "SYNTHETIC_PROVIDER_OUTCOME" as const, preview, providerResult });
        this.processed.set(idempotencyScope, result);
        return Object.freeze({ result, auditEvents: Object.freeze(events) });
      } catch {
        audit("provider-failed", "PROVIDER_EXCEPTION");
        return Object.freeze({ result: Object.freeze({ intentId: validation.intent.intentId, idempotencyKey: validation.intent.idempotencyKey, state: "blocked", executed: false, duplicate: false, reason: "PROVIDER_EXCEPTION", preview }), auditEvents: Object.freeze(events) });
      }
    }
    audit(reason === "ADAPTER_UNAVAILABLE" ? "adapter-unavailable" : "kill-switch-active", reason);
    const result = this.adapter.prepare(validation.intent, preview, reason);
    audit("execution-blocked", reason);
    this.processed.set(idempotencyScope, result);
    return Object.freeze({ result, auditEvents: Object.freeze(events) });
  }
}
