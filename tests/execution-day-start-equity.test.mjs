import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  EXECUTION_DAY_START_CAPTURE_WINDOW_MS,
  ExecutionDayStartEquityStoreError,
  SqliteExecutionDayStartEquityStore,
  isDayStartCaptureObservation,
  utcDayFor,
} from "../app/lib/execution/internal/day-start-equity-store.ts";
import {
  ExecutionDayStartEquityAuthorityError,
  authoritativeRiskSnapshotFromDayStart,
  captureAuthoritativeDayStartEquity,
} from "../app/lib/execution/internal/day-start-equity-authority.ts";
import { MEXC_PROVIDER_READBACK_VERSION } from "../app/lib/mexc-provider-readback.ts";

const id = Object.freeze({ userId: "rob", accountId: "owner-mexc-1" });
const other = Object.freeze({ userId: "rob", accountId: "other" });
const digest = "a".repeat(64);
const binding = Object.freeze({
  version: "owner-mexc-readonly-account-binding/1.0.0",
  userId: "rob",
  accountId: id.accountId,
  credentialGeneration: "1",
  bindingDigest: digest,
});
const ownership = Object.freeze({
  revision: 3,
  status: "active",
  bindingDigest: digest,
  proofObservedAt: "2026-08-15T00:00:01.000Z",
  activatedAt: "2026-08-14T23:59:59.000Z",
  revokedAt: null,
});
const reconciliation = Object.freeze({
  revision: 7,
  status: "clean",
  reason: "CLEAN",
  expected: Object.freeze([]),
  observedAt: "2026-08-15T00:00:02.000Z",
});
const readback = (overrides = {}) => Object.freeze({
  version: MEXC_PROVIDER_READBACK_VERSION,
  provider: "mexc",
  userId: id.userId,
  accountId: id.accountId,
  observedAt: "2026-08-15T00:00:03.000Z",
  settlementCurrency: "USDT",
  equity: 10_000,
  availableMargin: 9_000,
  positions: Object.freeze([]),
  ...overrides,
});
const evidence = (overrides = {}) => Object.freeze({
  identity: id,
  binding,
  ownership,
  reconciliation,
  readback: readback(),
  ...overrides,
});
const now = new Date("2026-08-15T00:00:04.000Z");
const directory = () => mkdtempSync(join(tmpdir(), "execution-day-start-"));
const storeError = (code) => (error) => error instanceof ExecutionDayStartEquityStoreError && error.code === code;
const authorityError = (code) => (error) => error instanceof ExecutionDayStartEquityAuthorityError && error.code === code;

function capture(store, overrides = {}, at = now) {
  return captureAuthoritativeDayStartEquity(store, evidence(overrides), at);
}

test("UTC capture window is exactly five minutes from midnight", () => {
  assert.equal(EXECUTION_DAY_START_CAPTURE_WINDOW_MS, 300_000);
  assert.equal(utcDayFor("2026-08-15T23:59:59.999Z"), "2026-08-15");
  assert.equal(isDayStartCaptureObservation("2026-08-15", "2026-08-15T00:00:00.000Z"), true);
  assert.equal(isDayStartCaptureObservation("2026-08-15", "2026-08-15T00:04:59.999Z"), true);
  assert.equal(isDayStartCaptureObservation("2026-08-15", "2026-08-14T23:59:59.999Z"), false);
  assert.equal(isDayStartCaptureObservation("2026-08-15", "2026-08-15T00:05:00.000Z"), false);
});

test("baseline defaults deny, captures exact account once, and isolates other accounts", () => {
  const store = new SqliteExecutionDayStartEquityStore(":memory:");
  assert.equal(store.read(id, "2026-08-15"), null);
  const baseline = capture(store);
  assert.equal(baseline.utcDay, "2026-08-15");
  assert.equal(baseline.equity, 10_000);
  assert.equal(baseline.revision, 1);
  assert.equal(store.read(other, "2026-08-15"), null);
});

test("same exact capture is idempotent while conflicting same-day baseline is immutable", () => {
  const store = new SqliteExecutionDayStartEquityStore(":memory:");
  const first = capture(store);
  const same = capture(store);
  assert.deepEqual(same, first);
  assert.throws(() => capture(store, { readback: readback({ equity: 9_999 }) }), storeError("EXECUTION_DAY_START_EQUITY_CONFLICT"));
  assert.equal(store.read(id, "2026-08-15").equity, 10_000);
});

