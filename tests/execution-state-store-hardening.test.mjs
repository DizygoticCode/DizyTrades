import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  ExecutionStateStoreError,
  SqliteExecutionStateStore,
} from "../app/lib/execution/internal/state-store.ts";

const scope = Object.freeze({
  userId: "user-1",
  accountId: "account-1",
  idempotencyKey: "idempotency-0001",
});
const identity = Object.freeze({ intentId: "intent-0001", symbol: "BTC_USDT" });
const occurredAt = "2026-08-12T12:01:00.000Z";
const preview = Object.freeze({
  symbol: "BTC_USDT",
  side: "long",
  orderType: "limit",
  quantity: 0.001,
  normalizedContractVolume: 10,
  referencePrice: 65000,
  estimatedNotional: 65,
  estimatedMargin: 6.5,
  policyVersion: "execution-preview-policy/1.0.0",
  price: 65000,
  leverage: 10,
  reduceOnly: false,
});

function withDatabasePath(fn) {
  const directory = mkdtempSync(join(tmpdir(), "dizy-execution-hardening-"));
  const path = join(directory, "execution-state.sqlite");
  try { return fn(path); } finally { rmSync(directory, { recursive: true, force: true }); }
}

function expectInvalid(fn) {
  assert.throws(fn, (error) => error instanceof ExecutionStateStoreError
    && error.code === "EXECUTION_STATE_INVALID");
}

test("durable state rejects impossible state and reason combinations before persistence", () => withDatabasePath((path) => {
  const store = new SqliteExecutionStateStore(path);
  assert.equal(store.claim(scope, identity, occurredAt).kind, "claimed");

  expectInvalid(() => store.complete(scope, {
    intentId: identity.intentId,
    idempotencyKey: scope.idempotencyKey,
    state: "blocked",
    executed: false,
    duplicate: false,
    reason: "INVALID_SIDE",
    preview,
  }, occurredAt));

  const duplicate = store.claim(scope, identity, occurredAt);
  assert.equal(duplicate.kind, "duplicate");
  assert.equal(duplicate.result, null);
  store.close();
}));

test("corrupt durable state and reason combinations fail closed on reload", () => withDatabasePath((path) => {
  const first = new SqliteExecutionStateStore(path);
  first.claim(scope, identity, occurredAt);
  first.complete(scope, {
    intentId: identity.intentId,
    idempotencyKey: scope.idempotencyKey,
    state: "blocked",
    executed: false,
    duplicate: false,
    reason: "GLOBAL_EXECUTION_DISABLED",
    preview,
  }, occurredAt);
  first.close();

  const db = new DatabaseSync(path);
  db.prepare("UPDATE execution_state SET result_reason='INVALID_SIDE' WHERE user_id=? AND account_id=? AND idempotency_key=?")
    .run(scope.userId, scope.accountId, scope.idempotencyKey);
  db.close();

  const reopened = new SqliteExecutionStateStore(path);
  expectInvalid(() => reopened.claim(scope, identity, occurredAt));
  reopened.close();
}));

test("bounded rejected results round-trip with null preview and remain non-executing", () => withDatabasePath((path) => {
  const first = new SqliteExecutionStateStore(path);
  first.claim(scope, identity, occurredAt);
  first.complete(scope, {
    intentId: identity.intentId,
    idempotencyKey: scope.idempotencyKey,
    state: "rejected",
    executed: false,
    duplicate: false,
    reason: "POLICY_SYMBOL_DENIED",
    preview: null,
  }, occurredAt);
  first.close();

  const reopened = new SqliteExecutionStateStore(path);
  const duplicate = reopened.claim(scope, identity, occurredAt);
  assert.equal(duplicate.kind, "duplicate");
  assert.deepEqual(duplicate.result, {
    intentId: identity.intentId,
    idempotencyKey: scope.idempotencyKey,
    state: "rejected",
    executed: false,
    duplicate: false,
    reason: "POLICY_SYMBOL_DENIED",
    preview: null,
  });
  reopened.close();
}));
