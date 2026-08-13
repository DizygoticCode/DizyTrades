import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createTestExecutionBoundary } from "../app/lib/execution/internal/testing.ts";
import {
  ExecutionStateStoreError,
  SqliteExecutionStateStore,
} from "../app/lib/execution/internal/state-store.ts";

const contract = Object.freeze({
  symbol: "BTC_USDT", displayName: "BTC USDT", contractSize: 0.0001,
  minLeverage: 1, maxLeverage: 100, priceUnit: 0.1, volUnit: 1,
  minVol: 1, maxVol: 100_000, makerFeeRate: 0, takerFeeRate: 0.0002,
  maintenanceMarginRate: 0.004, initialMarginRate: 0.01,
  positionOpenType: 3, riskLimitType: "BY_VOLUME",
});
const observedAt = "2026-08-12T12:00:45.000Z";
const enabledSwitchState = Object.freeze({
  globalDisabled: false,
  disabledUserIds: new Set(),
  disabledAccountIds: new Set(),
  providerStateFresh: true,
  maintenance: false,
  emergencyStop: false,
});
const valid = Object.freeze({
  intentId: "intent-0001", idempotencyKey: "idempotency-0001",
  userId: "user-1", accountId: "account-1", symbol: "BTC_USDT",
  marketType: "futures", side: "long", orderType: "limit", quantity: 0.001,
  price: 65000, leverage: 10, reduceOnly: false, source: "manual",
  createdAt: "2026-08-12T12:00:00.000Z",
});

function prerequisitesFor(userId = valid.userId, accountId = valid.accountId) {
  return Object.freeze({
    contracts: new Map([[contract.symbol, contract]]),
    referencePrices: new Map([[contract.symbol, Object.freeze({ price: 65000, observedAt })]]),
    accountState: Object.freeze({ userId, accountId, observedAt, positions: Object.freeze([]) }),
  });
}

function boundaryFor(store, options = {}) {
  return createTestExecutionBoundary({
    executionStateStore: store,
    environment: options.environment ?? { LIVE_TRADING_ENABLED: "false" },
    now: () => new Date("2026-08-12T12:01:00Z"),
    readKillSwitches: options.readKillSwitches ?? (() => enabledSwitchState),
    syntheticProviderScenario: options.syntheticProviderScenario,
    syntheticObservation: options.syntheticObservation,
    syntheticProviderFault: options.syntheticProviderFault,
    authenticateInternalCaller: ({ callerId, assertionId }) => {
      const [userId, accountId] = assertionId.split(":");
      return callerId === "dizytrades-server" && userId && accountId ? { callerId, userId, accountId } : null;
    },
  });
}

function process(boundary, intent = valid, prerequisites = prerequisitesFor(intent.userId, intent.accountId)) {
  return boundary.preview({
    callerAssertion: { callerId: "dizytrades-server", assertionId: `${intent.userId}:${intent.accountId}` },
    userId: intent.userId,
    accountId: intent.accountId,
    intent,
    prerequisites,
  });
}

