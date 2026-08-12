import "server-only";

import { createExecutionAuditEvent, type ExecutionAuditEvent, type ExecutionAuditKind } from "./audit";
import { NonExecutingExecutionAdapter, type ExecutionAdapter } from "./adapter";
import { executionCapabilityGate } from "./gate";
import { defaultExecutionKillSwitches, executionKillSwitchReason, type ExecutionKillSwitches } from "./kill-switch";
import type { ExecutionResult } from "./types";
import { validateExecutionIntent, type ExecutionIntentInput, type ExecutionPrerequisites } from "./validation";

export type ExecutionServiceResponse = Readonly<{
  result: ExecutionResult;
  auditEvents: readonly ExecutionAuditEvent[];
}>;

type ServiceOptions = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  killSwitches?: ExecutionKillSwitches;
  now?: () => Date;
}>;

export class ExecutionAirlockService {
  private readonly processed = new Map<string, ExecutionResult>();
  private sequence = 0;
  private readonly adapter: ExecutionAdapter = new NonExecutingExecutionAdapter();

  constructor(private readonly options: ServiceOptions = {}) {}

  process(input: ExecutionIntentInput, prerequisites: ExecutionPrerequisites): ExecutionServiceResponse {
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
    const validation = validateExecutionIntent(input, prerequisites);
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
    const switches = this.options.killSwitches ?? defaultExecutionKillSwitches();
    const killReason = executionKillSwitchReason(switches, validation.intent);
    const reason = gate.reason === "adapter-unavailable" ? "ADAPTER_UNAVAILABLE" : killReason;
    audit(reason === "ADAPTER_UNAVAILABLE" ? "adapter-unavailable" : "kill-switch-active", reason);
    const result = this.adapter.prepare(validation.intent, reason);
    audit("execution-blocked", reason);
    this.processed.set(idempotencyScope, result);
    return Object.freeze({ result, auditEvents: Object.freeze(events) });
  }
}
