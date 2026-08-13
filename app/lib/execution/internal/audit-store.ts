import "server-only";

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ExecutionAuditEvent } from "../types";

const SCHEMA_VERSION = 1;
const GENESIS_HASH = "0".repeat(64);
const MAX_EVENT_BYTES = 2048;
const TOKEN = /^[A-Za-z0-9_:-]{1,120}$/;
const SYMBOL = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const HASH = /^[a-f0-9]{64}$/;
const kinds = new Set(["intent-received", "validation-passed", "validation-rejected", "execution-blocked", "duplicate-intent-detected", "kill-switch-active", "adapter-unavailable", "provider-evaluated", "provider-failed", "execution-state-failed"]);
const reasons = new Set(["GLOBAL_EXECUTION_DISABLED", "USER_EXECUTION_DISABLED", "ACCOUNT_EXECUTION_DISABLED", "PROVIDER_STATE_STALE", "MAINTENANCE_STOP", "EMERGENCY_STOP", "DUPLICATE_INTENT", "ADAPTER_UNAVAILABLE", "PROVIDER_EXCEPTION", "PROVIDER_MALFORMED_RESULT", "SYNTHETIC_PROVIDER_OUTCOME", "EXECUTION_STATE_UNAVAILABLE", "EXECUTION_STATE_INVALID", "CALLER_UNAUTHENTICATED", "CALLER_IDENTITY_MISMATCH", "BOUNDARY_DEPENDENCY_FAILURE", "INVALID_IDENTITY", "INVALID_IDEMPOTENCY_KEY", "INVALID_SYMBOL", "UNKNOWN_SYMBOL", "INVALID_SIDE", "INVALID_ORDER_TYPE", "INVALID_QUANTITY", "INVALID_PRICE", "INVALID_LEVERAGE", "INVALID_REDUCE_ONLY", "INVALID_SOURCE", "INVALID_TIMESTAMP", "PREREQUISITE_STATE_STALE", "POLICY_SYMBOL_DENIED", "POLICY_LEVERAGE_EXCEEDED", "POLICY_NOTIONAL_EXCEEDED", "REFERENCE_PRICE_MISSING", "REFERENCE_PRICE_STALE", "ACCOUNT_STATE_MISSING", "ACCOUNT_STATE_IDENTITY_MISMATCH", "ACCOUNT_STATE_STALE", "REDUCE_ONLY_VIOLATION"]);

export type DurableExecutionAuditRecord = Readonly<{ durableSequence: number; event: ExecutionAuditEvent; previousHash: string; recordHash: string; createdAt: string }>;
export interface ExecutionAuditStore {
  append(event: ExecutionAuditEvent, createdAt: string): DurableExecutionAuditRecord;
  readVerified(): readonly DurableExecutionAuditRecord[];
}

export class ExecutionAuditStoreError extends Error {
  constructor(readonly code: "EXECUTION_AUDIT_UNAVAILABLE" | "EXECUTION_AUDIT_INVALID") {
    super("EXECUTION_AUDIT_STORE_FAILURE");
    this.name = "ExecutionAuditStoreError";
  }
}
const invalid = (): never => { throw new ExecutionAuditStoreError("EXECUTION_AUDIT_INVALID"); };
const unavailable = (): never => { throw new ExecutionAuditStoreError("EXECUTION_AUDIT_UNAVAILABLE"); };
export const executionAuditFailureCode = (error: unknown) => error instanceof ExecutionAuditStoreError ? error.code : "EXECUTION_AUDIT_UNAVAILABLE" as const;

function auditDatabasePath() { return join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-audit.sqlite"); }
function timestamp(value: unknown): value is string { return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value)); }
function normalizeEvent(value: unknown): ExecutionAuditEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const event = value as Record<string, unknown>;
  const allowed = ["schemaVersion", "eventId", "occurredAt", "kind", "intentId", "idempotencyDigest", "actorDigest", "symbol", "reason"];
  if (Object.keys(event).some((key) => !allowed.includes(key))) invalid();
  if (event.schemaVersion !== "execution-audit/1.0.0" || typeof event.eventId !== "string" || !TOKEN.test(event.eventId)
    || !timestamp(event.occurredAt) || typeof event.kind !== "string" || !kinds.has(event.kind)
    || typeof event.intentId !== "string" || !TOKEN.test(event.intentId)
    || typeof event.idempotencyDigest !== "string" || !DIGEST.test(event.idempotencyDigest)
    || typeof event.actorDigest !== "string" || !DIGEST.test(event.actorDigest)
    || (event.symbol !== undefined && (typeof event.symbol !== "string" || !SYMBOL.test(event.symbol)))
    || (event.reason !== undefined && (typeof event.reason !== "string" || !reasons.has(event.reason)))) invalid();
  return Object.freeze({
    schemaVersion: "execution-audit/1.0.0", eventId: event.eventId, occurredAt: event.occurredAt,
    kind: event.kind, intentId: event.intentId, idempotencyDigest: event.idempotencyDigest, actorDigest: event.actorDigest,
    ...(event.symbol === undefined ? {} : { symbol: event.symbol }), ...(event.reason === undefined ? {} : { reason: event.reason }),
  } as ExecutionAuditEvent);
}
function canonicalEvent(event: ExecutionAuditEvent) {
  const normalized = normalizeEvent(event);
  const json = JSON.stringify(normalized);
  if (Buffer.byteLength(json, "utf8") > MAX_EVENT_BYTES) invalid();
  return json;
}
function recordHash(sequence: number, previousHash: string, eventJson: string) {
  return createHash("sha256").update(JSON.stringify({ schemaVersion: SCHEMA_VERSION, durableSequence: sequence, previousHash, event: JSON.parse(eventJson) }), "utf8").digest("hex");
}
type Row = { schema_version: number; durable_sequence: number; event_json: string; previous_hash: string; record_hash: string; created_at: string };

