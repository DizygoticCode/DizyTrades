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
const failureReasonPattern = /^[a-z0-9-]{1,64}$/;
const sensitiveFieldPattern =
  /api[_-]?key|api[_-]?secret|signature|password|authorization|cookie|session[_-]?token/i;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  if (typeof scopeId !== "string") {
    throw new MexcShadowAuditError(
      "invalid-scope",
      "Shadow audit scope is invalid.",
    );
  }
  const normalised = scopeId.trim();
  if (normalised.length < 1 || normalised.length > 256) {
    throw new MexcShadowAuditError(
      "invalid-scope",
      "Shadow audit scope is invalid.",
    );
  }
  return sha256(`mexc-shadow-scope:v1:${normalised}`);
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
  let payload: MexcShadowAuditPayload;
  switch (source.sourceType) {
    case "account-state":
      payload = accountStatePayload(source.state);
      break;
    case "reconciliation":
      payload = reconciliationPayload(source.report);
      break;
    case "order-preview":
      payload = previewPayload(source.preview);
      break;
    default:
      throw new MexcShadowAuditError(
        "invalid-source",
        "Shadow audit source type is unsupported.",
      );
  }
  assertMexcShadowAuditPayloadIsMinimised(payload);
  return payload;
}

function exactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
) {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nullablePositiveSafeInteger(value: unknown) {
  return value === null || positiveSafeInteger(value);
}

function nullableNonNegativeSafeInteger(value: unknown) {
  return value === null || nonNegativeSafeInteger(value);
}

function payloadErrors(payload: unknown) {
  const errors: string[] = [];
  if (!isRecord(payload) || typeof payload.kind !== "string") {
    return ["payload is not a supported object"];
  }
  try {
    assertMexcShadowAuditPayloadIsMinimised(payload as MexcShadowAuditPayload);
  } catch {
    errors.push("payload is not minimised");
  }

  switch (payload.kind) {
    case "account-state-evaluated": {
      const expected = [
        "kind",
        "status",
        "decisionEligible",
        "observedAtMs",
        "assetCount",
        "positionCount",
        "failureReason",
        "providerCode",
      ];
      if (!exactKeys(payload, expected)) errors.push("account payload fields are invalid");
      if (!(["fresh", "stale", "unavailable"] as const).includes(payload.status as never)) {
        errors.push("account payload status is invalid");
      }
      if (typeof payload.decisionEligible !== "boolean") {
        errors.push("account decision eligibility is invalid");
      }
      if (!nullablePositiveSafeInteger(payload.observedAtMs)) {
        errors.push("account observation time is invalid");
      }
      if (!nullableNonNegativeSafeInteger(payload.assetCount)) {
        errors.push("account asset count is invalid");
      }
      if (!nullableNonNegativeSafeInteger(payload.positionCount)) {
        errors.push("account position count is invalid");
      }
      if (
        payload.failureReason !== null &&
        (typeof payload.failureReason !== "string" ||
          !failureReasonPattern.test(payload.failureReason))
      ) {
        errors.push("account failure reason is invalid");
      }
      if (!nullableNonNegativeSafeInteger(payload.providerCode)) {
        errors.push("account provider code is invalid");
      }
      if (payload.status === "fresh") {
        if (payload.decisionEligible !== true) errors.push("fresh account is not decision eligible");
        if (
          payload.observedAtMs === null ||
          payload.assetCount === null ||
          payload.positionCount === null ||
          payload.failureReason !== null ||
          payload.providerCode !== null
        ) {
          errors.push("fresh account payload is inconsistent");
        }
      } else if (payload.status === "stale") {
        if (payload.decisionEligible !== false) errors.push("stale account is decision eligible");
        if (
          payload.observedAtMs === null ||
          payload.assetCount === null ||
          payload.positionCount === null ||
          payload.failureReason === null
        ) {
          errors.push("stale account payload is inconsistent");
        }
      } else if (payload.status === "unavailable") {
        if (payload.decisionEligible !== false) errors.push("unavailable account is decision eligible");
        if (
          payload.observedAtMs !== null ||
          payload.assetCount !== null ||
          payload.positionCount !== null ||
          payload.failureReason === null
        ) {
          errors.push("unavailable account payload is inconsistent");
        }
      }
      break;
    }
    case "reconciliation-computed": {
      const expected = [
        "kind",
        "exchangeObservedAtMs",
        "settlementCurrency",
        "aligned",
        "different",
        "incomparable",
        "exchangeOnly",
        "paperOnly",
        "ambiguousExchange",
        "reportDigest",
      ];
      if (!exactKeys(payload, expected)) errors.push("reconciliation payload fields are invalid");
      if (!positiveSafeInteger(payload.exchangeObservedAtMs)) {
        errors.push("reconciliation observation time is invalid");
      }
      if (
        typeof payload.settlementCurrency !== "string" ||
        !currencyPattern.test(payload.settlementCurrency)
      ) {
        errors.push("reconciliation settlement currency is invalid");
      }
      for (const field of [
        "aligned",
        "different",
        "incomparable",
        "exchangeOnly",
        "paperOnly",
        "ambiguousExchange",
      ] as const) {
        if (!nonNegativeSafeInteger(payload[field])) {
          errors.push(`reconciliation ${field} count is invalid`);
        }
      }
      if (typeof payload.reportDigest !== "string" || !hashPattern.test(payload.reportDigest)) {
        errors.push("reconciliation report digest is invalid");
      }
      break;
    }
    case "order-preview-computed": {
      const expected = [
        "kind",
        "exchangeObservedAtMs",
        "symbol",
        "side",
        "marginMode",
        "status",
        "blockerCount",
        "blockerDigest",
        "previewDigest",
      ];
      if (!exactKeys(payload, expected)) errors.push("preview payload fields are invalid");
      if (!positiveSafeInteger(payload.exchangeObservedAtMs)) {
        errors.push("preview observation time is invalid");
      }
      if (typeof payload.symbol !== "string" || !symbolPattern.test(payload.symbol)) {
        errors.push("preview symbol is invalid");
      }
      if (payload.side !== "long" && payload.side !== "short") {
        errors.push("preview side is invalid");
      }
      if (payload.marginMode !== "isolated" && payload.marginMode !== "cross") {
        errors.push("preview margin mode is invalid");
      }
      if (payload.status !== "calculable" && payload.status !== "blocked") {
        errors.push("preview status is invalid");
      }
      if (!nonNegativeSafeInteger(payload.blockerCount)) {
        errors.push("preview blocker count is invalid");
      }
      if (typeof payload.blockerDigest !== "string" || !hashPattern.test(payload.blockerDigest)) {
        errors.push("preview blocker digest is invalid");
      }
      if (typeof payload.previewDigest !== "string" || !hashPattern.test(payload.previewDigest)) {
        errors.push("preview digest is invalid");
      }
      break;
    }
    default:
      errors.push("payload kind is unsupported");
  }
  return errors;
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

function selfEventErrors(event: unknown) {
  const errors: string[] = [];
  if (!isRecord(event)) return ["event is not an object"];
  const expectedEnvelope = [
    "schemaVersion",
    "eventId",
    "sequence",
    "previousHash",
    "eventHash",
    "scopeDigest",
    "occurredAtMs",
    "payload",
  ];
  if (!exactKeys(event, expectedEnvelope)) {
    errors.push("event envelope fields are invalid");
  }
  if (event.schemaVersion !== MEXC_SHADOW_AUDIT_SCHEMA_VERSION) {
    errors.push("event has an unsupported schema");
  }
  if (!positiveSafeInteger(event.sequence)) {
    errors.push("event has an invalid sequence");
  }
  if (typeof event.scopeDigest !== "string" || !hashPattern.test(event.scopeDigest)) {
    errors.push("event has an invalid scope digest");
  }
  if (!positiveSafeInteger(event.occurredAtMs)) {
    errors.push("event has an invalid event time");
  }
  if (
    event.previousHash !== null &&
    (typeof event.previousHash !== "string" || !hashPattern.test(event.previousHash))
  ) {
    errors.push("event has an invalid previous hash");
  }
  const currentPayloadErrors = payloadErrors(event.payload);
  errors.push(...currentPayloadErrors);
  if (typeof event.eventHash !== "string" || !hashPattern.test(event.eventHash)) {
    errors.push("event has an invalid event hash");
  }
  if (typeof event.eventId !== "string" || !eventIdPattern.test(event.eventId)) {
    errors.push("event has a malformed event ID");
  }
  if (
    positiveSafeInteger(event.sequence) &&
    typeof event.scopeDigest === "string" &&
    hashPattern.test(event.scopeDigest) &&
    positiveSafeInteger(event.occurredAtMs) &&
    (event.previousHash === null ||
      (typeof event.previousHash === "string" && hashPattern.test(event.previousHash))) &&
    currentPayloadErrors.length === 0
  ) {
    try {
      const expectedHash = sha256(
        canonicalMexcShadowAuditJson(
          eventCore({
            sequence: event.sequence,
            previousHash: event.previousHash,
            scopeDigest: event.scopeDigest,
            occurredAtMs: event.occurredAtMs,
            payload: event.payload as MexcShadowAuditPayload,
          }),
        ),
      );
      if (event.eventHash !== expectedHash) {
        errors.push("event hash does not match its content");
      }
      if (event.eventId !== `mexc-shadow-${event.sequence}-${expectedHash.slice(0, 20)}`) {
        errors.push("event has an invalid event ID");
      }
    } catch {
      errors.push("event cannot be canonicalised");
    }
  }
  return [...new Set(errors)];
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
    const previousErrors = selfEventErrors(input.previous);
    if (previousErrors.length > 0 || input.previous.scopeDigest !== digest) {
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
  assertMexcShadowAuditPayloadIsMinimised(payload);
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

function chainEventErrors(
  event: unknown,
  index: number,
  previous: MexcShadowAuditEvent | null,
  expectedScope: string | null,
) {
  const errors = selfEventErrors(event).map(
    (error) => `event ${index + 1} ${error}`,
  );
  if (!isRecord(event)) return errors;
  if (event.sequence !== index + 1) {
    errors.push(`event ${index + 1} has an invalid chain sequence`);
  }
  const expectedPreviousHash = previous?.eventHash ?? null;
  if (event.previousHash !== expectedPreviousHash) {
    errors.push(`event ${index + 1} has an invalid chain previous hash`);
  }
  if (
    expectedScope &&
    typeof event.scopeDigest === "string" &&
    event.scopeDigest !== expectedScope
  ) {
    errors.push(`event ${index + 1} changes audit scope`);
  }
  if (
    previous &&
    typeof event.occurredAtMs === "number" &&
    event.occurredAtMs < previous.occurredAtMs
  ) {
    errors.push(`event ${index + 1} moves event time backwards`);
  }
  return [...new Set(errors)];
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
    const currentErrors = chainEventErrors(event, index, previous, expectedScope);
    errors.push(...currentErrors);
    if (currentErrors.length === 0) {
      previous = event as MexcShadowAuditEvent;
      expectedScope ??= previous.scopeDigest;
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
  if (sensitiveFieldPattern.test(serialised)) {
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
