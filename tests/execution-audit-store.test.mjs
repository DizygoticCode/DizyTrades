import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createExecutionAuditEvent } from "../app/lib/execution/internal/audit.ts";
import { SqliteExecutionAuditStore } from "../app/lib/execution/internal/audit-store.ts";

const event = (id) => createExecutionAuditEvent({ eventId: id, occurredAt: "2026-08-13T00:00:00.000Z", kind: "intent-received", intentId: "intent-1", idempotencyKey: "idempotency-key", userId: "user-1", symbol: "BTC_USDT" });

test("audit records chain durably and continue after restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "execution-audit-"));
  const path = join(directory, "audit.sqlite");
  try {
    const first = new SqliteExecutionAuditStore(path);
    const one = first.append(event("event-1"), "2026-08-13T00:00:00.000Z");
    const two = first.append(event("event-2"), "2026-08-13T00:00:01.000Z");
    assert.equal(one.durableSequence, 1);
    assert.equal(two.durableSequence, 2);
    assert.equal(two.previousHash, one.recordHash);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    first.close();

    const restarted = new SqliteExecutionAuditStore(path);
    assert.equal(restarted.readVerified().length, 2);
    assert.equal(restarted.append(event("event-3"), "2026-08-13T00:00:02.000Z").durableSequence, 3);
    restarted.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("direct durable payload tampering fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "execution-audit-tamper-"));
  const path = join(directory, "audit.sqlite");
  try {
    const store = new SqliteExecutionAuditStore(path);
    store.append(event("event-1"), "2026-08-13T00:00:00.000Z");
    store.close();
    chmodSync(path, 0o600);
    const db = new DatabaseSync(path);
    db.prepare("UPDATE execution_audit SET event_json=? WHERE durable_sequence=1").run(JSON.stringify({ hacked: true }));
    db.close();
    assert.throws(() => new SqliteExecutionAuditStore(path).readVerified(), (error) => error.code === "EXECUTION_AUDIT_INVALID");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("audit source exposes no mutation API or sensitive execution dependencies", () => {
  const source = readFileSync(new URL("../app/lib/execution/internal/audit-store.ts", import.meta.url), "utf8");
  const contract = source.match(/export interface ExecutionAuditStore \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(contract, /\b(update|delete|remove|mutate)\s*\(/i);
  assert.doesNotMatch(source, /mexc|custody|provision|fetch\(|authorization/i);
});