function withDatabasePath(fn) {
  const directory = mkdtempSync(join(tmpdir(), "dizy-execution-state-"));
  const path = join(directory, "execution-state.sqlite");
  try { return fn(path, directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("durable idempotency survives service and SQLite store reconstruction", () => withDatabasePath((path) => {
  const firstStore = new SqliteExecutionStateStore(path);
  const first = process(boundaryFor(firstStore));
  assert.equal(first.result.executed, false);
  assert.equal(first.result.duplicate, false);
  assert.equal(first.result.reason, "GLOBAL_EXECUTION_DISABLED");
  firstStore.close();

  const secondStore = new SqliteExecutionStateStore(path);
  const duplicate = process(boundaryFor(secondStore));
  assert.equal(duplicate.result.executed, false);
  assert.equal(duplicate.result.duplicate, true);
  assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
  assert.deepEqual(duplicate.auditEvents.map(({ kind }) => kind), [
    "intent-received", "validation-passed", "duplicate-intent-detected",
  ]);
  secondStore.close();
}));

test("reusing a durable scope and key for a different intent ID fails closed before provider evaluation", () => withDatabasePath((path) => {
  const store = new SqliteExecutionStateStore(path);
  const boundary = boundaryFor(store, { syntheticProviderScenario: "would-accept" });
  const first = process(boundary);
  assert.equal(first.result.state, "prepared");

  const mismatched = process(boundary, { ...valid, intentId: "intent-0002" });
  assert.equal(mismatched.result.state, "blocked");
  assert.equal(mismatched.result.executed, false);
  assert.equal(mismatched.result.duplicate, false);
  assert.equal(mismatched.result.reason, "EXECUTION_STATE_INVALID");
  assert.equal(mismatched.result.providerResult, undefined);
  assert.equal(mismatched.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
  store.close();
}));

test("reusing a durable scope and key for a different symbol fails closed after reconstruction", () => withDatabasePath((path) => {
  const firstStore = new SqliteExecutionStateStore(path);
  const first = process(boundaryFor(firstStore, { syntheticProviderScenario: "would-accept" }));
  assert.equal(first.result.state, "prepared");
  firstStore.close();

  const ethContract = Object.freeze({ ...contract, symbol: "ETH_USDT", displayName: "ETH USDT" });
  const ethIntent = { ...valid, symbol: ethContract.symbol };
  const ethPrerequisites = Object.freeze({
    contracts: new Map([[ethContract.symbol, ethContract]]),
    referencePrices: new Map([[ethContract.symbol, Object.freeze({ price: 65000, observedAt })]]),
    accountState: Object.freeze({
      userId: ethIntent.userId,
      accountId: ethIntent.accountId,
      observedAt,
      positions: Object.freeze([]),
    }),
  });
  const secondStore = new SqliteExecutionStateStore(path);
  const mismatched = process(
    boundaryFor(secondStore, { syntheticProviderScenario: "would-accept" }),
    ethIntent,
    ethPrerequisites,
  );
  assert.equal(mismatched.result.state, "blocked");
  assert.equal(mismatched.result.executed, false);
  assert.equal(mismatched.result.duplicate, false);
  assert.equal(mismatched.result.reason, "EXECUTION_STATE_INVALID");
  assert.equal(mismatched.result.providerResult, undefined);
  assert.equal(mismatched.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
  secondStore.close();
}));

test("synthetic provider results persist across restart without becoming execution claims", () => withDatabasePath((path) => {
  for (const scenario of ["would-accept", "would-reject", "would-timeout", "would-unknown"]) {
    const intent = { ...valid, intentId: `intent-${scenario}`, idempotencyKey: `idem-${scenario}-0001` };
    const firstStore = new SqliteExecutionStateStore(path);
    const first = process(boundaryFor(firstStore, { syntheticProviderScenario: scenario }), intent);
    assert.equal(first.result.state, "prepared");
    assert.equal(first.result.executed, false);
    assert.equal(first.result.providerResult.outcome, scenario);
    firstStore.close();

    const secondStore = new SqliteExecutionStateStore(path);
    const duplicate = process(boundaryFor(secondStore, { syntheticProviderScenario: scenario }), intent);
    assert.equal(duplicate.result.duplicate, true);
    assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
    assert.equal(duplicate.result.executed, false);
    assert.equal(duplicate.result.providerResult.outcome, scenario);
    assert.equal(duplicate.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
    secondStore.close();
  }
}));

test("bounded reconciliation evidence survives restart exactly and remains non-executing", () => withDatabasePath((path) => {
  const options = {
    syntheticProviderScenario: "would-unknown",
    syntheticObservation: "would-observe-rejected",
  };
  const firstStore = new SqliteExecutionStateStore(path);
  const first = process(boundaryFor(firstStore, options));
  const evidence = first.result.providerResult.reconciliation;
  assert.equal(Buffer.byteLength(JSON.stringify(first.result.providerResult), "utf8") < 1024, true);
  firstStore.close();

  const secondStore = new SqliteExecutionStateStore(path);
  const duplicate = process(boundaryFor(secondStore, options));
  assert.deepEqual(duplicate.result.providerResult.reconciliation, evidence);
  assert.equal(duplicate.result.providerResult.reconciliation.executed, false);
  assert.equal(duplicate.result.executed, false);
  assert.equal(duplicate.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
  secondStore.close();
}));

test("inherited-name reconciliation outcome fails closed before provider re-entry", () => withDatabasePath((path) => {
  const options = { syntheticProviderScenario: "would-timeout", syntheticObservation: "would-observe-missing" };
  const firstStore = new SqliteExecutionStateStore(path);
  process(boundaryFor(firstStore, options));
  firstStore.close();

  const db = new DatabaseSync(path);
  const row = db.prepare("SELECT provider_json FROM execution_state").get();
  const provider = JSON.parse(row.provider_json);
  provider.reconciliation.initialProviderOutcome = "constructor";
  db.prepare("UPDATE execution_state SET provider_json=?").run(JSON.stringify(provider));
  db.close();

  const secondStore = new SqliteExecutionStateStore(path);
  const response = process(boundaryFor(secondStore, options));
  assert.equal(response.result.reason, "EXECUTION_STATE_INVALID");
  assert.equal(response.result.executed, false);
  assert.equal(response.result.providerResult, undefined);
  assert.equal(response.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
  secondStore.close();
}));

test("provider failures remain duplicate-protected after restart", () => withDatabasePath((path) => {
  for (const [fault, expectedReason] of [
    ["exception", "PROVIDER_EXCEPTION"],
    ["malformed-result", "PROVIDER_MALFORMED_RESULT"],
  ]) {
    const intent = { ...valid, intentId: `intent-${fault}`, idempotencyKey: `idem-${fault}-0001` };
    const firstStore = new SqliteExecutionStateStore(path);
    const first = process(boundaryFor(firstStore, {
      syntheticProviderScenario: "would-accept",
      syntheticProviderFault: fault,
    }), intent);
    assert.equal(first.result.reason, expectedReason);
    assert.equal(first.result.executed, false);
    firstStore.close();

    const secondStore = new SqliteExecutionStateStore(path);
    const duplicate = process(boundaryFor(secondStore, {
      syntheticProviderScenario: "would-accept",
      syntheticProviderFault: fault,
    }), intent);
    assert.equal(duplicate.result.duplicate, true);
    assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
    assert.equal(duplicate.result.executed, false);
    assert.equal(duplicate.auditEvents.some(({ kind }) => kind === "provider-failed"), false);
    secondStore.close();
  }
}));

test("a crash-style processing reservation survives restart and blocks provider re-entry", () => withDatabasePath((path) => {
  const firstStore = new SqliteExecutionStateStore(path);
  assert.deepEqual(firstStore.claim(
    { userId: valid.userId, accountId: valid.accountId, idempotencyKey: valid.idempotencyKey },
    { intentId: valid.intentId, symbol: valid.symbol },
    "2026-08-12T12:01:00.000Z",
  ), { kind: "claimed" });
  firstStore.close();

  const secondStore = new SqliteExecutionStateStore(path);
  const duplicate = process(boundaryFor(secondStore, { syntheticProviderScenario: "would-accept" }));
  assert.equal(duplicate.result.state, "blocked");
  assert.equal(duplicate.result.executed, false);
  assert.equal(duplicate.result.duplicate, true);
  assert.equal(duplicate.result.reason, "DUPLICATE_INTENT");
  assert.equal(duplicate.result.providerResult, undefined);
  assert.equal(duplicate.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
  secondStore.close();
}));

test("idempotency uniqueness is scoped by user, account and key", () => withDatabasePath((path) => {
  const store = new SqliteExecutionStateStore(path);
  const time = "2026-08-12T12:01:00.000Z";
  const sharedKey = "shared-key-0001";
  assert.equal(store.claim(
    { userId: "user-1", accountId: "account-1", idempotencyKey: sharedKey },
    { intentId: "intent-a", symbol: "BTC_USDT" }, time,
  ).kind, "claimed");
  assert.equal(store.claim(
    { userId: "user-1", accountId: "account-2", idempotencyKey: sharedKey },
    { intentId: "intent-b", symbol: "BTC_USDT" }, time,
  ).kind, "claimed");
  assert.equal(store.claim(
    { userId: "user-2", accountId: "account-1", idempotencyKey: sharedKey },
    { intentId: "intent-c", symbol: "BTC_USDT" }, time,
  ).kind, "claimed");
  assert.equal(store.claim(
    { userId: "user-1", accountId: "account-1", idempotencyKey: sharedKey },
    { intentId: "intent-a", symbol: "BTC_USDT" }, time,
  ).kind, "duplicate");
  store.close();

  const db = new DatabaseSync(path);
  const row = db.prepare("SELECT COUNT(*) AS count FROM execution_state WHERE idempotency_key=?").get(sharedKey);
  assert.equal(Number(row.count), 3);
  db.close();
}));

test("malformed durable result data fails closed instead of reaching provider mechanics", () => withDatabasePath((path) => {
  const store = new SqliteExecutionStateStore(path);
  process(boundaryFor(store), valid);
  store.close();

  const db = new DatabaseSync(path);
  db.prepare("UPDATE execution_state SET result_reason='CORRUPT_REASON' WHERE user_id=? AND account_id=? AND idempotency_key=?")
    .run(valid.userId, valid.accountId, valid.idempotencyKey);
  db.close();

  const reopened = new SqliteExecutionStateStore(path);
  const response = process(boundaryFor(reopened, { syntheticProviderScenario: "would-accept" }), valid);
  assert.equal(response.result.state, "blocked");
  assert.equal(response.result.executed, false);
  assert.equal(response.result.duplicate, false);
  assert.equal(response.result.reason, "EXECUTION_STATE_INVALID");
  assert.equal(response.result.providerResult, undefined);
  assert.equal(response.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
  reopened.close();
}));

test("unsupported schema versions fail closed", () => withDatabasePath((path) => {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA user_version=99;");
  db.close();

  const store = new SqliteExecutionStateStore(path);
  const response = process(boundaryFor(store, { syntheticProviderScenario: "would-accept" }));
  assert.equal(response.result.state, "blocked");
  assert.equal(response.result.executed, false);
  assert.equal(response.result.reason, "EXECUTION_STATE_INVALID");
  assert.equal(response.result.providerResult, undefined);
  store.close();
}));

test("database open failures fail closed with no in-memory fallback", () => withDatabasePath((_path, directory) => {
  const store = new SqliteExecutionStateStore(directory);
  const response = process(boundaryFor(store, { syntheticProviderScenario: "would-accept" }));
  assert.equal(response.result.state, "blocked");
  assert.equal(response.result.executed, false);
  assert.equal(response.result.reason, "EXECUTION_STATE_UNAVAILABLE");
  assert.equal(response.result.providerResult, undefined);
  assert.equal(response.auditEvents.some(({ kind }) => kind === "provider-evaluated"), false);
  store.close();
}));

test("durable store rejects extra result fields and persists no supplied secret marker", () => withDatabasePath((path) => {
  const store = new SqliteExecutionStateStore(path);
  const scope = { userId: valid.userId, accountId: valid.accountId, idempotencyKey: valid.idempotencyKey };
  store.claim(scope, { intentId: valid.intentId, symbol: valid.symbol }, "2026-08-12T12:01:00.000Z");
  const secretMarker = "NEVER_PERSIST_THIS_SECRET";
  assert.throws(() => store.complete(scope, {
    intentId: valid.intentId,
    idempotencyKey: valid.idempotencyKey,
    state: "blocked",
    executed: false,
    duplicate: false,
    reason: "GLOBAL_EXECUTION_DISABLED",
    preview: {
      symbol: "BTC_USDT", side: "long", orderType: "limit", quantity: 0.001,
      normalizedContractVolume: 10, referencePrice: 65000, estimatedNotional: 65,
      estimatedMargin: 6.5, policyVersion: "execution-preview-policy/1.0.0",
      price: 65000, leverage: 10, reduceOnly: false,
    },
    apiSecret: secretMarker,
  }), (error) => error instanceof ExecutionStateStoreError && error.code === "EXECUTION_STATE_INVALID");
  store.close();
  assert.doesNotMatch(readFileSync(path).toString("utf8"), new RegExp(secretMarker));
  assert.equal(statSync(path).mode & 0o777, 0o600);
}));
