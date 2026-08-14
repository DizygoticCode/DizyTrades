import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { readProductionExecutionOwnershipBinding } from "../app/lib/execution/internal/ownership-binding.ts";
import { activateExecutionAccountOwnership, createProductionOwnershipProofOrchestrator, proveExecutionAccountOwnership, revokeExecutionAccountOwnership } from "../app/lib/execution/internal/ownership-ceremony.ts";
import { ExecutionOwnershipStoreError, SqliteExecutionOwnershipStore } from "../app/lib/execution/internal/ownership-store.ts";

const caller = Object.freeze({ callerId: "caller-1", userId: "rob", accountId: "owner-mexc-1" });
const identity = Object.freeze({ userId: caller.userId, accountId: caller.accountId });
const bindingEnv = Object.freeze({
  OWNER_MEXC_EXECUTION_ACCOUNT_ID: caller.accountId,
  OWNER_MEXC_EXECUTION_ACCOUNT_BINDING_ATTESTATION: "owner-mexc-readonly-exact-account/v1",
  OWNER_MEXC_EXECUTION_CREDENTIAL_GENERATION: "1",
});
const binding = () => readProductionExecutionOwnershipBinding(bindingEnv);
const at = "2026-08-14T01:00:00.000Z";
const observation = (overrides = {}) => Object.freeze({ version: "mexc-provider-readback/1.0.0", provider: "mexc", userId: caller.userId, accountId: caller.accountId, observedAt: at, settlementCurrency: "USDT", equity: 100, availableMargin: 100, positions: Object.freeze([]), ...overrides });
const directory = () => mkdtempSync(join(tmpdir(), "execution-ownership-"));

test("binding is explicit server metadata and default deny", () => {
  assert.equal(readProductionExecutionOwnershipBinding({}), null);
  const value = binding();
  assert.equal(value?.userId, "rob");
  assert.equal(value?.accountId, caller.accountId);
  assert.match(value?.bindingDigest ?? "", /^[a-f0-9]{64}$/);
  assert.throws(() => readProductionExecutionOwnershipBinding({ ...bindingEnv, OWNER_MEXC_EXECUTION_ACCOUNT_BINDING_ATTESTATION: "wrong" }));
});

test("fresh exact Radar proof does not activate by itself", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(store, caller, binding(), observation(), new Date(at));
  assert.equal(proved.status, "proved");
  assert.equal(proved.bindingDigest, binding()?.bindingDigest);
  assert.equal(proved.activatedAt, null);
});

test("successful Radar cannot prove an arbitrary authenticated account id", async () => {
  const attacker = Object.freeze({ callerId: "caller-1", userId: "rob", accountId: "invented-account" });
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const forgedReadback = observation({ accountId: attacker.accountId });
  assert.equal(proveExecutionAccountOwnership(store, attacker, binding(), forgedReadback, new Date(at)).status, "unknown");
  let calls = 0;
  const orchestrate = createProductionOwnershipProofOrchestrator(store, async () => { calls += 1; return forgedReadback; }, () => new Date(at), binding);
  assert.equal((await orchestrate(attacker)).status, "unknown");
  assert.equal(calls, 0, "binding mismatch must suppress even GET-only Radar work");
});

test("identity mismatch, missing binding, and stale proof remain fail closed", () => {
  for (const [proofBinding, value] of [[null, observation()], [binding(), observation({ accountId: "other" })], [binding(), observation({ observedAt: "2026-08-13T00:00:00.000Z" })]]) {
    const store = new SqliteExecutionOwnershipStore(":memory:");
    assert.equal(proveExecutionAccountOwnership(store, caller, proofBinding, value, new Date(at)).status, "unknown");
  }
});

test("explicit activation requires current binding, fresh proof, and exact revision", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(store, caller, binding(), observation(), new Date(at));
  assert.equal(activateExecutionAccountOwnership(store, caller, null, proved.revision, new Date(at)).status, "proved");
  assert.equal(activateExecutionAccountOwnership(store, caller, binding(), proved.revision + 1, new Date(at)).status, "proved");
  assert.equal(activateExecutionAccountOwnership(store, caller, binding(), proved.revision, new Date(at)).status, "active");
});

