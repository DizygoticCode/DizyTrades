import assert from "node:assert/strict";
import test from "node:test";

import { createExecutionAuditEvent } from "../app/lib/execution/internal/audit.ts";
import { executionCapabilityGate } from "../app/lib/execution/internal/gate.ts";
import { executionAccountKey, executionKillSwitchReason } from "../app/lib/execution/internal/kill-switch.ts";
import { executionBoundary } from "../app/lib/execution/boundary.ts";
import { createTestExecutionBoundary } from "../app/lib/execution/internal/testing.ts";
import { validateExecutionIntent } from "../app/lib/execution/internal/validation.ts";
import { SqliteExecutionRiskStore } from "../app/lib/execution/internal/risk-store.ts";

const contract = Object.freeze({
  symbol: "BTC_USDT", displayName: "BTC USDT", contractSize: 0.0001,
  minLeverage: 1, maxLeverage: 100, priceUnit: 0.1, volUnit: 1,
  minVol: 1, maxVol: 100_000, makerFeeRate: 0, takerFeeRate: 0.0002,
  maintenanceMarginRate: 0.004, initialMarginRate: 0.01,
  positionOpenType: 3, riskLimitType: "BY_VOLUME",
});
const observedAt = "2026-08-12T12:00:45.000Z";
const prerequisites = Object.freeze({
  contracts: new Map([[contract.symbol, contract]]),
  referencePrices: new Map([[contract.symbol, Object.freeze({ price: 65000, observedAt })]]),
  accountState: Object.freeze({ userId: "user-1", accountId: "account-1", observedAt, positions: Object.freeze([]) }),
  riskSnapshot: Object.freeze({ userId:"user-1", accountId:"account-1", observedAt, equity:10_000, availableMargin:5_000, dayStartEquity:10_000 }),
});
const valid = Object.freeze({
  intentId: "intent-0001", idempotencyKey: "idempotency-0001",
  userId: "user-1", accountId: "account-1", symbol: "BTC_USDT",
  marketType: "futures", side: "long", orderType: "limit", quantity: 0.001,
  price: 65000, leverage: 10, reduceOnly: false, source: "manual",
  createdAt: "2026-08-12T12:00:00.000Z",
});

const enabledSwitchState = Object.freeze({ armed: true, globalDisabled: false, disabledUserIds: new Set(), disabledAccountKeys: new Set(), providerStateFresh: true, maintenance: false, emergencyStop: false });
function makeService(options = {}) {
  const riskStore = options.executionRiskStore ?? new SqliteExecutionRiskStore(":memory:");
  if (!options.executionRiskStore) riskStore.replace(0, { userId:"user-1", accountId:"account-1", enabled:true, reviewAt:"2027-01-01T00:00:00Z", allowedSymbols:["BTC_USDT"], maximumLeverage:20, maximumOrderNotional:50_000, maximumGrossNotional:100_000, maximumDailyDrawdownUsdt:1_000, maximumOrderMarginFractionOfAvailable:0.5 });
  const boundary = createTestExecutionBoundary({
    executionRiskStore: riskStore,
    environment: options.environment,
    now: options.now,
    syntheticProviderScenario: options.syntheticProviderScenario,
    syntheticObservation: options.syntheticObservation,
    syntheticProviderFault: options.syntheticProviderFault,
    executionReconciliationStore: options.executionReconciliationStore,
    executionOwnershipStore: options.executionOwnershipStore,
    readKillSwitches: options.readKillSwitches ?? (() => ({ ...enabledSwitchState, globalDisabled: true })),
    authenticateInternalCaller: ({ callerId, assertionId }) => {
      const [userId, accountId] = assertionId.split(":");
      return callerId === "dizytrades-server" && userId && accountId ? { callerId, userId, accountId } : null;
    },
  });
  return { process: (intent, suppliedPrerequisites) => boundary.preview({
    callerAssertion: { callerId: "dizytrades-server", assertionId: `${intent.userId}:${intent.accountId}` },
    userId: intent.userId,
    accountId: intent.accountId,
    intent,
    prerequisites: suppliedPrerequisites,
  }) };
}

