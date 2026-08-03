import "server-only";

import { createHash } from "node:crypto";

import type { MexcAccountAvailabilityState } from "./mexc-account-state-availability";
import type { MexcDizyPaperReconciliation } from "./mexc-dizypaper-reconciliation";
import type { MexcShadowOrderPreview } from "./mexc-shadow-order-preview";

export const MEXC_SHADOW_AUDIT_SCHEMA_VERSION =
  "mexc-shadow-audit/1.0.0" as const;

export type MexcShadowAuditKind =
  | "account-state-evaluated"
  | "reconciliation-computed"
  | "order-preview-computed";

export type MexcShadowAuditPayload =
  | Readonly<{
      kind: "account-state-evaluated";
      status: MexcAccountAvailabilityState["status"];
      decisionEligible: boolean;
      observedAtMs: number | null;
      assetCount: number | null;
      positionCount: number | null;
      failureReason: string | null;
      providerCode: number | null;
    }>
  | Readonly<{
      kind: "reconciliation-computed";
      exchangeObservedAtMs: number;
      settlementCurrency: string;
      aligned: number;
      different: number;
      incomparable: number;
      exchangeOnly: number;
      paperOnly: number;
      ambiguousExchange: number;
      reportDigest: string;
    }>
  | Readonly<{
      kind: "order-preview-computed";
      exchangeObservedAtMs: number;
      symbol: string;
      side: "long" | "short";
      marginMode: "isolated" | "cross";
      status: "calculable" | "blocked";
      blockerCount: number;
      blockerDigest: string;
      previewDigest: string;
    }>;

export type MexcShadowAuditEvent = Readonly<{
  schemaVersion: typeof MEXC_SHADOW_AUDIT_SCHEMA_VERSION;
  eventId: string;
  sequence: number;
  previousHash: string | null;
  eventHash: string;
  scopeDigest: string;
  occurredAtMs: number;
  payload: MexcShadowAuditPayload;
}>;

export type MexcShadowAuditSource =
  | Readonly<{
      sourceType: "account-state";
      state: MexcAccountAvailabilityState;
    }>
  | Readonly<{
      sourceType: "reconciliation";
      report: MexcDizyPaperReconciliation;
    }>
  | Readonly<{
      sourceType: "order-preview";
      preview: MexcShadowOrderPreview;
    }>;

export type MexcShadowAuditVerification = Readonly<{
  valid: boolean;
  eventCount: number;
  lastHash: string | null;
  scopeDigest: string | null;
  errors: readonly string[];
}>;

export class MexcShadowAuditError extends Error {
  constructor(
    public readonly kind:
      | "invalid-scope"
      | "invalid-time"
      | "invalid-previous-event"
      | "invalid-source",
    message: string,
  ) {
    super(message);
    this.name = "MexcShadowAuditError";
  }
}

const hashPattern = /^[a-f0-9]{64}$/;
const eventIdPattern = /^mexc-shadow-\d+-[a-f0-9]{20}$/;
const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const currencyPattern = /^[A-Z0-9]{1,20}$/;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value: unknown, seen: Set<object>): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Audit values must be finite.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Audit values cannot be cyclic.");
    seen.add(value);
    const result = value.map((entry) => canonicalValue(entry, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new TypeError("Audit values cannot be cyclic.");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry === undefined) throw new TypeError("Audit values cannot be undefined.");
      result[key] = canonicalValue(entry, seen);
    }
    seen.delete(value);
    return result;
  }
  throw new TypeError("Audit values contain an unsupported type.");
}

export function canonicalMexcShadowAuditJson(value: unknown) {
  return JSON.stringify(canonicalValue(value, new Set()));
}

function scopeDigest(scopeId: string) {
  if (
    typeof scopeId !== "string" ||
    scopeId.trim().length < 1 ||
    scopeId.trim().length > 256
  ) {
    throw new MexcShadowAuditError(
      "invalid-scope",
      "Shadow audit scope is invalid.",
    );
  }
  return sha256(`mexc-shadow-scope:v1:${scopeId}`);
}

function occurredAt(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MexcShadowAuditError(
      "invalid-time",
      "Shadow audit event time must be a positive safe integer.",
    );
  }
  return value;
}

function digestProjection(value: unknown) {
  return sha256(canonicalMexcShadowAuditJson(value));
}

function accountStatePayload(
  state: MexcAccountAvailabilityState,
): MexcShadowAuditPayload {
  const snapshot = state.status === "fresh" || state.status === "stale"
    ? state.snapshot
    : null;
  return Object.freeze({
    kind: "account-state-evaluated",
    status: state.status,
    decisionEligible: state.decisionEligible,
    observedAtMs: snapshot?.observedAtMs ?? null,
    assetCount: snapshot?.summary.assetCount ?? null,
    positionCount: snapshot?.summary.openPositionCount ?? null,
    failureReason:
      state.status === "unavailable"
        ? state.failure.reason
        : state.status === "stale"
          ? state.failure?.reason ?? state.staleReason
          : null,
    providerCode: state.status === "fresh" ? null : state.failure?.providerCode ?? null,
  });
}

