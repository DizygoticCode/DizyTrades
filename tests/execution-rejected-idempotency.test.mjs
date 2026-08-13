import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTestExecutionBoundary } from "../app/lib/execution/internal/testing.ts";
import { SqliteExecutionStateStore } from "../app/lib/execution/internal/state-store.ts";

const contract = Object.freeze({
  symbol: "BTC_USDT", displayName: "BTC USDT", contractSize: 0.0001,
  minLeverage: 1, maxLeverage: 100, priceUnit: 0.1, volUnit: 1,
  minVol: 1, maxVol: 100_000, makerFeeRate: 0, takerFeeRate: 0.0002,
  maintenanceMarginRate: 0.004, initialMarginRate: 0.01,
  positionOpenType: 3, riskLimitType: "BY_VOLUME",
});
const observedAt = "2026-08-12T12:00:45.000Z";
const valid = Object.freeze({
  intentId: "intent-0001", idempotencyKey: "idempotency-0001",
  userId: "user-1", accountId: "account-1", symbol: "BTC_USDT",
  marketType: "futures", side: "long", orderType: "limit", quantity: 0.001,
  price: 65000, leverage: 10, reduceOnly: false, source: "manual",
  createdAt: "2026-08-12T12:00:00.000Z",
});
const prerequisites = Object.freeze({
  contracts: new Map([[contract.symbol, contract]]),
  referencePrices: new Map([[contract.symbol, Object.freeze({ price: 65000, observedAt })]]),
  accountState: Object.freeze({
    userId: valid.userId,
    accountId: valid.accountId,
    observedAt,
    positions: Object.freeze([]),
  }),
});
const enabledSwitchState = Object.freeze({
  armed: true, globalDisabled: false,
  disabledUserIds: new Set(),
  disabledAccountKeys: new Set(),
  providerStateFresh: true,
  maintenance: false,
  emergencyStop: false,
});

function withDatabasePath(fn) {
  const directory = mkdtempSync(join(tmpdir(), "dizy-rejected-idempotency-"));
  const path = join(directory, "execution-state.sqlite");
  try { return fn(path); } finally { rmSync(directory, { recursive: true, force: true }); }
}

function boundaryFor(store) {
  return createTestExecutionBoundary({
    executionStateStore: store,
    environment: { LIVE_TRADING_ENABLED: "false" },
    now: () => new Date("2026-08-12T12:01:00Z"),
    readKillSwitches: () => enabledSwitchState,
    syntheticProviderScenario: "would-accept",
    authenticateInternalCaller: ({ callerId, assertionId }) => {
      const [userId, accountId] = assertionId.split(":");
      return callerId === "dizytrades-server" && userId && accountId ? { callerId, userId, accountId } : null;
    },
  });
}

function process(boundary, intent) {
  return boundary.preview({
    callerAssertion: {
      callerId: "dizytrades-server",
      assertionId: `${intent.userId}:${intent.accountId}`,
    },
    userId: intent.userId,
    accountId: intent.accountId,
    intent,
    prerequisites,
  });
}

for (const [name, rejectedIntent, expectedReason] of [
  ["structural validation", { ...valid, quantity: -1 }, "INVALID_QUANTITY"],
  ["server policy", { ...valid, leverage: 21 }, "POLICY_LEVERAGE_EXCEEDED"],
]) {
  test(`${name} rejection stays duplicate-protected after restart even if retry is corrected`, () => withDatabasePath((path) => {
    const firstStore = new SqliteExecutionStateStore(path);
    const first = process(boundaryFor(firstStore), rejectedIntent);
    assert.equal(first.result.state, "rejected");
    assert.equal(first.result.executed, false);
    assert.equal(first.result.duplicate, false);
    assert.equal(first.result.reason, expectedReason);
    assert.equal(first.result.preview, null);
    firstStore.close();

    const secondStore = new SqliteExecutionStateStore(path);
    const corrected = { ...valid, intentId: rejectedIntent.intentId, idempotencyKey: rejectedIntent.idempotencyKey };
    const duplicate = process(boundaryFor(secondStore), corrected);
    assert.equal(duplicate.result.state, "rejected");
    assert.equal(duplicate.result.executed, false);
    assert.equal(duplicate.result.duplicate, true);
    assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
    assert.equal(duplicate.result.preview, null);
    assert.equal(duplicate.result.providerResult, undefined);
    assert.equal(duplicate.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
    secondStore.close();
  }));
}