test("execution capability defaults and malformed configuration fail closed", () => {
  assert.deepEqual(executionCapabilityGate({}), { configured: false, enabled: false, reason: "absent" });
  assert.deepEqual(executionCapabilityGate({ LIVE_TRADING_ENABLED: "false" }), { configured: true, enabled: false, reason: "disabled" });
  assert.deepEqual(executionCapabilityGate({ LIVE_TRADING_ENABLED: "TRUE" }), { configured: true, enabled: false, reason: "malformed" });
  assert.deepEqual(executionCapabilityGate({ LIVE_TRADING_ENABLED: "true" }), { configured: true, enabled: false, reason: "adapter-unavailable" });
});

test("reconciliation freshness fails closed while kill switches retain precedence", () => {
  let staleReads=0;
  const fresh = { read: () => ({ revision:1, status:"clean", reason:"CLEAN", expected:[], observedAt:"2026-08-12T12:00:59.000Z" }) };
  const stale = { read: () => { staleReads++; return { revision:1, status:"clean", reason:"CLEAN", expected:[], observedAt:"2020-01-01T00:00:00.000Z" }; } };
  const freshResponse = makeService({ environment:{LIVE_TRADING_ENABLED:"false"}, now:()=>new Date("2026-08-12T12:01:00.000Z"), readKillSwitches:()=>enabledSwitchState, executionReconciliationStore:fresh, syntheticProviderScenario:"would-accept" }).process(valid,prerequisites);
  assert.equal(freshResponse.result.reason,"SYNTHETIC_PROVIDER_OUTCOME");
  const staleResponse = makeService({ environment:{LIVE_TRADING_ENABLED:"false"}, now:()=>new Date("2026-08-12T12:01:00.000Z"), readKillSwitches:()=>enabledSwitchState, executionReconciliationStore:stale, syntheticProviderScenario:"would-accept" }).process({...valid,intentId:"intent-stale",idempotencyKey:"idempotency-stale"},prerequisites);
  assert.equal(staleReads,1);
  assert.equal(staleResponse.result.reason,"EXECUTION_RECONCILIATION_UNKNOWN");
  const globalResponse = makeService({ environment:{LIVE_TRADING_ENABLED:"false"}, now:()=>new Date("2026-08-12T12:01:00.000Z"), executionReconciliationStore:stale }).process({...valid,intentId:"intent-global",idempotencyKey:"idempotency-global"},prerequisites);
  assert.equal(globalResponse.result.reason,"GLOBAL_EXECUTION_DISABLED");
  assert.equal(globalResponse.auditEvents.at(-1).reason,"GLOBAL_EXECUTION_DISABLED");
});

test("ownership blocks before reconciliation/provider evaluation while global kill switch retains precedence", () => {
  let ownershipReads = 0, reconciliationReads = 0;
  const ownership = { read: () => { ownershipReads++; return { revision:0, status:"unknown", proofObservedAt:null, activatedAt:null, revokedAt:null }; } };
  const reconciliation = { read: () => { reconciliationReads++; return { revision:1, status:"clean", reason:"CLEAN", expected:[], observedAt:"2026-08-12T12:00:59.000Z" }; } };
  const blocked = makeService({ environment:{LIVE_TRADING_ENABLED:"false"}, now:()=>new Date("2026-08-12T12:01:00.000Z"), readKillSwitches:()=>enabledSwitchState, executionOwnershipStore:ownership, executionReconciliationStore:reconciliation, syntheticProviderScenario:"would-accept" }).process({...valid,intentId:"intent-owner",idempotencyKey:"idempotency-owner"},prerequisites);
  assert.equal(blocked.result.reason,"EXECUTION_OWNERSHIP_UNPROVED");
  assert.equal(blocked.auditEvents.some((event)=>event.kind==="provider-evaluated"),false);
  assert.equal(ownershipReads,1);
  assert.equal(reconciliationReads,1);
  const global = makeService({ environment:{LIVE_TRADING_ENABLED:"false"}, now:()=>new Date("2026-08-12T12:01:00.000Z"), executionOwnershipStore:ownership, executionReconciliationStore:reconciliation }).process({...valid,intentId:"intent-owner-global",idempotencyKey:"idempotency-owner-global"},prerequisites);
  assert.equal(global.result.reason,"GLOBAL_EXECUTION_DISABLED");
});

test("valid intent is structurally validated into an immutable domain object", () => {
  const result = validateExecutionIntent(valid, prerequisites, new Date("2026-08-12T12:01:00Z"));
  assert.equal(result.ok, true);
  assert.equal(Object.isFrozen(result.intent), true);
  assert.equal(result.intent.contractVersion, "execution-airlock/1.0.0");
  assert.throws(() => { result.intent.quantity = 2; }, TypeError);
});

