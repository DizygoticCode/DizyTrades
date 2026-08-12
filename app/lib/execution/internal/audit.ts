import "server-only";

import { createHash } from "node:crypto";

import type { ExecutionAuditEvent, ExecutionAuditKind, ExecutionBlockCode, ExecutionRejectionCode } from "../types";

const safeValue = /^[a-zA-Z0-9_:-]{1,120}$/;
const forbiddenField = /api.?key|secret|signature|authorization|credential|cookie|session|token|password/i;

const digest = (namespace: string, value: string) =>
  createHash("sha256").update(`${namespace}:${value}`, "utf8").digest("hex");

export function createExecutionAuditEvent(input: Readonly<{
  eventId: string;
  occurredAt: string;
  kind: ExecutionAuditKind;
  intentId: string;
  idempotencyKey: string;
  userId: string;
  symbol?: string;
  reason?: ExecutionBlockCode | ExecutionRejectionCode;
}>): ExecutionAuditEvent {
  for (const field of Object.keys(input)) {
    if (forbiddenField.test(field) && field !== "idempotencyKey") throw new TypeError("Sensitive execution audit field is forbidden.");
  }
  if (!safeValue.test(input.eventId) || !safeValue.test(input.intentId) || !Number.isFinite(Date.parse(input.occurredAt))) {
    throw new TypeError("Execution audit identity or timestamp is invalid.");
  }
  return Object.freeze({
    schemaVersion: "execution-audit/1.0.0",
    eventId: input.eventId,
    occurredAt: input.occurredAt,
    kind: input.kind,
    intentId: input.intentId,
    idempotencyDigest: digest("execution-idempotency", input.idempotencyKey),
    actorDigest: digest("execution-actor", input.userId),
    ...(input.symbol ? { symbol: input.symbol } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  });
}