export class SqliteExecutionAuditStore implements ExecutionAuditStore {
  private database: DatabaseSync | null = null;
  constructor(private readonly path = auditDatabasePath()) {}
  private harden() { if (this.path !== ":memory:") for (const path of [this.path, `${this.path}-wal`, `${this.path}-shm`]) if (existsSync(path)) chmodSync(path, 0o600); }
  private db(): DatabaseSync {
    if (this.database) return this.database;
    let db: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      db = new DatabaseSync(this.path);
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
      if (version !== 0 && version !== SCHEMA_VERSION) invalid();
      if (version === 0) db.exec(`BEGIN IMMEDIATE; CREATE TABLE execution_audit (schema_version INTEGER NOT NULL CHECK(schema_version=1), durable_sequence INTEGER PRIMARY KEY, event_json TEXT NOT NULL CHECK(length(event_json)<=${MAX_EVENT_BYTES}), previous_hash TEXT NOT NULL CHECK(length(previous_hash)=64), record_hash TEXT NOT NULL CHECK(length(record_hash)=64), created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 1 AND 64)); PRAGMA user_version=${SCHEMA_VERSION}; COMMIT;`);
      this.database = db; this.harden(); this.readVerified(); return db;
    } catch (error) {
      try { db?.close(); } catch { /* best effort */ }
      this.database = null;
      if (error instanceof ExecutionAuditStoreError) throw error;
      return unavailable();
    }
  }
  readVerified(): readonly DurableExecutionAuditRecord[] {
    const db = this.db();
    try {
      const rows = db.prepare("SELECT * FROM execution_audit ORDER BY durable_sequence").all() as Row[];
      let previous = GENESIS_HASH;
      return Object.freeze(rows.map((row, index) => {
        const sequence = index + 1;
        if (row.schema_version !== SCHEMA_VERSION || row.durable_sequence !== sequence || row.previous_hash !== previous || !HASH.test(row.record_hash) || !timestamp(row.created_at) || Buffer.byteLength(row.event_json, "utf8") > MAX_EVENT_BYTES) invalid();
        let parsed: unknown; try { parsed = JSON.parse(row.event_json); } catch { invalid(); }
        const event = normalizeEvent(parsed);
        const canonical = canonicalEvent(event);
        if (canonical !== row.event_json || recordHash(sequence, previous, canonical) !== row.record_hash) invalid();
        previous = row.record_hash;
        return Object.freeze({ durableSequence: sequence, event, previousHash: row.previous_hash, recordHash: row.record_hash, createdAt: row.created_at });
      }));
    } catch (error) { if (error instanceof ExecutionAuditStoreError) throw error; return unavailable(); }
  }
  append(event: ExecutionAuditEvent, createdAt: string): DurableExecutionAuditRecord {
    if (!timestamp(createdAt)) invalid();
    const json = canonicalEvent(event); const db = this.db();
    try {
      db.exec("BEGIN IMMEDIATE");
      const tail = db.prepare("SELECT durable_sequence,record_hash FROM execution_audit ORDER BY durable_sequence DESC LIMIT 1").get() as { durable_sequence: number; record_hash: string } | undefined;
      const sequence = tail ? tail.durable_sequence + 1 : 1; const previousHash = tail?.record_hash ?? GENESIS_HASH;
      if (!Number.isSafeInteger(sequence) || !HASH.test(previousHash)) invalid();
      const hash = recordHash(sequence, previousHash, json);
      db.prepare("INSERT INTO execution_audit VALUES(?,?,?,?,?,?)").run(SCHEMA_VERSION, sequence, json, previousHash, hash, createdAt);
      db.exec("COMMIT"); this.harden();
      return Object.freeze({ durableSequence: sequence, event: normalizeEvent(event), previousHash, recordHash: hash, createdAt });
    } catch (error) { try { db.exec("ROLLBACK"); } catch { /* no transaction */ } if (error instanceof ExecutionAuditStoreError) throw error; return unavailable(); }
  }
  close() { if (this.database) { this.database.close(); this.database = null; } }
  databasePath() { return this.path; }
}
export const createProductionExecutionAuditStore = (): ExecutionAuditStore => new SqliteExecutionAuditStore();
export const createInMemoryExecutionAuditStoreForTests = () => new SqliteExecutionAuditStore(":memory:");
export const executionAuditDatabasePathForTests = auditDatabasePath;
