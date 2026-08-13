import assert from "node:assert/strict";
import test from "node:test";

import { ExecutionAuditStoreError } from "../app/lib/execution/internal/audit-store.ts";
import { createTestExecutionBoundary } from "../app/lib/execution/internal/testing.ts";

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
});
const baseIntent = Object.freeze({
  intentId: "intent-0001", idempotencyKey: "idempotency-0001",
  userId: "user-1", accountId: "account-1", symbol: "BTC_USDT",
  marketType: "futures", side: "long", orderType: "limit", quantity: 0.001,
  price: 65000, leverage: 10, reduceOnly: false, source: "manual",
  createdAt: "2026-08-12T12:00:00.000Z",
});
const enabledSwitchState = Object.freeze({
  armed: true, globalDisabled: false,
  disabledUserIds: new Set(),
  disabledAccountIds: new Set(),
  providerStateFresh: true,
  maintenance: false,
  emergencyStop: false,
});

function boundaryWithAuditFailure(code) {
  const executionAuditStore = Object.freeze({
    readVerified() { throw new ExecutionAuditStoreError(code); },
    append() { assert.fail("audit append must not run after failed preflight verification"); },
  });
  return createTestExecutionBoundary({
    environment: { LIVE_TRADING_ENABLED: "false" },
    executionAuditStore,
    readKillSwitches: () => enabledSwitchState,
    authenticateInternalCaller: () => ({ callerId: "dizytrades-server", userId: "user-1", accountId: "account-1" }),
    syntheticProviderScenario: "would-accept",
    syntheticObservation: "would-observe-accepted",
    now: () => new Date("2026-08-12T12:01:00.000Z"),
  });
}

for (const code of ["EXECUTION_AUDIT_UNAVAILABLE", "EXECUTION_AUDIT_INVALID"]) {
  test(`${code} returns bounded placeholders before validation and cannot reach provider mechanics`, () => {
    const oversized = "x".repeat(1_000_000);
    const intent = { ...baseIntent, intentId: oversized, idempotencyKey: oversized };
    const response = boundaryWithAuditFailure(code).preview({
      callerAssertion: { callerId: "dizytrades-server", assertionId: "user-1:account-1" },
      userId: "user-1",
      accountId: "account-1",
      intent,
      prerequisites,
    });

    assert.deepEqual(response.result, {
      intentId: "unvalidated-intent",
      idempotencyKey: "unvalidated-key",
      state: "blocked",
      executed: false,
      duplicate: false,
      reason: code,
      preview: null,
    });
    assert.deepEqual(response.auditEvents, []);
    assert.equal("providerResult" in response.result, false);
    assert.ok(JSON.stringify(response).length < 512);
  });
}
