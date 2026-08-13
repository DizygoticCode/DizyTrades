import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdtempSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { executionCapabilityGate } from "../app/lib/execution/internal/gate.ts";
import { executionAccountKey, executionKillSwitchReason } from "../app/lib/execution/internal/kill-switch.ts";
import { ExecutionControlStoreError, SqliteExecutionControlStore } from "../app/lib/execution/internal/control-store.ts";

const at = new Date("2026-08-13T12:00:00.000Z");
const identity = { userId: "user-1", accountId: "account-1" };
const directory = () => mkdtempSync(join(tmpdir(), "dizy-execution-controls-"));
const enabled = (overrides = {}) => ({ armed: true, globalDisabled: false, disabledUserIds: [], disabledAccountKeys: [], maintenance: false, emergencyStop: false, providerObservedAt: at.toISOString(), providerValidForMs: 60_000, ...overrides });

test("missing control storage is initialized restart-safe and fail-closed", () => {
  const root = directory();
  try {
    const path = join(root, "controls.sqlite");
    const first = new SqliteExecutionControlStore(path, () => at).read();
    assert.equal(first.armed, false); assert.equal(first.globalDisabled, true);
    assert.equal(new SqliteExecutionControlStore(path).read().revision, first.revision);
    assert.equal(executionKillSwitchReason(new SqliteExecutionControlStore(path).switches(at), identity), "GLOBAL_EXECUTION_DISABLED");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("durable controls persist updates and calculate provider freshness fail-closed", () => {
  const root = directory();
  try {
    const path = join(root, "controls.sqlite"); const store = new SqliteExecutionControlStore(path, () => at);
    const updated = store.replace(store.read().revision, enabled());
    assert.equal(new SqliteExecutionControlStore(path).read().armed, true);
    assert.equal(executionKillSwitchReason(new SqliteExecutionControlStore(path).switches(at), identity), null);
    assert.equal(executionKillSwitchReason(new SqliteExecutionControlStore(path).switches(new Date(at.getTime() + 60_001)), identity), "PROVIDER_STATE_STALE");
    assert.equal(updated.revision, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an open store fails closed when its backing file is deleted and restart initializes disarmed", () => {
  const root = directory();
  try {
    const path = join(root, "controls.sqlite");
    const store = new SqliteExecutionControlStore(path, () => at);
    store.replace(store.read().revision, enabled());
    unlinkSync(path);
    assert.throws(() => store.switches(at), (error) => error instanceof ExecutionControlStoreError && error.code === "EXECUTION_CONTROL_UNAVAILABLE");
    const restarted = new SqliteExecutionControlStore(path, () => at).read();
    assert.equal(restarted.armed, false);
    assert.equal(restarted.globalDisabled, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an open store fails closed when its backing file is atomically replaced", () => {
  const root = directory();
  try {
    const path = join(root, "controls.sqlite");
    const replacement = join(root, "replacement.sqlite");
    const store = new SqliteExecutionControlStore(path, () => at);
    store.replace(store.read().revision, enabled());
    copyFileSync(path, replacement);
    renameSync(replacement, path);
    assert.throws(() => store.switches(at), (error) => error instanceof ExecutionControlStoreError && error.code === "EXECUTION_CONTROL_UNAVAILABLE");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("account disables are isolated by canonical user and account identity", () => {
  const sharedAccount = "shared-account";
  const first = { userId: "user-1", accountId: sharedAccount };
  const second = { userId: "user-2", accountId: sharedAccount };
  const switches = { armed: true, globalDisabled: false, disabledUserIds: new Set(),
    disabledAccountKeys: new Set([executionAccountKey(first)]), maintenance: false,
    emergencyStop: false, providerStateFresh: true };
  assert.equal(executionKillSwitchReason(switches, first), "ACCOUNT_EXECUTION_DISABLED");
  assert.equal(executionKillSwitchReason(switches, second), null);
});

test("emergency, maintenance, global, user, account, disarmed and stale precedence is deterministic", () => {
  const base = { armed: true, globalDisabled: false, disabledUserIds: new Set(), disabledAccountKeys: new Set(), maintenance: false, emergencyStop: false, providerStateFresh: true };
  const reason = (changes) => executionKillSwitchReason({ ...base, ...changes }, identity);
  assert.equal(reason({ emergencyStop: true, maintenance: true, globalDisabled: true }), "EMERGENCY_STOP");
  assert.equal(reason({ maintenance: true, globalDisabled: true }), "MAINTENANCE_STOP");
  assert.equal(reason({ globalDisabled: true, disabledUserIds: new Set([identity.userId]), disabledAccountKeys: new Set([executionAccountKey(identity)]) }), "GLOBAL_EXECUTION_DISABLED");
  assert.equal(reason({ disabledUserIds: new Set([identity.userId]), disabledAccountKeys: new Set([executionAccountKey(identity)]) }), "USER_EXECUTION_DISABLED");
  assert.equal(reason({ disabledAccountKeys: new Set([executionAccountKey(identity)]) }), "ACCOUNT_EXECUTION_DISABLED");
  assert.equal(reason({ armed: false }), "EXECUTION_DISARMED");
  assert.equal(reason({ providerStateFresh: false }), "PROVIDER_STATE_STALE");
});

test("malformed, corrupt and unsupported durable state fails closed", () => {
  for (const document of ["not-json", JSON.stringify({}), JSON.stringify({ schemaVersion: "execution-control/999" })]) {
    const root = directory();
    try {
      const path = join(root, "controls.sqlite"); new SqliteExecutionControlStore(path).read();
      const db = new DatabaseSync(path); db.prepare("UPDATE execution_control SET document=? WHERE singleton=1").run(document); db.close();
      assert.throws(() => new SqliteExecutionControlStore(path).read(), (error) => error instanceof ExecutionControlStoreError && error.code === "EXECUTION_CONTROL_INVALID");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("atomic compare-and-swap rejects concurrent stale updates without partial state", () => {
  const root = directory();
  try {
    const path = join(root, "controls.sqlite"); const a = new SqliteExecutionControlStore(path, () => at); const b = new SqliteExecutionControlStore(path, () => at);
    const revision = a.read().revision; a.replace(revision, enabled({ emergencyStop: true }));
    assert.throws(() => b.replace(revision, enabled({ emergencyStop: false })), (error) => error instanceof ExecutionControlStoreError && error.code === "EXECUTION_CONTROL_CONFLICT");
    assert.equal(b.read().emergencyStop, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("storage failure and environment arming attempts remain fail-closed", () => {
  const root = directory();
  try {
    chmodSync(root, 0o400);
    // Root can bypass directory modes, so an invalid SQLite target deterministically proves open failure.
    assert.throws(() => new SqliteExecutionControlStore(root).read(), (error) => error instanceof ExecutionControlStoreError && error.code === "EXECUTION_CONTROL_UNAVAILABLE");
    assert.equal(executionCapabilityGate({ LIVE_TRADING_ENABLED: "true", EXECUTION_ARMED: "true" }).enabled, false);
    assert.equal(executionCapabilityGate({ LIVE_TRADING_ENABLED: "true" }).reason, "adapter-unavailable");
  } finally { chmodSync(root, 0o700); rmSync(root, { recursive: true, force: true }); }
});