test("binding generation change invalidates proof", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(store, caller, binding(), observation(), new Date(at));
  const changed = readProductionExecutionOwnershipBinding({ ...bindingEnv, OWNER_MEXC_EXECUTION_CREDENTIAL_GENERATION: "2" });
  assert.equal(activateExecutionAccountOwnership(store, caller, changed, proved.revision, new Date(at)).status, "proved");
  assert.throws(() => store.recordProof(identity, changed.bindingDigest, at, proved.revision), (error) => error instanceof ExecutionOwnershipStoreError && error.code === "EXECUTION_OWNERSHIP_INVALID");
});

test("stale proof cannot be activated", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(store, caller, binding(), observation(), new Date(at));
  const later = new Date(Date.parse(at) + 60_000);
  assert.equal(activateExecutionAccountOwnership(store, caller, binding(), proved.revision, later).status, "proved");
});

test("revocation is explicit and sticky across later successful proof", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(store, caller, binding(), observation(), new Date(at));
  const active = activateExecutionAccountOwnership(store, caller, binding(), proved.revision, new Date(at));
  const revoked = revokeExecutionAccountOwnership(store, caller, active.revision, new Date(at));
  assert.equal(revoked.status, "revoked");
  assert.equal(proveExecutionAccountOwnership(store, caller, binding(), observation(), new Date(at)).status, "revoked");
});

test("exact accounts are isolated and durable across restart", () => {
  const dir = directory(), path = join(dir, "ownership.sqlite");
  try {
    let store = new SqliteExecutionOwnershipStore(path);
    const proved = proveExecutionAccountOwnership(store, caller, binding(), observation(), new Date(at));
    activateExecutionAccountOwnership(store, caller, binding(), proved.revision, new Date(at));
    assert.equal(store.read({ userId: "rob", accountId: "other" }).status, "unknown");
    store.close();
    store = new SqliteExecutionOwnershipStore(path);
    assert.equal(store.read(identity).status, "active");
    assert.deepEqual(store.events(identity).map((event) => event.kind), ["proof-recorded", "activated"]);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CAS races, backing replacement, and semantic corruption fail closed", () => {
  const memory = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(memory, caller, binding(), observation(), new Date(at));
  assert.throws(() => memory.activate(identity, at, proved.revision - 1));
  for (const attack of ["delete", "replace"]) {
    const dir = directory(), path = join(dir, "ownership.sqlite");
    try {
      const store = new SqliteExecutionOwnershipStore(path); store.read(identity);
      if (attack === "delete") unlinkSync(path); else { const replacement = join(dir, "replacement"); writeFileSync(replacement, "invalid"); renameSync(replacement, path); }
      assert.throws(() => store.read(identity), (error) => error instanceof ExecutionOwnershipStoreError && error.code === "EXECUTION_OWNERSHIP_UNAVAILABLE");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const dir = directory(), path = join(dir, "ownership.sqlite");
  try {
    let store = new SqliteExecutionOwnershipStore(path);
    proveExecutionAccountOwnership(store, caller, binding(), observation(), new Date(at)); store.close();
    const db = new DatabaseSync(path); db.exec("UPDATE execution_ownership SET status='active', binding_digest=NULL"); db.close();
    store = new SqliteExecutionOwnershipStore(path);
    assert.throws(() => store.read(identity), (error) => error instanceof ExecutionOwnershipStoreError && error.code === "EXECUTION_OWNERSHIP_INVALID");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("durable ownership audit contains bounded metadata and no credential material", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(store, caller, binding(), observation(), new Date(at));
  activateExecutionAccountOwnership(store, caller, binding(), proved.revision, new Date(at));
  const serialized = JSON.stringify(store.events(identity));
  assert.doesNotMatch(serialized, /api.?key|secret|credential|session|assertion/i);
});
