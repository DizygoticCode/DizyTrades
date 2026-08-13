import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";

import { beginMfaEnrollment, closeAuthDatabaseForTests, createAccount, createDatabaseSession, createEmailVerificationTokenForUser, getAuthDatabase, revokeDatabaseSession, verifyEmailToken } from "../app/lib/auth-db.ts";

import {
  EXECUTION_INTERNAL_CALLER_ID,
  ExecutionCallerAssertionStore,
} from "../app/lib/execution/internal/caller-assertion.ts";

const identity = { userId: "user-1", sessionFingerprint: "a".repeat(64), expiresAt: 99_999 };
const fixture = (clock = { now: 1_000 }) => {
  const root = mkdtempSync(join(tmpdir(), "dizy-caller-")), path = join(root, "caller.sqlite");
  let active = true;
  const resolve = token => token === "s".repeat(43) && active ? identity : null;
  const fingerprint = value => value === identity.sessionFingerprint && active ? identity : null;
  return { root, path, clock, setActive: value => { active = value; }, store: new ExecutionCallerAssertionStore(path, () => clock.now, resolve, fingerprint) };
};

test("TOTP-grade test seam mints a bounded opaque assertion and binds every identity", () => {
  const f = fixture();
  try {
    const issued = f.store.issue({ sessionToken: "s".repeat(43), accountId: "account-1" });
    assert.equal(issued.callerId, EXECUTION_INTERNAL_CALLER_ID);
    assert.match(issued.assertionId, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(issued.expiresAt - f.clock.now <= 30_000);
    assert.equal(f.store.consume({ callerId: "other", assertionId: issued.assertionId }), null);
    assert.deepEqual(f.store.consume(issued), { callerId: EXECUTION_INTERNAL_CALLER_ID, userId: "user-1", accountId: "account-1" });
  } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});

test("ordinary, recovery, viewer and legacy-equivalent non-grade sessions cannot mint", () => {
  const f = fixture();
  try {
    for (const token of ["password", "recovery", "signed.payload", "viewer"]) assert.equal(f.store.issue({ sessionToken: token, accountId: "account-1" }), null);
    assert.equal(f.store.issue({ sessionToken: "s".repeat(43), accountId: "bad/account" }), null);
    assert.equal(f.store.issue({ sessionToken: "s".repeat(43), accountId: "account-1", callerId: "client-choice" }), null);
  } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});

test("malformed, random, expired and revoked-session assertions reject", () => {
  const f = fixture();
  try {
    assert.equal(f.store.consume({ callerId: EXECUTION_INTERNAL_CALLER_ID, assertionId: "bad" }), null);
    assert.equal(f.store.consume({ callerId: EXECUTION_INTERNAL_CALLER_ID, assertionId: "z".repeat(43) }), null);
    const expired = f.store.issue({ sessionToken: "s".repeat(43), accountId: "account-1" });
    f.clock.now = expired.expiresAt;
    assert.equal(f.store.consume(expired), null);
    f.clock.now = 2_000;
    const revoked = f.store.issue({ sessionToken: "s".repeat(43), accountId: "account-1" });
    f.setActive(false);
    assert.equal(f.store.consume(revoked), null);
  } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});

test("consume is single-use and restart-safe", () => {
  const f = fixture();
  try {
    const issued = f.store.issue({ sessionToken: "s".repeat(43), accountId: "account-1" });
    assert.ok(f.store.consume(issued));
    assert.equal(f.store.consume(issued), null);
    f.store.close();
    const rebuilt = new ExecutionCallerAssertionStore(f.path, () => f.clock.now, () => identity, () => identity);
    assert.equal(rebuilt.consume(issued), null);
    rebuilt.close();
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("two independent handles atomically compete for one assertion", async () => {
  const f = fixture();
  try {
    const issued = f.store.issue({ sessionToken: "s".repeat(43), accountId: "account-1" });
    f.store.close();
    const gate = new SharedArrayBuffer(4), ready = new Int32Array(gate);
    const workerSource = `
      import { parentPort, workerData } from "node:worker_threads";
      import { DatabaseSync } from "node:sqlite";
      const store = new DatabaseSync(workerData.path); store.exec("PRAGMA busy_timeout=5000");
      Atomics.add(new Int32Array(workerData.gate), 0, 1); parentPort.postMessage("ready");
      Atomics.wait(new Int32Array(workerData.gate), 0, 1);
      try {
        store.exec("BEGIN IMMEDIATE");
        const result = store.prepare("UPDATE caller_assertions SET consumed_at=1000 WHERE assertion_hash=? AND consumed_at IS NULL AND expires_at>1000").run(workerData.assertionHash);
        store.exec("COMMIT"); parentPort.postMessage(result.changes === 1);
      } finally { store.close(); }
    `;
    const run = () => {
      let markReady;
      const ready = new Promise(resolve => { markReady = resolve; });
      const result = new Promise((resolve, reject) => {
        const assertionHash = createHash("sha256").update(issued.assertionId).digest("hex");
        const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(workerSource)}`), { workerData: { path: f.path, assertionHash, gate } });
        worker.on("message", value => { if (value === "ready") markReady(); else resolve(value); }); worker.on("error", reject);
      });
      return { ready, result };
    };
    const workers = [run(), run()];
    await Promise.all(workers.map(worker => worker.ready));
    Atomics.store(ready, 0, 2); Atomics.notify(ready, 0, 2);
    const results = await Promise.all(workers.map(worker => worker.result));
    assert.deepEqual(results.sort(), [false, true]);
  } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
});

test("cached handles fail closed when storage is deleted or replaced", () => {
  for (const operation of ["delete", "replace"]) {
    const f = fixture();
    try {
      const issued = f.store.issue({ sessionToken: "s".repeat(43), accountId: "account-1" });
      renameSync(f.path, `${f.path}.detached`);
      if (operation === "replace") writeFileSync(f.path, "replacement");
      assert.throws(() => f.store.consume(issued), /EXECUTION_CALLER_ASSERTION_UNAVAILABLE/);
      assert.throws(() => f.store.issue({ sessionToken: "s".repeat(43), accountId: "account-1" }), /EXECUTION_CALLER_ASSERTION_UNAVAILABLE/);
    } finally { f.store.close(); rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("unavailable, corrupt and unsupported assertion storage fail closed", () => {
  const root = mkdtempSync(join(tmpdir(), "dizy-caller-storage-"));
  try {
    const unavailable = new ExecutionCallerAssertionStore(root, () => 1_000, () => identity, () => identity);
    assert.throws(() => unavailable.issue({ sessionToken: "s".repeat(43), accountId: "account-1" }), /EXECUTION_CALLER_ASSERTION_UNAVAILABLE/);
    const corruptPath = join(root, "corrupt.sqlite"); writeFileSync(corruptPath, "not sqlite");
    assert.throws(() => new ExecutionCallerAssertionStore(corruptPath, () => 1_000, () => identity, () => identity).consume({ callerId: EXECUTION_INTERNAL_CALLER_ID, assertionId: "z".repeat(43) }), /EXECUTION_CALLER_ASSERTION_UNAVAILABLE/);
    const unsupportedPath = join(root, "unsupported.sqlite"), db = new DatabaseSync(unsupportedPath);
    db.exec("PRAGMA user_version=2"); db.close();
    assert.throws(() => new ExecutionCallerAssertionStore(unsupportedPath, () => 1_000, () => identity, () => identity).consume({ callerId: EXECUTION_INTERNAL_CALLER_ID, assertionId: "z".repeat(43) }), /EXECUTION_CALLER_ASSERTION_UNAVAILABLE/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("real database revocation invalidates an already-issued assertion", async () => {
  const root = mkdtempSync(join(tmpdir(), "dizy-caller-auth-")), prior = process.env.DATA_DIR;
  process.env.DATA_DIR = root; closeAuthDatabaseForTests();
  try {
    const user = await createAccount({ email: "caller@example.test", password: "correct-horse-battery" });
    verifyEmailToken(createEmailVerificationTokenForUser(user.id).token);
    const secret = beginMfaEnrollment(user.id);
    // Enrollment confirmation is covered by the MFA suite; activate the persisted credential directly here
    // so this acceptance test remains independent of wall-clock TOTP generation.
    assert.ok(secret);
    const authDb = getAuthDatabase();
    authDb.prepare("UPDATE mfa_credentials SET state='active',activated_at=? WHERE user_id=?").run(Date.now(), user.id);
    const session = createDatabaseSession(user, 3600, "totp"), store = new ExecutionCallerAssertionStore(join(root, "caller.sqlite"));
    const issued = store.issue({ sessionToken: session, accountId: "account-1" }); assert.ok(issued);
    revokeDatabaseSession(session);
    assert.equal(store.consume(issued), null);
    store.close();
  } finally {
    closeAuthDatabaseForTests(); if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    rmSync(root, { recursive: true, force: true });
  }
});
