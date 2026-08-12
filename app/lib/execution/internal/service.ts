import "server-only";

import { createExecutionAuditEvent } from "./audit";
import { NonExecutingExecutionAdapter, type ExecutionAdapter } from "./adapter";
import { executionCapabilityGate } from "./gate";
import type { ExecutionAuditEvent, ExecutionAuditKind, ExecutionBoundaryResponse, ExecutionPrerequisites, ExecutionResult } from "../types";
import { validateExecutionIntent, type ExecutionIntentInput } from "./validation";
import { createExecutionPreview } from "./preview";

type ServiceOptions = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
}>;

export class ExecutionAirlockService {
  private readonly processed = new Map<string, ExecutionResult>();
  private sequence = 0;
  private readonly adapter: ExecutionAdapter = new NonExecutingExecutionAdapter();

  constructor(private readonly options: ServiceOptions = {}) {}

  /** @internal Only ExecutionBoundary may call this implementation. */
  process(input: ExecutionIntentInput, prerequisites: ExecutionPrerequisites, boundaryKillReason: ExecutionResult["reason"]): ExecutionBoundaryResponse {
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
    const reason = gate.reason === "adapter-unavailable" ? "ADAPTER_UNAVAILABLE" : boundaryKillReason;
    audit(reason === "ADAPTER_UNAVAILABLE" ? "adapter-unavailable" : "kill-switch-active", reason);
    const result = this.adapter.prepare(validation.intent, createExecutionPreview(validation.intent, prerequisites), reason);
    audit("execution-blocked", reason);
    this.processed.set(idempotencyScope, result);
    return Object.freeze({ result, auditEvents: Object.freeze(events) });
  }
}
