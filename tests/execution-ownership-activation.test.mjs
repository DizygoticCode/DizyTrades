import assert from "node:assert/strict";
import {
  mkdtempSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  activateExecutionAccountOwnership,
  createProductionOwnershipProofOrchestrator,
  proveExecutionAccountOwnership,
  revokeExecutionAccountOwnership,
} from "../app/lib/execution/internal/ownership-ceremony.ts";
import {
  ExecutionOwnershipStoreError,
  SqliteExecutionOwnershipStore,
} from "../app/lib/execution/internal/ownership-store.ts";

const caller = Object.freeze({
  callerId: "caller-1",
  userId: "user-1",
  accountId: "account-1",
});
const identity = Object.freeze({
  userId: caller.userId,
  accountId: caller.accountId,
});
const at = "2026-08-14T01:00:00.000Z";
const observation = (overrides = {}) =>
  Object.freeze({
    version: "mexc-provider-readback/1.0.0",
    provider: "mexc",
    userId: caller.userId,
    accountId: caller.accountId,
    observedAt: at,
    settlementCurrency: "USDT",
    equity: 100,
    availableMargin: 100,
    positions: Object.freeze([]),
    ...overrides,
  });
const directory = () => mkdtempSync(join(tmpdir(), "execution-ownership-"));

test("fresh exact Radar proof does not activate by itself", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(
    store,
    caller,
    observation(),
    new Date(at),
  );
  assert.equal(proved.status, "proved");
  assert.equal(proved.proofObservedAt, at);
  assert.equal(proved.activatedAt, null);
  assert.equal(store.events(identity).at(-1)?.kind, "proof-recorded");
});
test("identity mismatch and stale proof remain fail-closed", () => {
  for (const value of [
    observation({ accountId: "other" }),
    observation({ observedAt: "2026-08-13T00:00:00.000Z" }),
  ]) {
    const store = new SqliteExecutionOwnershipStore(":memory:");
    assert.equal(
      proveExecutionAccountOwnership(store, caller, value, new Date(at)).status,
      "unknown",
    );
  }
});
test("explicit activation requires fresh proof and exact revision", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(
    store,
    caller,
    observation(),
    new Date(at),
  );
  assert.equal(
    activateExecutionAccountOwnership(
      store,
      caller,
      proved.revision + 1,
      new Date(at),
    ).status,
    "proved",
  );
  const active = activateExecutionAccountOwnership(
    store,
    caller,
    proved.revision,
    new Date(at),
  );
  assert.equal(active.status, "active");
  assert.equal(active.activatedAt, at);
});
test("stale proof cannot be activated", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(
    store,
    caller,
    observation(),
    new Date(at),
  );
  const later = new Date(Date.parse(at) + 60_000);
  assert.equal(
    activateExecutionAccountOwnership(store, caller, proved.revision, later)
      .status,
    "proved",
  );
});
test("revocation is explicit and sticky across later successful proof", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(
    store,
    caller,
    observation(),
    new Date(at),
  );
  const active = activateExecutionAccountOwnership(
    store,
    caller,
    proved.revision,
    new Date(at),
  );
  const revoked = revokeExecutionAccountOwnership(
    store,
    caller,
    active.revision,
    new Date(at),
  );
  assert.equal(revoked.status, "revoked");
  const laterProof = proveExecutionAccountOwnership(
    store,
    caller,
    observation(),
    new Date(at),
  );
  assert.equal(laterProof.status, "revoked");
  assert.equal(laterProof.revision, revoked.revision);
});
test("exact accounts are isolated and durable across restart", () => {
  const dir = directory();
  const path = join(dir, "ownership.sqlite");
  try {
    let store = new SqliteExecutionOwnershipStore(path);
    const proved = proveExecutionAccountOwnership(
      store,
      caller,
      observation(),
      new Date(at),
    );
    activateExecutionAccountOwnership(
      store,
      caller,
      proved.revision,
      new Date(at),
    );
    assert.equal(
      store.read({ userId: "user-1", accountId: "account-2" }).status,
      "unknown",
    );
    store.close();
    store = new SqliteExecutionOwnershipStore(path);
    assert.equal(store.read(identity).status, "active");
    assert.deepEqual(
      store.events(identity).map((event) => event.kind),
      ["proof-recorded", "activated"],
    );
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("CAS races fail closed", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(
    store,
    caller,
    observation(),
    new Date(at),
  );
  assert.throws(
    () => store.activate(identity, at, proved.revision - 1),
    (error) =>
      error instanceof ExecutionOwnershipStoreError &&
      error.code === "EXECUTION_OWNERSHIP_INVALID",
  );
});
test("backing database deletion and replacement fail closed", () => {
  for (const attack of ["delete", "replace"]) {
    const dir = directory();
    const path = join(dir, "ownership.sqlite");
    try {
      const store = new SqliteExecutionOwnershipStore(path);
      store.read(identity);
      if (attack === "delete") unlinkSync(path);
      else {
        const replacement = join(dir, "replacement");
        writeFileSync(replacement, "invalid");
        renameSync(replacement, path);
      }
      assert.throws(
        () => store.read(identity),
        (error) =>
          error instanceof ExecutionOwnershipStoreError &&
          error.code === "EXECUTION_OWNERSHIP_UNAVAILABLE",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
test("semantically corrupt ownership rows fail closed", () => {
  for (const mutation of [
    "status='active', proof_observed_at=NULL",
    "updated_at='not-a-timestamp'",
  ]) {
    const dir = directory();
    const path = join(dir, "ownership.sqlite");
    try {
      let store = new SqliteExecutionOwnershipStore(path);
      proveExecutionAccountOwnership(
        store,
        caller,
        observation(),
        new Date(at),
      );
      store.close();
      const db = new DatabaseSync(path);
      db.exec(`UPDATE execution_ownership SET ${mutation}`);
      db.close();
      store = new SqliteExecutionOwnershipStore(path);
      assert.throws(
        () => store.read(identity),
        (error) =>
          error instanceof ExecutionOwnershipStoreError &&
          error.code === "EXECUTION_OWNERSHIP_INVALID",
      );
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
test("durable audit events are bounded metadata and contain no credential material", () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  const proved = proveExecutionAccountOwnership(
    store,
    caller,
    observation(),
    new Date(at),
  );
  activateExecutionAccountOwnership(
    store,
    caller,
    proved.revision,
    new Date(at),
  );
  const serialized = JSON.stringify(store.events(identity));
  assert.doesNotMatch(
    serialized,
    /api.?key|secret|credential|session|assertion/i,
  );
  assert.match(serialized, /proof-recorded/);
  assert.match(serialized, /activated/);
});
test("production proof orchestration consumes exact identity-bound Radar readback", async () => {
  const store = new SqliteExecutionOwnershipStore(":memory:");
  let calls = 0;
  const orchestrate = createProductionOwnershipProofOrchestrator(
    store,
    async (requested) => {
      calls += 1;
      assert.deepEqual(requested, identity);
      return observation();
    },
    () => new Date(at),
  );
  assert.equal((await orchestrate(caller)).status, "proved");
  assert.equal(calls, 1);
});