function reconciliationPayload(
  report: MexcDizyPaperReconciliation,
): MexcShadowAuditPayload {
  const projection = {
    method: report.calculationMethod,
    exchangeObservedAtMs: report.exchangeObservedAtMs,
    settlementCurrency: report.settlementCurrency,
    summary: report.summary,
  };
  return Object.freeze({
    kind: "reconciliation-computed",
    exchangeObservedAtMs: report.exchangeObservedAtMs,
    settlementCurrency: report.settlementCurrency,
    aligned: report.summary.aligned,
    different: report.summary.different,
    incomparable: report.summary.incomparable,
    exchangeOnly: report.summary.exchangeOnly,
    paperOnly: report.summary.paperOnly,
    ambiguousExchange: report.summary.ambiguousExchange,
    reportDigest: digestProjection(projection),
  });
}

function previewPayload(preview: MexcShadowOrderPreview): MexcShadowAuditPayload {
  const blockers = [...preview.blockers].sort();
  const projection = {
    method: preview.calculationMethod,
    exchangeObservedAtMs: preview.exchangeObservedAtMs,
    symbol: preview.symbol,
    side: preview.side,
    marginMode: preview.marginMode,
    status: preview.status,
    blockers,
    hypotheticalOnly: preview.hypotheticalOnly,
    executable: preview.executable,
  };
  return Object.freeze({
    kind: "order-preview-computed",
    exchangeObservedAtMs: preview.exchangeObservedAtMs,
    symbol: preview.symbol,
    side: preview.side,
    marginMode: preview.marginMode,
    status: preview.status,
    blockerCount: blockers.length,
    blockerDigest: digestProjection(blockers),
    previewDigest: digestProjection(projection),
  });
}

export function mexcShadowAuditPayload(
  source: MexcShadowAuditSource,
): MexcShadowAuditPayload {
  if (!source || typeof source !== "object") {
    throw new MexcShadowAuditError("invalid-source", "Shadow audit source is invalid.");
  }
  switch (source.sourceType) {
    case "account-state":
      return accountStatePayload(source.state);
    case "reconciliation":
      return reconciliationPayload(source.report);
    case "order-preview":
      return previewPayload(source.preview);
    default:
      throw new MexcShadowAuditError(
        "invalid-source",
        "Shadow audit source type is unsupported.",
      );
  }
}

function eventCore(input: Readonly<{
  sequence: number;
  previousHash: string | null;
  scopeDigest: string;
  occurredAtMs: number;
  payload: MexcShadowAuditPayload;
}>) {
  return Object.freeze({
    schemaVersion: MEXC_SHADOW_AUDIT_SCHEMA_VERSION,
    sequence: input.sequence,
    previousHash: input.previousHash,
    scopeDigest: input.scopeDigest,
    occurredAtMs: input.occurredAtMs,
    payload: input.payload,
  });
}

export function appendMexcShadowAuditEvent(input: Readonly<{
  previous: MexcShadowAuditEvent | null;
  scopeId: string;
  occurredAtMs: number;
  source: MexcShadowAuditSource;
}>): MexcShadowAuditEvent {
  const digest = scopeDigest(input.scopeId);
  const time = occurredAt(input.occurredAtMs);
  if (input.previous) {
    const previousVerification = verifyMexcShadowAuditChain([input.previous]);
    if (!previousVerification.valid || input.previous.scopeDigest !== digest) {
      throw new MexcShadowAuditError(
        "invalid-previous-event",
        "Previous shadow audit event is invalid or belongs to another scope.",
      );
    }
    if (time < input.previous.occurredAtMs) {
      throw new MexcShadowAuditError(
        "invalid-time",
        "Shadow audit event time cannot move backwards.",
      );
    }
  }

  const sequence = (input.previous?.sequence ?? 0) + 1;
  const previousHash = input.previous?.eventHash ?? null;
  const payload = mexcShadowAuditPayload(input.source);
  const core = eventCore({
    sequence,
    previousHash,
    scopeDigest: digest,
    occurredAtMs: time,
    payload,
  });
  const eventHash = sha256(canonicalMexcShadowAuditJson(core));
  return Object.freeze({
    ...core,
    eventId: `mexc-shadow-${sequence}-${eventHash.slice(0, 20)}`,
    eventHash,
  });
}