test("store rejects observations outside the UTC boundary window", () => {
  for (const observedAt of ["2026-08-14T23:59:59.999Z", "2026-08-15T00:05:00.000Z", "2026-08-15T12:00:00.000Z"]) {
    const store = new SqliteExecutionDayStartEquityStore(":memory:");
    const at = new Date(new Date(observedAt).getTime() + 1_000);
    assert.throws(() => store.capture({
      userId: id.userId,
      accountId: id.accountId,
      utcDay: "2026-08-15",
      equity: 10_000,
      providerVersion: MEXC_PROVIDER_READBACK_VERSION,
      providerObservedAt: observedAt,
      bindingDigest: digest,
      credentialGeneration: "1",
      reconciliationRevision: reconciliation.revision,
    }, at), storeError("EXECUTION_DAY_START_EQUITY_WINDOW_MISSED"));
    assert.equal(store.read(id, "2026-08-15"), null);
  }
});

test("late or future readback is rejected by the authority before persistence", () => {
  const store = new SqliteExecutionDayStartEquityStore(":memory:");
  assert.throws(
    () => capture(store, {}, new Date("2026-08-15T00:00:19.001Z")),
    authorityError("EXECUTION_DAY_START_EQUITY_PREREQUISITE_FAILED"),
  );
  assert.throws(
    () => capture(store, { readback: readback({ observedAt: "2026-08-15T00:00:05.000Z" }) }, new Date("2026-08-15T00:00:04.000Z")),
    authorityError("EXECUTION_DAY_START_EQUITY_PREREQUISITE_FAILED"),
  );
});

test("capture requires exact fresh ownership, binding, clean reconciliation and fresh flat MEXC evidence", () => {
  const cases = [
    { ownership: { ...ownership, status: "proved" } },
    { ownership: { ...ownership, bindingDigest: "b".repeat(64) } },
    { ownership: { ...ownership, proofObservedAt: "2026-08-14T23:59:40.000Z" } },
    { reconciliation: { ...reconciliation, status: "unknown", reason: "NOT_RECONCILED", observedAt: null } },
    { reconciliation: { ...reconciliation, status: "quarantined", reason: "UNEXPECTED_PROVIDER_POSITION" } },
    { reconciliation: { ...reconciliation, observedAt: "2026-08-14T23:59:40.000Z" } },
    { readback: readback({ observedAt: "2026-08-14T23:59:40.000Z" }) },
    { readback: readback({ equity: 0 }) },
    { readback: readback({ settlementCurrency: "BTC" }) },
    { readback: readback({ positions: Object.freeze([{ symbol: "BTC_USDT", side: "long", contractVolume: 1 }]) }) },
  ];
  for (const changed of cases) {
    const store = new SqliteExecutionDayStartEquityStore(":memory:");
    assert.throws(() => capture(store, changed), authorityError("EXECUTION_DAY_START_EQUITY_PREREQUISITE_FAILED"));
  }
});

test("identity mismatch is distinct and fails before persistence", () => {
  const store = new SqliteExecutionDayStartEquityStore(":memory:");
  assert.throws(
    () => capture(store, { readback: readback({ accountId: "wrong" }) }),
    authorityError("EXECUTION_DAY_START_EQUITY_IDENTITY_MISMATCH"),
  );
  assert.equal(store.read(id, "2026-08-15"), null);
});

test("risk snapshot uses only current UTC-day exact binding baseline and fresh clean evidence", () => {
  const store = new SqliteExecutionDayStartEquityStore(":memory:");
  capture(store);
  const riskEvidence = { identity: id, binding, reconciliation, readback: readback({ equity: 9_980, availableMargin: 8_980 }) };
  assert.deepEqual(authoritativeRiskSnapshotFromDayStart(store, riskEvidence, now), {
    userId: id.userId,
    accountId: id.accountId,
    observedAt: "2026-08-15T00:00:03.000Z",
    equity: 9_980,
    availableMargin: 8_980,
    dayStartEquity: 10_000,
  });
  assert.equal(authoritativeRiskSnapshotFromDayStart(store, { ...riskEvidence, binding: { ...binding, credentialGeneration: "2", bindingDigest: "b".repeat(64) } }, now), null);
  assert.equal(authoritativeRiskSnapshotFromDayStart(store, { ...riskEvidence, reconciliation: { ...reconciliation, status: "quarantined", reason: "UNEXPECTED_PROVIDER_POSITION" } }, now), null);
  assert.equal(authoritativeRiskSnapshotFromDayStart(store, riskEvidence, new Date("2026-08-16T00:00:01.000Z")), null);
});

