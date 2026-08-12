import assert from "node:assert/strict";
import test from "node:test";

import { createExecutionAuditEvent } from "../app/lib/execution/audit.ts";
import { executionCapabilityGate } from "../app/lib/execution/gate.ts";
import { executionKillSwitchReason } from "../app/lib/execution/kill-switch.ts";
import { ExecutionAirlockService } from "../app/lib/execution/service.ts";
import { validateExecutionIntent } from "../app/lib/execution/validation.ts";

const contract = Object.freeze({
  symbol: "BTC_USDT", displayName: "BTC USDT", contractSize: 0.0001,
  minLeverage: 1, maxLeverage: 100, priceUnit: 0.1, volUnit: 1,
  minVol: 1, maxVol: 100_000, makerFeeRate: 0, takerFeeRate: 0.0002,
  maintenanceMarginRate: 0.004, initialMarginRate: 0.01,
  positionOpenType: 3, riskLimitType: "BY_VOLUME",
});
const prerequisites = Object.freeze({ contracts: new Map([[contract.symbol, contract]]), accountStateFresh: true });
const valid = Object.freeze({
  intentId: "intent-0001", idempotencyKey: "idempotency-0001",
  userId: "user-1", accountId: "account-1", symbol: "BTC_USDT",
  marketType: "futures", side: "long", orderType: "limit", quantity: 0.001,
  price: 65000, leverage: 10, reduceOnly: false, source: "manual",
  createdAt: "2026-08-12T12:00:00.000Z",
});

test("execution capability defaults and malformed configuration fail closed", () => {
  assert.deepEqual(executionCapabilityGate({}), { configured: false, enabled: false, reason: "absent" });
  assert.deepEqual(executionCapabilityGate({ LIVE_TRADING_ENABLED: "false" }), { configured: true, enabled: false, reason: "disabled" });
  assert.deepEqual(executionCapabilityGate({ LIVE_TRADING_ENABLED: "TRUE" }), { configured: true, enabled: false, reason: "malformed" });
  assert.deepEqual(executionCapabilityGate({ LIVE_TRADING_ENABLED: "true" }), { configured: true, enabled: false, reason: "adapter-unavailable" });
});

test("valid intent is structurally validated into an immutable domain object", () => {
  const result = validateExecutionIntent(valid, prerequisites);
  assert.equal(result.ok, true);
  assert.equal(Object.isFrozen(result.intent), true);
  assert.equal(result.intent.contractVersion, "execution-airlock/1.0.0");
  assert.throws(() => { result.intent.quantity = 2; }, TypeError);
});

test("invalid intent returns useful typed structural rejection reasons", () => {
  const result = validateExecutionIntent({ ...valid, symbol: "UNKNOWN_USDT", quantity: 0, leverage: 500, price: -1 }, prerequisites);
  assert.equal(result.ok, false);
  assert.deepEqual(result.rejections.map(({ code }) => code), ["UNKNOWN_SYMBOL", "INVALID_QUANTITY", "INVALID_PRICE", "INVALID_LEVERAGE"]);
  const stale = validateExecutionIntent(valid, { ...prerequisites, accountStateFresh: false });
  assert.equal(stale.ok, false);
  assert.equal(stale.rejections.at(-1).code, "PREREQUISITE_STATE_STALE");
});

test("quantity obeys contract volume bounds and step alignment", () => {
  for (const quantity of [0.00001, 10.0001, 0.00015]) {
    const result = validateExecutionIntent({ ...valid, quantity }, prerequisites);
    assert.equal(result.ok, false);
    assert.equal(result.rejections.some(({ code }) => code === "INVALID_QUANTITY"), true);
  }
  assert.equal(validateExecutionIntent({ ...valid, quantity: 0.0001 }, prerequisites).ok, true);
});

test("limit price obeys the contract price step", () => {
  const result = validateExecutionIntent({ ...valid, price: 65000.05 }, prerequisites);
  assert.equal(result.ok, false);
  assert.equal(result.rejections.some(({ code }) => code === "INVALID_PRICE"), true);
});

