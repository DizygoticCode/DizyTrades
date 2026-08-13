import "server-only";

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ExecutionAuditEvent, ExecutionAuditKind, ExecutionBlockCode, ExecutionRejectionCode } from "../types";

const SCHEMA_VERSION = 1;
const GENESIS_HASH = "0".repeat(64);
const MAX_EVENT_BYTES = 2048;
const HASH = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_:-]{1,120}$/;
const SYMBOL = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const kinds = new Set<ExecutionAuditKind>([
  "intent-received", "validation-passed", "validation-rejected", "execution-blocked",
  "duplicate-intent-detected", "kill-switch-active", "adapter-unavailable",
  "provider-evaluated", "provider-failed", "execution-state-failed",
]);
const reasons = new Set<ExecutionBlockCode | ExecutionRejectionCode>([
  "CALLER_UNAUTHENTICATED", "CALLER_IDENTITY_MISMATCH", "BOUNDARY_DEPENDENCY_FAILURE",
  "INVALID_IDENTITY", "INVALID_IDEMPOTENCY_KEY", "INVALID_SYMBOL", "UNKNOWN_SYMBOL",
  "INVALID_SIDE", "INVALID_ORDER_TYPE", "INVALID_QUANTITY", "INVALID_PRICE", "INVALID_LEVERAGE",
  "INVALID_REDUCE_ONLY", "INVALID_SOURCE", "INVALID_TIMESTAMP", "PREREQUISITE_STATE_STALE",
  "POLICY_SYMBOL_DENIED", "POLICY_LEVERAGE_EXCEEDED", "POLICY_NOTIONAL_EXCEEDED",
  "REFERENCE_PRICE_MISSING", "REFERENCE_PRICE_STALE", "ACCOUNT_STATE_MISSING",
  "ACCOUNT_STATE_IDENTITY_MISMATCH", "ACCOUNT_STATE_STALE", "REDUCE_ONLY_VIOLATION",
  "GLOBAL_EXECUTION_DISABLED", "USER_EXECUTION_DISABLED", "ACCOUNT_EXECUTION_DISABLED",
  "PROVIDER_STATE_STALE", "MAINTENANCE_STOP", "EMERGENCY_STOP", "DUPLICATE_INTENT",
  "ADAPTER_UNAVAILABLE", "PROVIDER_EXCEPTION", "PROVIDER_MALFORMED_RESULT",
  "SYNTHETIC_PROVIDER_OUTCOME", "EXECUTION_STATE_UNAVAILABLE", "EXECUTION_STATE_INVALID",
  "EXECUTION_AUDIT_UNAVAILABLE", "EXECUTION_AUDIT_INVALID",
]);

export type DurableExecutionAuditRecord = Readonly<{
  schemaVersion: 1;
  sequence: number;
  event: ExecutionAuditEvent;
  previousHash: string;
  recordHash: string;
  createdAt: string;
}>;

export interface ExecutionAuditStore {
  append(event: ExecutionAuditEvent): DurableExecutionAuditRecord;
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
export const executionAuditFailureCode = (error: unknown) =>
  error instanceof ExecutionAuditStoreError ? error.code : "EXECUTION_AUDIT_UNAVAILABLE" as const;

function validateEvent(value: unknown): ExecutionAuditEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const event = value as Record<string, unknown>;
  const allowed = ["schemaVersion", "eventId", "occurredAt", "kind", "intentId", "idempotencyDigest", "actorDigest", "symbol", "reason"];
  if (Object.keys(event).some((key) => !allowed.includes(key))) invalid();
  if (event.schemaVersion !== "execution-audit/1.0.0" || typeof event.eventId !== "string" || !TOKEN.test(event.eventId)
    || typeof event.intentId !== "string" || !TOKEN.test(event.intentId) || typeof event.occurredAt !== "string"
    || event.occurredAt.length > 64 || !Number.isFinite(Date.parse(event.occurredAt))
    || typeof event.kind !== "string" || !kinds.has(event.kind as ExecutionAuditKind)
    || typeof event.idempotencyDigest !== "string" || !HASH.test(event.idempotencyDigest)
    || typeof event.actorDigest !== "string" || !HASH.test(event.actorDigest)) invalid();
  if (event.symbol !== undefined && (typeof event.symbol !== "string" || !SYMBOL.test(event.symbol))) invalid();
  if (event.reason !== undefined && !reasons.has(event.reason as ExecutionBlockCode)) invalid();
  return Object.freeze({ ...(event as ExecutionAuditEvent) });
}

function canonicalEvent(event: ExecutionAuditEvent): string {
  const normalized = validateEvent(event);
  const json = JSON.stringify({
    schemaVersion: normalized.schemaVersion, eventId: normalized.eventId, occurredAt: normalized.occurredAt,
    kind: normalized.kind, intentId: normalized.intentId, idempotencyDigest: normalized.idempotencyDigest,
    actorDigest: normalized.actorDigest, ...(normalized.symbol ? { symbol: normalized.symbol } : {}),
    ...(normalized.reason ? { reason: normalized.reason } : {}),
  });
  if (Buffer.byteLength(json, "utf8") > MAX_EVENT_BYTES) invalid();
  return json;
}

