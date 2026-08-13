import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createExecutionAuditEvent } from "../app/lib/execution/internal/audit.ts";
import {
  executionAuditDatabasePath,
  executionAuditRecordHash,
  SqliteExecutionAuditStore,
} from "../app/lib/execution/internal/audit-store.ts";

const event = (id, kind = "intent-received") => createExecutionAuditEvent({
  eventId: id, occurredAt: "2026-08-13T10:00:00.000Z", kind,
  intentId: "intent-1", idempotencyKey: "never-persist-this-key",
  userId: "never-persist-this-user", symbol: "BTC_USDT",
});
const pathFor = () => join(mkdtempSync(join(tmpdir(), "execution-audit-")), "audit.sqlite");

test("durable audit chain is monotonic, linked, restart-safe, hardened, and secret-free", () => {
  const path = pathFor();
  const firstStore = new SqliteExecutionAuditStore(path);
  const first = firstStore.append(event("event-1"));
  const second = firstStore.append(event("event-2", "validation-passed"));
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.previousHash, first.recordHash);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.doesNotMatch(readFileSync(path).toString("latin1"), /never-persist-this-(key|user)/);
  firstStore.close();

  const restarted = new SqliteExecutionAuditStore(path);
  assert.deepEqual(restarted.readVerified().map(({ sequence }) => sequence), [1, 2]);
  const third = restarted.append(event("event-3", "execution-blocked"));
  assert.equal(third.sequence, 3);
  assert.equal(third.previousHash, second.recordHash);
  restarted.close();
});

test("record hashes recompute over the complete canonical record", () => {
  const store = new SqliteExecutionAuditStore(":memory:");
  const record = store.append(event("event-hash"));
  const db = new DatabaseSync(":memory:");
  db.close(); // node:sqlite availability is itself part of this focused evidence.
  const eventJson = JSON.stringify(record.event);
  assert.equal(record.recordHash, executionAuditRecordHash(record.sequence, record.previousHash, eventJson, record.createdAt));
});

for (const [name, sql] of [
  ["event payload", "UPDATE execution_audit SET event_json=replace(event_json,'event-1','event-x') WHERE durable_sequence=1"],
  ["record hash", "UPDATE execution_audit SET record_hash='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' WHERE durable_sequence=1"],
  ["previous link", "UPDATE execution_audit SET previous_hash='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE durable_sequence=2"],
  ["sequence gap", "UPDATE execution_audit SET durable_sequence=4 WHERE durable_sequence=2"],
  ["unknown event field", "UPDATE execution_audit SET event_json=substr(event_json,1,length(event_json)-1)||',\"extra\":true}' WHERE durable_sequence=1"],
]) test(`direct SQL tampering of ${name} fails closed`, () => {
  const path = pathFor();
  const store = new SqliteExecutionAuditStore(path);
  store.append(event("event-1")); store.append(event("event-2")); store.close();
  const db = new DatabaseSync(path); db.exec(sql); db.close();
  const reopened = new SqliteExecutionAuditStore(path);
  assert.throws(() => reopened.readVerified(), (error) => error.code === "EXECUTION_AUDIT_INVALID");
});

test("unknown database schema version fails closed", () => {
  const path = pathFor();
  const db = new DatabaseSync(path); db.exec("PRAGMA user_version=99"); db.close();
  assert.throws(() => new SqliteExecutionAuditStore(path).readVerified(), (error) => error.code === "EXECUTION_AUDIT_INVALID");
});

test("unopenable database reports bounded unavailable failure", () => {
  const directory = mkdtempSync(join(tmpdir(), "execution-audit-unavailable-"));
  chmodSync(directory, 0o500);
  // A directory is invalid as a SQLite file even when the test runner is privileged.
  assert.throws(() => new SqliteExecutionAuditStore(directory).readVerified(), (error) => error.code === "EXECUTION_AUDIT_UNAVAILABLE");
});

test("default production path is a dedicated DATA_DIR file", () => {
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = "/var/data/test-only";
  try { assert.equal(executionAuditDatabasePath(), "/var/data/test-only/execution-audit.sqlite"); }
  finally { if (original === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = original; }
});

test("audit-store contract exposes append and verified read, never update or delete", () => {
  const store = new SqliteExecutionAuditStore(":memory:");
  assert.deepEqual(Object.getOwnPropertyNames(Object.getPrototypeOf(store)).sort(),
    ["append", "close", "constructor", "databasePath", "db", "harden", "readVerified"].sort());
  assert.equal("update" in store, false); assert.equal("delete" in store, false);
});

test("source remains server-only and contains no transport, signing, or custody dependencies", () => {
  const source = readFileSync(new URL("../app/lib/execution/internal/audit-store.ts", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.doesNotMatch(source, /fetch\s*\(|https?:|mexc|sign(?:ature|ing)|custody|provision/i);
});
