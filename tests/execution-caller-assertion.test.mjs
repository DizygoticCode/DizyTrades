import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
