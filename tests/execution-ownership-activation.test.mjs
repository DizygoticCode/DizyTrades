import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { ExecutionOwnershipCeremony } from "../app/lib/execution/internal/ownership-ceremony.ts";
import { ExecutionOwnershipStoreError, SqliteExecutionOwnershipStore } from "../app/lib/execution/internal/ownership-store.ts";

const identity = Object.freeze({ userId: "user-1", accountId: "account-1" });
const assertion = Object.freeze({ callerId: "dizytrades-server", assertionId: "single-use" });
const at = "2026-08-14T12:00:00.000Z";
const proof = (overrides = {}) => Object.freeze({
  version: "mexc-provider-readback/1.0.0", provider: "mexc", ...identity,
  observedAt: at, settlementCurrency: "USDT", equity: 100, availableMargin: 100,
  positions: Object.freeze([]), ...overrides,
});
const verifier = () => ({ callerId: assertion.callerId, ...identity });
const ceremony = (store, readback = async () => proof(), now = () => new Date(at)) => new ExecutionOwnershipCeremony(store, verifier, readback, now);
const directory = () => mkdtempSync(join(tmpdir(), "execution-ownership-"));

test("unknown account is unproved and Radar proof alone never activates", async () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  assert.deepEqual(store.read(identity), { revision: 0, status: "unknown", proofObservedAt: null, activatedAt: null, revokedAt: null });
  const proved = await ceremony(store).prove(assertion, identity, 0);
  assert.equal(proved.status, "proved");
  assert.equal(proved.proofObservedAt, at);
  assert.equal(proved.activatedAt, null);
});

test("exact authenticated identity and fresh Radar proof permit a separate explicit activation", async () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = await ceremony(store).prove(assertion, identity, 0);
  const active = ceremony(store).activate(assertion, identity, proved.revision);
  assert.equal(active.status, "active");
  assert.equal(active.activatedAt, at);
  assert.equal(store.read({ userId: identity.userId, accountId: "account-2" }).status, "unknown");
  const refreshed = await ceremony(store).prove(assertion, identity, active.revision);
  assert.equal(refreshed.status, "active");
  assert.equal(refreshed.activatedAt, at);
});

test("caller/readback identity mismatch and stale readback reject without durable proof", async () => {
  for (const [readback, code] of [
    [async () => proof({ accountId: "account-2" }), "EXECUTION_OWNERSHIP_IDENTITY_MISMATCH"],
    [async () => proof({ observedAt: "2026-08-14T11:59:00.000Z" }), "EXECUTION_OWNERSHIP_PROOF_STALE"],
  ]) {
    const store = new SqliteExecutionOwnershipStore(":memory:");
    await assert.rejects(ceremony(store, readback).prove(assertion, identity, 0), (error) => error.code === code);
    assert.equal(store.read(identity).status, "unknown");
  }
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const mismatch = new ExecutionOwnershipCeremony(store, () => ({ callerId: assertion.callerId, userId: "user-2", accountId: identity.accountId }), async () => proof(), () => new Date(at));
  await assert.rejects(mismatch.prove(assertion, identity, 0), (error) => error.code === "EXECUTION_OWNERSHIP_IDENTITY_MISMATCH");
});

test("revocation is sticky across later readback and reactivation remains deliberate", async () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = await ceremony(store).prove(assertion, identity, 0);
  const active = ceremony(store).activate(assertion, identity, proved.revision);
  const revoked = ceremony(store).revoke(assertion, identity, active.revision);
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.proofObservedAt, null);
  const reproved = await ceremony(store).prove(assertion, identity, revoked.revision);
  assert.equal(reproved.status, "revoked");
  assert.equal(reproved.proofObservedAt, at);
  assert.equal(ceremony(store).activate(assertion, identity, reproved.revision).status, "active");
});

test("ownership state is exact-account isolated and restart durable", async () => {
  const dir = directory(), path = join(dir, "ownership.sqlite");
  try {
    let store = new SqliteExecutionOwnershipStore(path);
    await ceremony(store).prove(assertion, identity, 0);
    store.close();
    store = new SqliteExecutionOwnershipStore(path);
    assert.equal(store.read(identity).status, "proved");
    assert.equal(store.read({ userId: "user-2", accountId: identity.accountId }).status, "unknown");
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CAS races and invalid transition sequences fail closed", async () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = await ceremony(store).prove(assertion, identity, 0);
  assert.throws(() => store.activate(identity, 0, new Date(at)), (error) => error.code === "EXECUTION_OWNERSHIP_INVALID");
  assert.throws(() => store.revoke({ userId: "other", accountId: "account-1" }, 0, new Date(at)), (error) => error.code === "EXECUTION_OWNERSHIP_INVALID");
  store.activate(identity, proved.revision, new Date(at));
  assert.throws(() => store.activate(identity, 2, new Date(at)), (error) => error.code === "EXECUTION_OWNERSHIP_INVALID");
});

test("open backing-file deletion and replacement fail closed", () => {
  for (const attack of ["delete", "replace"]) {
    const dir = directory(), path = join(dir, "ownership.sqlite");
    try {
      const store = new SqliteExecutionOwnershipStore(path); store.read(identity);
      if (attack === "delete") unlinkSync(path);
      else { const replacement = join(dir, "replacement"); writeFileSync(replacement, "invalid"); renameSync(replacement, path); }
      assert.throws(() => store.read(identity), (error) => error instanceof ExecutionOwnershipStoreError && error.code === "EXECUTION_OWNERSHIP_UNAVAILABLE");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("semantically corrupt rows fail closed and durable rows contain no secret material", async () => {
  const dir = directory(), path = join(dir, "ownership.sqlite");
  try {
    let store = new SqliteExecutionOwnershipStore(path);
    await ceremony(store, async () => proof({ providerRequestId: "secret-api-key-session-token" })).prove(assertion, identity, 0);
    store.close();
    const database = new DatabaseSync(path);
    const columns = database.prepare("PRAGMA table_info(ownership_state)").all().map((row) => row.name);
    assert.deepEqual(columns, ["schema_version", "user_id", "account_id", "revision", "status", "proof_observed_at", "activated_at", "revoked_at", "updated_at"]);
    assert.doesNotMatch(JSON.stringify(database.prepare("SELECT * FROM ownership_state").all()), /secret|token|credential|assertion/i);
    database.exec("UPDATE ownership_state SET status='active', activated_at=NULL"); database.close();
    store = new SqliteExecutionOwnershipStore(path);
    assert.throws(() => store.read(identity), (error) => error.code === "EXECUTION_OWNERSHIP_INVALID");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