test("invalid intent returns useful typed structural rejection reasons", () => {
  const result = validateExecutionIntent({ ...valid, symbol: "UNKNOWN_USDT", quantity: 0, leverage: 500, price: -1 }, prerequisites, new Date("2026-08-12T12:01:00Z"));
  assert.equal(result.ok, false);
  assert.deepEqual(result.rejections.map(({ code }) => code), ["UNKNOWN_SYMBOL", "INVALID_QUANTITY", "INVALID_PRICE", "INVALID_LEVERAGE", "REFERENCE_PRICE_MISSING"]);
});

test("quantity obeys contract volume bounds and step alignment", () => {
  for (const quantity of [0.00001, 10.0001, 0.00015]) {
    const result = validateExecutionIntent({ ...valid, quantity }, prerequisites, new Date("2026-08-12T12:01:00Z"));
    assert.equal(result.ok, false);
    assert.equal(result.rejections.some(({ code }) => code === "INVALID_QUANTITY"), true);
  }
  assert.equal(validateExecutionIntent({ ...valid, quantity: 0.0001 }, prerequisites, new Date("2026-08-12T12:01:00Z")).ok, true);
});

test("tolerance-aligned quantities are quantized before preview estimates", () => {
  const service = makeService({ environment: { LIVE_TRADING_ENABLED: "false" }, now: () => new Date("2026-08-12T12:01:00Z") });
  const response = service.process({ ...valid, quantity: 0.00100000000001 }, prerequisites);
  assert.equal(response.result.preview.quantity, 0.001);
  assert.equal(response.result.preview.normalizedContractVolume, 10);
  assert.equal(response.result.preview.estimatedNotional, 65);
});

test("limit price obeys the contract price step", () => {
  const result = validateExecutionIntent({ ...valid, price: 65000.05 }, prerequisites, new Date("2026-08-12T12:01:00Z"));
  assert.equal(result.ok, false);
  assert.equal(result.rejections.some(({ code }) => code === "INVALID_PRICE"), true);
});

test("kill-switch contract represents global, user, account, stale, maintenance and emergency blocks", () => {
  const base = { armed: true, globalDisabled: false, disabledUserIds: new Set(), disabledAccountKeys: new Set(), providerStateFresh: true, maintenance: false, emergencyStop: false };
  assert.equal(executionKillSwitchReason({ ...base, globalDisabled: true }, valid), "GLOBAL_EXECUTION_DISABLED");
  assert.equal(executionKillSwitchReason({ ...base, disabledUserIds: new Set([valid.userId]) }, valid), "USER_EXECUTION_DISABLED");
  assert.equal(executionKillSwitchReason({ ...base, disabledAccountKeys: new Set([executionAccountKey(valid)]) }, valid), "ACCOUNT_EXECUTION_DISABLED");
  assert.equal(executionKillSwitchReason({ ...base, providerStateFresh: false }, valid), "PROVIDER_STATE_STALE");
  assert.equal(executionKillSwitchReason({ ...base, maintenance: true }, valid), "MAINTENANCE_STOP");
  assert.equal(executionKillSwitchReason({ ...base, emergencyStop: true }, valid), "EMERGENCY_STOP");
});