test("kill-switch contract represents global, user, account, stale, maintenance and emergency blocks", () => {
  const base = { globalDisabled: false, disabledUserIds: new Set(), disabledAccountIds: new Set(), providerStateFresh: true, maintenance: false, emergencyStop: false };
  assert.equal(executionKillSwitchReason({ ...base, globalDisabled: true }, valid), "GLOBAL_EXECUTION_DISABLED");
  assert.equal(executionKillSwitchReason({ ...base, disabledUserIds: new Set([valid.userId]) }, valid), "USER_EXECUTION_DISABLED");
  assert.equal(executionKillSwitchReason({ ...base, disabledAccountIds: new Set([valid.accountId]) }, valid), "ACCOUNT_EXECUTION_DISABLED");
  assert.equal(executionKillSwitchReason({ ...base, providerStateFresh: false }, valid), "PROVIDER_STATE_STALE");
  assert.equal(executionKillSwitchReason({ ...base, maintenance: true }, valid), "MAINTENANCE_STOP");
  assert.equal(executionKillSwitchReason({ ...base, emergencyStop: true }, valid), "EMERGENCY_STOP");
});

test("airlock always blocks, detects duplicate keys deterministically and performs no network request", () => {
  const originalFetch = globalThis.fetch;
  let networkRequests = 0;
  globalThis.fetch = () => { networkRequests += 1; throw new Error("network forbidden"); };
  try {
    const service = new ExecutionAirlockService({ environment: { LIVE_TRADING_ENABLED: "false" }, now: () => new Date("2026-08-12T12:01:00Z") });
    const first = service.process(valid, prerequisites);
    const duplicate = service.process(valid, prerequisites);
    assert.deepEqual(first.result, {
      intentId: valid.intentId, idempotencyKey: valid.idempotencyKey, state: "blocked",
      executed: false, duplicate: false, reason: "GLOBAL_EXECUTION_DISABLED",
      preview: { symbol: "BTC_USDT", side: "long", orderType: "limit", quantity: 0.001, price: 65000, leverage: 10, reduceOnly: false },
    });
    assert.equal(duplicate.result.executed, false);
    assert.equal(duplicate.result.duplicate, true);
    assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
    assert.deepEqual(duplicate.auditEvents.map(({ kind }) => kind), ["intent-received", "validation-passed", "duplicate-intent-detected"]);
    assert.equal(networkRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("idempotency keys are isolated by authenticated user and account identity", () => {
  const service = new ExecutionAirlockService({ environment: { LIVE_TRADING_ENABLED: "false" } });
  const first = service.process(valid, prerequisites);
  const otherUser = service.process({ ...valid, intentId: "intent-0002", userId: "user-2" }, prerequisites);
  const otherAccount = service.process({ ...valid, intentId: "intent-0003", accountId: "account-2" }, prerequisites);
  assert.equal(first.result.duplicate, false);
  assert.equal(otherUser.result.duplicate, false);
  assert.equal(otherUser.result.intentId, "intent-0002");
  assert.equal(otherAccount.result.duplicate, false);
  assert.equal(otherAccount.result.intentId, "intent-0003");
});

test("execution audit events hash identities, omit secrets and reject secret-shaped metadata", () => {
  const event = createExecutionAuditEvent({ eventId: "event-0001", occurredAt: valid.createdAt, kind: "execution-blocked", intentId: valid.intentId, idempotencyKey: valid.idempotencyKey, userId: valid.userId, symbol: valid.symbol, reason: "GLOBAL_EXECUTION_DISABLED" });
  const encoded = JSON.stringify(event);
  assert.doesNotMatch(encoded, new RegExp(valid.idempotencyKey));
  assert.doesNotMatch(encoded, new RegExp(valid.userId));
  assert.equal(Object.isFrozen(event), true);
  assert.throws(() => createExecutionAuditEvent({ eventId: "event-0002", occurredAt: valid.createdAt, kind: "execution-blocked", intentId: valid.intentId, idempotencyKey: valid.idempotencyKey, userId: valid.userId, apiSecret: "never-store-this" }), /Sensitive execution audit/);
  assert.doesNotThrow(() => createExecutionAuditEvent({ ...valid, eventId: "event-token", occurredAt: valid.createdAt, kind: "validation-rejected", intentId: "session-intent", userId: "token-user" }));
});

test("rejected input is not copied into audit events", () => {
  const service = new ExecutionAirlockService();
  const response = service.process({ ...valid, symbol: "TOKEN", intentId: "secret" }, prerequisites);
  assert.equal(response.result.state, "rejected");
  const audit = JSON.stringify(response.auditEvents);
  assert.doesNotMatch(audit, /TOKEN|secret/);
});