export function executionAuditRecordHash(sequence: number, previousHash: string, eventJson: string, createdAt: string) {
  return createHash("sha256").update(JSON.stringify({ schemaVersion: SCHEMA_VERSION, sequence, previousHash, eventJson, createdAt }), "utf8").digest("hex");
}

type Row = { schema_version: number; durable_sequence: number; event_json: string; previous_hash: string; record_hash: string; created_at: string };

export function executionAuditDatabasePath() {
  return join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-audit.sqlite");
}

export class SqliteExecutionAuditStore implements ExecutionAuditStore {
  private database: DatabaseSync | null = null;
  constructor(private readonly path = executionAuditDatabasePath()) {}

  private harden() {
    if (this.path === ":memory:") return;
    for (const path of [this.path, `${this.path}-wal`, `${this.path}-shm`]) if (existsSync(path)) chmodSync(path, 0o600);
  }

  private db(): DatabaseSync {
    if (this.database) return this.database;
    let db: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      db = new DatabaseSync(this.path);
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
      if (version !== 0 && version !== SCHEMA_VERSION) invalid();
      if (version === 0) db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE execution_audit (
          schema_version INTEGER NOT NULL CHECK(schema_version=1),
          durable_sequence INTEGER PRIMARY KEY CHECK(durable_sequence > 0),
          event_json TEXT NOT NULL CHECK(length(event_json) BETWEEN 2 AND ${MAX_EVENT_BYTES}),
          previous_hash TEXT NOT NULL CHECK(length(previous_hash)=64),
          record_hash TEXT NOT NULL CHECK(length(record_hash)=64),
          created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 1 AND 64)
        );
        PRAGMA user_version=${SCHEMA_VERSION}; COMMIT;`);
      this.database = db;
      this.harden();
      this.readVerified();
      return db;
    } catch (error) {
      try { db?.close(); } catch { /* best effort */ }
      this.database = null;
      if (error instanceof ExecutionAuditStoreError) throw error;
      return unavailable();
    }
  }

  readVerified(): readonly DurableExecutionAuditRecord[] {
    const db = this.database ?? this.db();
    let rows: Row[] = [];
    try { rows = db.prepare("SELECT * FROM execution_audit ORDER BY durable_sequence").all() as Row[]; }
    catch { return unavailable(); }
    const records: DurableExecutionAuditRecord[] = [];
    let previous = GENESIS_HASH;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.schema_version !== SCHEMA_VERSION || row.durable_sequence !== index + 1 || row.previous_hash !== previous
        || !HASH.test(row.previous_hash) || !HASH.test(row.record_hash) || typeof row.event_json !== "string"
        || Buffer.byteLength(row.event_json, "utf8") > MAX_EVENT_BYTES || typeof row.created_at !== "string"
        || row.created_at.length > 64 || !Number.isFinite(Date.parse(row.created_at))) invalid();
      let parsed: unknown;
      try { parsed = JSON.parse(row.event_json); } catch { invalid(); }
      const event = validateEvent(parsed);
      if (canonicalEvent(event) !== row.event_json
        || executionAuditRecordHash(row.durable_sequence, row.previous_hash, row.event_json, row.created_at) !== row.record_hash) invalid();
      records.push(Object.freeze({ schemaVersion: 1, sequence: row.durable_sequence, event, previousHash: row.previous_hash, recordHash: row.record_hash, createdAt: row.created_at }));
      previous = row.record_hash;
    }
    return Object.freeze(records);
  }

  append(event: ExecutionAuditEvent): DurableExecutionAuditRecord {
    const eventJson = canonicalEvent(event);
    const db = this.db();
    try {
      db.exec("BEGIN IMMEDIATE");
      const records = this.readVerified();
      const sequence = records.length + 1;
      const previousHash = records.at(-1)?.recordHash ?? GENESIS_HASH;
      const createdAt = event.occurredAt;
      const recordHash = executionAuditRecordHash(sequence, previousHash, eventJson, createdAt);
      db.prepare("INSERT INTO execution_audit VALUES(?,?,?,?,?,?)").run(SCHEMA_VERSION, sequence, eventJson, previousHash, recordHash, createdAt);
      db.exec("COMMIT"); this.harden();
      return Object.freeze({ schemaVersion: 1, sequence, event: validateEvent(event), previousHash, recordHash, createdAt });
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* no transaction */ }
      if (error instanceof ExecutionAuditStoreError) throw error;
      return unavailable();
    }
  }

  close() { if (this.database) { this.database.close(); this.database = null; } }
  databasePath() { return this.path; }
}

export const createProductionExecutionAuditStore = (): ExecutionAuditStore => new SqliteExecutionAuditStore();
export const createInMemoryExecutionAuditStoreForTests = () => new SqliteExecutionAuditStore(":memory:");