function eventErrors(
  event: unknown,
  index: number,
  previous: MexcShadowAuditEvent | null,
  expectedScope: string | null,
) {
  const errors: string[] = [];
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return [`event ${index + 1} is not an object`];
  }
  const candidate = event as Partial<MexcShadowAuditEvent>;
  if (candidate.schemaVersion !== MEXC_SHADOW_AUDIT_SCHEMA_VERSION) {
    errors.push(`event ${index + 1} has an unsupported schema`);
  }
  if (!Number.isSafeInteger(candidate.sequence) || candidate.sequence !== index + 1) {
    errors.push(`event ${index + 1} has an invalid sequence`);
  }
  if (
    typeof candidate.scopeDigest !== "string" ||
    !hashPattern.test(candidate.scopeDigest)
  ) {
    errors.push(`event ${index + 1} has an invalid scope digest`);
  } else if (expectedScope && candidate.scopeDigest !== expectedScope) {
    errors.push(`event ${index + 1} changes audit scope`);
  }
  if (
    !Number.isSafeInteger(candidate.occurredAtMs) ||
    (candidate.occurredAtMs ?? 0) <= 0 ||
    (previous && (candidate.occurredAtMs ?? 0) < previous.occurredAtMs)
  ) {
    errors.push(`event ${index + 1} has an invalid event time`);
  }
  const expectedPreviousHash = previous?.eventHash ?? null;
  if (candidate.previousHash !== expectedPreviousHash) {
    errors.push(`event ${index + 1} has an invalid previous hash`);
  }
  if (!candidate.payload || typeof candidate.payload !== "object") {
    errors.push(`event ${index + 1} has an invalid payload`);
  }
  if (
    typeof candidate.eventHash !== "string" ||
    !hashPattern.test(candidate.eventHash)
  ) {
    errors.push(`event ${index + 1} has an invalid event hash`);
  } else if (candidate.payload && candidate.scopeDigest && candidate.occurredAtMs) {
    try {
      const expectedHash = sha256(
        canonicalMexcShadowAuditJson(
          eventCore({
            sequence: candidate.sequence as number,
            previousHash: candidate.previousHash ?? null,
            scopeDigest: candidate.scopeDigest,
            occurredAtMs: candidate.occurredAtMs,
            payload: candidate.payload,
          }),
        ),
      );
      if (expectedHash !== candidate.eventHash) {
        errors.push(`event ${index + 1} hash does not match its content`);
      }
      if (candidate.eventId !== `mexc-shadow-${candidate.sequence}-${expectedHash.slice(0, 20)}`) {
        errors.push(`event ${index + 1} has an invalid event ID`);
      }
    } catch {
      errors.push(`event ${index + 1} cannot be canonicalised`);
    }
  }
  if (
    typeof candidate.eventId !== "string" ||
    !eventIdPattern.test(candidate.eventId)
  ) {
    errors.push(`event ${index + 1} has a malformed event ID`);
  }
  return errors;
}

export function verifyMexcShadowAuditChain(
  events: readonly unknown[],
): MexcShadowAuditVerification {
  if (!Array.isArray(events)) {
    return Object.freeze({
      valid: false,
      eventCount: 0,
      lastHash: null,
      scopeDigest: null,
      errors: Object.freeze(["audit chain must be an array"]),
    });
  }
  const errors: string[] = [];
  let previous: MexcShadowAuditEvent | null = null;
  let expectedScope: string | null = null;
  for (const [index, event] of events.entries()) {
    const currentErrors = eventErrors(event, index, previous, expectedScope);
    errors.push(...currentErrors);
    if (currentErrors.length === 0) {
      previous = event as MexcShadowAuditEvent;
      expectedScope ??= previous.scopeDigest;
    } else {
      previous = null;
    }
  }
  return Object.freeze({
    valid: errors.length === 0,
    eventCount: events.length,
    lastHash: errors.length === 0 ? previous?.eventHash ?? null : null,
    scopeDigest: errors.length === 0 ? expectedScope : null,
    errors: Object.freeze(errors),
  });
}

export function assertMexcShadowAuditPayloadIsMinimised(
  payload: MexcShadowAuditPayload,
) {
  const serialised = canonicalMexcShadowAuditJson(payload);
  if (
    /api[_-]?key|api[_-]?secret|signature|password|authorization|cookie|session[_-]?token/i.test(
      serialised,
    )
  ) {
    throw new MexcShadowAuditError(
      "invalid-source",
      "Shadow audit payload contains a forbidden secret-bearing field.",
    );
  }
  if (Buffer.byteLength(serialised) > 4_096) {
    throw new MexcShadowAuditError(
      "invalid-source",
      "Shadow audit payload exceeds the minimised size limit.",
    );
  }
  return true;
}