test("missed capture window cannot be backfilled later and risk remains unavailable", () => {
  const store = new SqliteExecutionDayStartEquityStore(":memory:");
  const midday = readback({ observedAt: "2026-08-15T12:00:00.000Z", equity: 9_950 });
  assert.throws(
    () => captureAuthoritativeDayStartEquity(store, evidence({
      ownership: { ...ownership, proofObservedAt: "2026-08-15T11:59:59.000Z" },
      reconciliation: { ...reconciliation, observedAt: "2026-08-15T11:59:59.000Z" },
      readback: midday,
    }), new Date("2026-08-15T12:00:01.000Z")),
    storeError("EXECUTION_DAY_START_EQUITY_WINDOW_MISSED"),
  );
  assert.equal(store.read(id, "2026-08-15"), null);
  assert.equal(authoritativeRiskSnapshotFromDayStart(store, {
    identity: id,
    binding,
    reconciliation: { ...reconciliation, observedAt: "2026-08-15T11:59:59.000Z" },
    readback: midday,
  }, new Date("2026-08-15T12:00:01.000Z")), null);
});

test("baseline and secret-free metadata survive restart", () => {
  const dir = directory(); const path = join(dir, "baseline.sqlite");
  try {
    let store = new SqliteExecutionDayStartEquityStore(path);
    const baseline = capture(store);
    store.close();
    store = new SqliteExecutionDayStartEquityStore(path);
    assert.deepEqual(store.read(id, "2026-08-15"), baseline);
    const serialized = JSON.stringify(store.read(id, "2026-08-15"));
    assert.doesNotMatch(serialized, /api.?key|secret|signature|password|totp|session|assertion/i);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("two store instances converge on one immutable baseline", () => {
  const dir = directory(); const path = join(dir, "baseline.sqlite");
  try {
    const first = new SqliteExecutionDayStartEquityStore(path);
    const second = new SqliteExecutionDayStartEquityStore(path);
    const winner = capture(first);
    assert.deepEqual(capture(second), winner);
    assert.throws(() => capture(second, { readback: readback({ equity: 9_999 }) }), storeError("EXECUTION_DAY_START_EQUITY_CONFLICT"));
    assert.equal(first.read(id, "2026-08-15").equity, 10_000);
    first.close(); second.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("semantic database corruption fails closed", () => {
  const dir = directory(); const path = join(dir, "baseline.sqlite");
  try {
    let store = new SqliteExecutionDayStartEquityStore(path);
    capture(store); store.close();
    const db = new DatabaseSync(path);
    db.exec("UPDATE execution_day_start_equity SET provider_observed_at='2026-08-15T12:00:00.000Z'");
    db.close();
    store = new SqliteExecutionDayStartEquityStore(path);
    assert.throws(() => store.read(id, "2026-08-15"), storeError("EXECUTION_DAY_START_EQUITY_INVALID"));
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("valid older backing replacement permanently poisons the store instance", () => {
  const dir = directory();
  const path = join(dir, "baseline.sqlite"), old = join(dir, "old.sqlite"), replacement = join(dir, "replacement.sqlite");
  try {
    let store = new SqliteExecutionDayStartEquityStore(path);
    capture(store); store.close();
    copyFileSync(path, old);
    store = new SqliteExecutionDayStartEquityStore(path);
    store.capture({
      userId: id.userId,
      accountId: id.accountId,
      utcDay: "2026-08-16",
      equity: 10_100,
      providerVersion: MEXC_PROVIDER_READBACK_VERSION,
      providerObservedAt: "2026-08-16T00:00:03.000Z",
      bindingDigest: digest,
      credentialGeneration: "1",
      reconciliationRevision: 8,
    }, new Date("2026-08-16T00:00:04.000Z"));
    assert.equal(store.read(id, "2026-08-16").revision, 2);
    copyFileSync(old, replacement);
    renameSync(replacement, path);
    const unavailable = storeError("EXECUTION_DAY_START_EQUITY_UNAVAILABLE");
    assert.throws(() => store.read(id, "2026-08-15"), unavailable);
    assert.throws(() => store.read(id, "2026-08-15"), unavailable);
    assert.throws(() => store.read(id, "2026-08-16"), unavailable);
    assert.throws(() => capture(store), unavailable);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