test("airlock always blocks, detects duplicate keys deterministically and performs no network request", () => {
  const originalFetch = globalThis.fetch;
  let networkRequests = 0;
  globalThis.fetch = () => { networkRequests += 1; throw new Error("network forbidden"); };
  try {
    const service = makeService({ environment: { LIVE_TRADING_ENABLED: "false" }, now: () => new Date("2026-08-12T12:01:00Z") });
    const first = service.process(valid, prerequisites);
    const duplicate = service.process(valid, prerequisites);
    assert.deepEqual(first.result, {
      intentId: valid.intentId, idempotencyKey: valid.idempotencyKey, state: "blocked",
      executed: false, duplicate: false, reason: "GLOBAL_EXECUTION_DISABLED",
      preview: { symbol: "BTC_USDT", side: "long", orderType: "limit", quantity: 0.001, price: 65000, leverage: 10, reduceOnly: false, normalizedContractVolume: 10, referencePrice: 65000, estimatedNotional: 65, estimatedMargin: 6.5, policyVersion: "execution-preview-policy/1.0.0" },
    });
    assert.equal(Object.isFrozen(first.result.preview), true);
    assert.equal(duplicate.result.executed, false);
    assert.equal(duplicate.result.duplicate, true);
    assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
    assert.deepEqual(duplicate.auditEvents.map(({ kind }) => kind), ["intent-received", "validation-passed", "duplicate-intent-detected"]);
    assert.equal(networkRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("literal true still ends at adapter-unavailable without execution", () => {
  const service = makeService({ environment: { LIVE_TRADING_ENABLED: "true" }, now: () => new Date("2026-08-12T12:01:00Z") });
  const response = service.process(valid, prerequisites);
  assert.equal(response.result.reason, "ADAPTER_UNAVAILABLE");
  assert.equal(response.result.executed, false);
  assert.equal(response.result.state, "blocked");
});

test("risk denials are audited and durably replayed as duplicate intents", () => {
  const riskStore = new SqliteExecutionRiskStore(":memory:");
  const service = makeService({
    executionRiskStore: riskStore,
    environment: { LIVE_TRADING_ENABLED: "false" },
    now: () => new Date("2026-08-12T12:01:00Z"),
    readKillSwitches: () => enabledSwitchState,
  });
  const first = service.process(valid, prerequisites);
  const duplicate = service.process(valid, prerequisites);
  assert.equal(first.result.reason, "ACCOUNT_NOT_AUTHORIZED");
  assert.equal(first.result.state, "blocked");
  assert.equal(first.auditEvents.at(-1).reason, "ACCOUNT_NOT_AUTHORIZED");
  assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
  assert.equal(duplicate.result.duplicate, true);
  assert.equal(duplicate.result.preview.symbol, valid.symbol);
});

test("synthetic provider lifecycle outcomes are deterministic and never execute", () => {
  const expectedReason = { "would-accept": "none", "would-reject": "policy", "would-timeout": "timeout", "would-unknown": "indeterminate" };
  for (const scenario of Object.keys(expectedReason)) {
    const service = makeService({
      environment: { LIVE_TRADING_ENABLED: "false" },
      now: () => new Date("2026-08-12T12:01:00Z"),
      readKillSwitches: () => enabledSwitchState,
      syntheticProviderScenario: scenario,
    });
    const response = service.process(valid, prerequisites);
    assert.equal(response.result.executed, false);
    assert.equal(response.result.state, "prepared");
    assert.deepEqual(response.result.providerResult, {
      contractVersion: "synthetic-provider/1.0.0",
      providerKind: "non-executing",
      provenance: "deterministic-synthetic-fixture",
      outcome: scenario,
      executed: false,
      reasonClass: expectedReason[scenario],
    });
    assert.doesNotMatch(JSON.stringify(response), /orderId|fill|tradeId|apiKey|secret/i);
  }
});

test("boundary attaches only an explicitly injected deterministic synthetic reconciliation", () => {
  const response = makeService({
    environment: { LIVE_TRADING_ENABLED: "false" },
    now: () => new Date("2026-08-12T12:01:00Z"),
    readKillSwitches: () => enabledSwitchState,
    syntheticProviderScenario: "would-timeout",
    syntheticObservation: "would-observe-accepted",
  }).process(valid, prerequisites);
  assert.deepEqual(response.result.providerResult.reconciliation, {
    contractVersion: "synthetic-reconciliation/1.0.0",
    provenance: "deterministic-synthetic-fixture",
    initialProviderOutcome: "would-timeout",
    observedOutcome: "would-observe-accepted",
    resolution: "recovered-accepted",
    certainty: "terminal",
    executed: false,
  });
  assert.equal(response.result.executed, false);
  assert.doesNotMatch(JSON.stringify(response), /orderId|fillId|tradeId|acknowledgement/i);
});

test("synthetic provider evaluation requires the explicit disabled gate posture", () => {
  for (const environment of [{}, { LIVE_TRADING_ENABLED: "TRUE" }]) {
    const response = makeService({
      environment,
      now: () => new Date("2026-08-12T12:01:00Z"),
      readKillSwitches: () => enabledSwitchState,
      syntheticProviderScenario: "would-accept",
    }).process(valid, prerequisites);
    assert.equal(response.result.state, "blocked");
    assert.equal(response.result.executed, false);
    assert.equal(response.result.reason, "GLOBAL_EXECUTION_DISABLED");
    assert.equal(response.result.providerResult, undefined);
    assert.equal(response.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
  }
});

test("provider is downstream of authentication, kill switches, validation, policy and idempotency", () => {
  const options = { environment: { LIVE_TRADING_ENABLED: "false" }, now: () => new Date("2026-08-12T12:01:00Z"), syntheticProviderScenario: "would-accept" };
  const killed = makeService({ ...options, readKillSwitches: () => ({ ...enabledSwitchState, emergencyStop: true }) }).process(valid, prerequisites);
  assert.equal(killed.result.reason, "EMERGENCY_STOP");
  assert.equal(killed.result.providerResult, undefined);
  const invalid = makeService({ ...options, readKillSwitches: () => enabledSwitchState }).process({ ...valid, quantity: -1 }, prerequisites);
  assert.equal(invalid.result.state, "rejected");
  assert.equal(invalid.result.providerResult, undefined);
  const policyRejected = makeService({ ...options, readKillSwitches: () => enabledSwitchState }).process({ ...valid, leverage: 21 }, prerequisites);
  assert.equal(policyRejected.result.reason, "POLICY_LEVERAGE_EXCEEDED");
  assert.equal(policyRejected.result.providerResult, undefined);
  const service = makeService({ ...options, readKillSwitches: () => enabledSwitchState });
  service.process(valid, prerequisites);
  const duplicate = service.process(valid, prerequisites);
  assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
  assert.equal(duplicate.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
});

test("provider exceptions and malformed results fail closed with bounded errors", () => {
  for (const [syntheticProviderFault, reason] of [["exception", "PROVIDER_EXCEPTION"], ["malformed-result", "PROVIDER_MALFORMED_RESULT"]]) {
    const service = makeService({ environment: { LIVE_TRADING_ENABLED: "false" }, now: () => new Date("2026-08-12T12:01:00Z"), readKillSwitches: () => enabledSwitchState, syntheticProviderScenario: "would-accept", syntheticProviderFault });
    const response = service.process(valid, prerequisites);
    assert.equal(response.result.executed, false);
    assert.equal(response.result.state, "blocked");
    assert.equal(response.result.reason, reason);
    assert.equal(response.result.providerResult, undefined);
    assert.doesNotMatch(JSON.stringify(response), /Synthetic provider fault|apiKey|secret/i);
    const duplicate = service.process(valid, prerequisites);
    assert.equal(duplicate.result.executed, false);
    assert.equal(duplicate.result.duplicate, true);
    assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
    assert.deepEqual(duplicate.auditEvents.map(({ kind }) => kind), ["intent-received", "validation-passed", "duplicate-intent-detected"]);
  }
});

test("isolated boundary authenticates its internal caller and binds user and account", () => {
  const base = {
    readKillSwitches: () => enabledSwitchState,
    environment: { LIVE_TRADING_ENABLED: "false" },
    now: () => new Date("2026-08-12T12:01:00Z"),
  };
  const request = { callerAssertion: { callerId: "dizytrades-server", assertionId: "assertion-1" }, userId: valid.userId, accountId: valid.accountId, intent: valid, prerequisites };
  const unauthenticated = createTestExecutionBoundary({ ...base, authenticateInternalCaller: () => null }).preview(request);
  assert.equal(unauthenticated.result.reason, "CALLER_UNAUTHENTICATED");
  assert.equal(unauthenticated.result.executed, false);
  const foreign = createTestExecutionBoundary({ ...base, authenticateInternalCaller: () => ({ callerId: "dizytrades-server", userId: "user-2", accountId: valid.accountId }) }).preview(request);
  assert.equal(foreign.result.reason, "CALLER_IDENTITY_MISMATCH");
  assert.equal(foreign.result.preview, null);
  const wrongCaller = createTestExecutionBoundary({ ...base, authenticateInternalCaller: () => ({ callerId: "another-service", userId: valid.userId, accountId: valid.accountId }) }).preview(request);
  assert.equal(wrongCaller.result.reason, "CALLER_UNAUTHENTICATED");
});

test("kill switches are boundary-owned and cannot be overridden by intent fields", () => {
  for (const [switches, reason] of [
    [{ ...enabledSwitchState, globalDisabled: true }, "GLOBAL_EXECUTION_DISABLED"],
    [{ ...enabledSwitchState, disabledUserIds: new Set([valid.userId]) }, "USER_EXECUTION_DISABLED"],
    [{ ...enabledSwitchState, disabledAccountKeys: new Set([executionAccountKey(valid)]) }, "ACCOUNT_EXECUTION_DISABLED"],
  ]) {
    const service = makeService({ environment: { LIVE_TRADING_ENABLED: "false" }, now: () => new Date("2026-08-12T12:01:00Z"), readKillSwitches: () => switches });
    const response = service.process({ ...valid, killSwitches: enabledSwitchState, globalDisabled: false }, prerequisites);
    assert.equal(response.result.reason, reason);
    assert.equal(response.result.executed, false);
  }
});

test("boundary dependency failures are isolated and fail without a preview", () => {
  const boundary = createTestExecutionBoundary({
    authenticateInternalCaller: () => ({ callerId: "dizytrades-server", userId: valid.userId, accountId: valid.accountId }),
    readKillSwitches: () => { throw new Error("provider unavailable"); },
  });
  const response = boundary.preview({ callerAssertion: { callerId: "dizytrades-server", assertionId: "assertion-1" }, userId: valid.userId, accountId: valid.accountId, intent: valid, prerequisites });
  assert.equal(response.result.reason, "BOUNDARY_DEPENDENCY_FAILURE");
  assert.equal(response.result.executed, false);
  assert.equal(response.result.preview, null);
});

test("malformed authentication and kill-switch dependency output fails closed", () => {
  const request = { callerAssertion: { callerId: "dizytrades-server", assertionId: "assertion-1" }, userId: valid.userId, accountId: valid.accountId, intent: valid, prerequisites };
  const authenticated = () => ({ callerId: "dizytrades-server", userId: valid.userId, accountId: valid.accountId });
  for (const authenticateInternalCaller of [
    () => undefined,
    () => ({ callerId: "dizytrades-server", userId: valid.userId }),
    () => { throw new Error("authentication unavailable"); },
  ]) {
    const response = createTestExecutionBoundary({ authenticateInternalCaller, readKillSwitches: () => enabledSwitchState }).preview(request);
    assert.equal(response.result.reason, "BOUNDARY_DEPENDENCY_FAILURE");
    assert.equal(response.result.executed, false);
    assert.equal(response.result.preview, null);
  }
  for (const malformed of [
    null,
    {},
    { ...enabledSwitchState, disabledUserIds: null },
    { ...enabledSwitchState, disabledAccountKeys: [valid.accountId] },
    { ...enabledSwitchState, maintenance: "false" },
    { ...enabledSwitchState, disabledUserIds: new Set([null]) },
  ]) {
    const response = createTestExecutionBoundary({ authenticateInternalCaller: authenticated, readKillSwitches: () => malformed }).preview(request);
    assert.equal(response.result.reason, "BOUNDARY_DEPENDENCY_FAILURE");
    assert.equal(response.result.executed, false);
    assert.equal(response.result.preview, null);
  }
});

test("application boundary is a server-owned singleton with no construction API", async () => {
  const importedAgain = await import("../app/lib/execution/boundary.ts");
  assert.equal(importedAgain.executionBoundary, executionBoundary);
  assert.deepEqual(Object.keys(importedAgain), ["executionBoundary"]);
});

test("idempotency keys are isolated by authenticated user and account identity", () => {
  const service = makeService({ environment: { LIVE_TRADING_ENABLED: "false" }, now: () => new Date("2026-08-12T12:01:00Z") });
  const first = service.process(valid, prerequisites);
  const otherUser = service.process(
    { ...valid, intentId: "intent-0002", userId: "user-2" },
    { ...prerequisites, accountState: { ...prerequisites.accountState, userId: "user-2" } },
  );
  const otherAccount = service.process(
    { ...valid, intentId: "intent-0003", accountId: "account-2" },
    { ...prerequisites, accountState: { ...prerequisites.accountState, accountId: "account-2" } },
  );
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
  const service = makeService();
  const response = service.process({ ...valid, symbol: "TOKEN", intentId: "secret" }, prerequisites);
  assert.equal(response.result.state, "rejected");
  const audit = JSON.stringify(response.auditEvents);
  assert.doesNotMatch(audit, /TOKEN|secret/);
});

test("server policy denies symbols, leverage, notional and attempted client overrides", () => {
  const now = new Date("2026-08-12T12:01:00Z");
  const deniedContract = { ...contract, symbol: "DOGE_USDT", displayName: "DOGE USDT" };
  const deniedPrerequisites = { ...prerequisites, contracts: new Map([[deniedContract.symbol, deniedContract]]), referencePrices: new Map([[deniedContract.symbol, { price: 1, observedAt }]]) };
  assert.equal(validateExecutionIntent({ ...valid, symbol: "DOGE_USDT" }, deniedPrerequisites, now).rejections.some(({ code }) => code === "POLICY_SYMBOL_DENIED"), true);
  assert.equal(validateExecutionIntent({ ...valid, leverage: 21 }, prerequisites, now).rejections.some(({ code }) => code === "POLICY_LEVERAGE_EXCEEDED"), true);
  assert.equal(validateExecutionIntent({ ...valid, quantity: 1 }, prerequisites, now).rejections.some(({ code }) => code === "POLICY_NOTIONAL_EXCEEDED"), true);
  const override = validateExecutionIntent({ ...valid, policy: { maximumLeverage: 1000, maximumOrderNotional: 1e12 }, leverage: 21 }, prerequisites, now);
  assert.equal(override.ok, false);
  assert.equal(override.rejections.some(({ code }) => code === "POLICY_LEVERAGE_EXCEEDED"), true);
});

test("limit notional policy and preview use the higher validated limit price", () => {
  const now = new Date("2026-08-12T12:01:00Z");
  const underAtReferenceOverAtLimit = { ...valid, quantity: 0.5, price: 110000 };
  const result = validateExecutionIntent(underAtReferenceOverAtLimit, prerequisites, now);
  assert.equal(result.ok, false);
  assert.equal(result.rejections.some(({ code }) => code === "POLICY_NOTIONAL_EXCEEDED"), true);

  const service = makeService({ environment: { LIVE_TRADING_ENABLED: "false" }, now: () => now });
  const accepted = service.process({ ...valid, price: 70000 }, prerequisites);
  assert.equal(accepted.result.preview.estimatedNotional, 70);
  assert.equal(accepted.result.preview.estimatedMargin, 7);
});

test("missing, stale and future-dated prerequisite state fails closed", () => {
  const now = new Date("2026-08-12T12:01:30Z");
  const missing = validateExecutionIntent(valid, { ...prerequisites, referencePrices: new Map(), accountState: null }, now);
  assert.deepEqual(missing.rejections.map(({ code }) => code).slice(-2), ["REFERENCE_PRICE_MISSING", "ACCOUNT_STATE_MISSING"]);
  const stale = validateExecutionIntent(valid, prerequisites, now);
  assert.equal(stale.rejections.some(({ code }) => code === "REFERENCE_PRICE_STALE"), true);
  assert.equal(stale.rejections.some(({ code }) => code === "ACCOUNT_STATE_STALE"), true);
});

test("reduce-only requires and cannot exceed an opposing position", () => {
  const now = new Date("2026-08-12T12:01:00Z");
  assert.equal(validateExecutionIntent({ ...valid, reduceOnly: true }, prerequisites, now).rejections.some(({ code }) => code === "REDUCE_ONLY_VIOLATION"), true);
  const shortPosition = { ...prerequisites, accountState: { userId: valid.userId, accountId: valid.accountId, observedAt, positions: [{ symbol: valid.symbol, side: "short", quantity: 0.001 }] } };
  assert.equal(validateExecutionIntent({ ...valid, reduceOnly: true }, shortPosition, now).ok, true);
  assert.equal(validateExecutionIntent({ ...valid, quantity: 0.002, reduceOnly: true }, shortPosition, now).rejections.some(({ code }) => code === "REDUCE_ONLY_VIOLATION"), true);
});

test("cross-user and cross-account snapshots cannot validate or satisfy reduce-only", () => {
  const now = new Date("2026-08-12T12:01:00Z");
  for (const identity of [
    { userId: "user-2", accountId: valid.accountId },
    { userId: valid.userId, accountId: "account-2" },
  ]) {
    const foreign = {
      ...prerequisites,
      accountState: { ...identity, observedAt, positions: [{ symbol: valid.symbol, side: "short", quantity: valid.quantity }] },
    };
    const regular = validateExecutionIntent(valid, foreign, now);
    assert.equal(regular.ok, false);
    assert.equal(regular.rejections.some(({ code }) => code === "ACCOUNT_STATE_IDENTITY_MISMATCH"), true);
    const reduceOnly = validateExecutionIntent({ ...valid, reduceOnly: true }, foreign, now);
    assert.equal(reduceOnly.ok, false);
    assert.equal(reduceOnly.rejections.some(({ code }) => code === "ACCOUNT_STATE_IDENTITY_MISMATCH"), true);
  }
});
