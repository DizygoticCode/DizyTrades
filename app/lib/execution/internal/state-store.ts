import "server-only";

import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExecutionResult } from "../types";

const SCHEMA_VERSION = 1;
const MAX_RESULT_BYTES = 8_192;
const RESULT_REASONS = new Set([
  "CALLER_UNAUTHENTICATED", "CALLER_IDENTITY_MISMATCH", "BOUNDARY_DEPENDENCY_FAILURE",
  "INVALID_IDENTITY", "INVALID_IDEMPOTENCY_KEY", "INVALID_SYMBOL", "UNKNOWN_SYMBOL",
  "INVALID_SIDE", "INVALID_ORDER_TYPE", "INVALID_QUANTITY", "INVALID_PRICE",
  "INVALID_LEVERAGE", "INVALID_REDUCE_ONLY", "INVALID_SOURCE", "INVALID_TIMESTAMP",
  "PREREQUISITE_STATE_STALE", "POLICY_SYMBOL_DENIED", "POLICY_LEVERAGE_EXCEEDED",
  "POLICY_NOTIONAL_EXCEEDED", "REFERENCE_PRICE_MISSING", "REFERENCE_PRICE_STALE",
  "ACCOUNT_STATE_MISSING", "ACCOUNT_STATE_IDENTITY_MISMATCH", "ACCOUNT_STATE_STALE",
  "REDUCE_ONLY_VIOLATION", "GLOBAL_EXECUTION_DISABLED", "USER_EXECUTION_DISABLED",
  "ACCOUNT_EXECUTION_DISABLED", "PROVIDER_STATE_STALE", "MAINTENANCE_STOP",
  "EMERGENCY_STOP", "DUPLICATE_INTENT", "ADAPTER_UNAVAILABLE", "PROVIDER_EXCEPTION",
  "PROVIDER_MALFORMED_RESULT", "SYNTHETIC_PROVIDER_OUTCOME", "EXECUTION_STATE_UNAVAILABLE",
]);

export const executionStateDatabasePath = () =>
  join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-state.sqlite");

type Claim =
  | Readonly<{ kind: "claimed" }>
  | Readonly<{ kind: "duplicate"; result: ExecutionResult }>
  | Readonly<{ kind: "unavailable" }>;

const string = (value: unknown, maximum: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maximum;

export function isPersistedExecutionResult(value: unknown): value is ExecutionResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ExecutionResult>;
  if (!string(result.intentId, 128) || !string(result.idempotencyKey, 128)) return false;
  if (!(["blocked", "rejected", "prepared"] as unknown[]).includes(result.state)) return false;
  if (result.executed !== false || result.duplicate !== false || !string(result.reason, 64) || !RESULT_REASONS.has(result.reason)) return false;
  if (result.preview !== null) {
    if (!result.preview || typeof result.preview !== "object") return false;
    if (!string(result.preview.symbol, 32) || !(["long", "short"] as unknown[]).includes(result.preview.side)) return false;
    if (!(["market", "limit"] as unknown[]).includes(result.preview.orderType)) return false;
    for (const number of [result.preview.quantity, result.preview.normalizedContractVolume, result.preview.referencePrice, result.preview.estimatedNotional, result.preview.estimatedMargin, result.preview.leverage]) {
      if (typeof number !== "number" || !Number.isFinite(number) || number < 0) return false;
    }
    if (typeof result.preview.reduceOnly !== "boolean" || !string(result.preview.policyVersion, 64)) return false;
    if (result.preview.price !== undefined && (typeof result.preview.price !== "number" || !Number.isFinite(result.preview.price))) return false;
  }
  if (result.providerResult !== undefined) {
    const provider = result.providerResult;
    if (provider.contractVersion !== "synthetic-provider/1.0.0" || provider.providerKind !== "non-executing" || provider.provenance !== "deterministic-synthetic-fixture" || provider.executed !== false) return false;
    if (!(["would-accept", "would-reject", "would-timeout", "would-unknown"] as unknown[]).includes(provider.outcome)) return false;
    if (!(["none", "policy", "timeout", "indeterminate"] as unknown[]).includes(provider.reasonClass)) return false;
  }
  return true;
}

/** Durable authority for the bounded, non-executing idempotency scope. */
export class ExecutionStateStore {
  private readonly database: DatabaseSync | null;

  constructor(path = executionStateDatabasePath()) {
    let database: DatabaseSync | null = null;
    try {
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      database = new DatabaseSync(path);
      database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
      database.exec("BEGIN IMMEDIATE");
      try {
        database.exec("CREATE TABLE IF NOT EXISTS execution_schema (version INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS execution_results (user_id TEXT NOT NULL CHECK(length(user_id) BETWEEN 1 AND 128), account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 128), idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128), status TEXT NOT NULL CHECK(status IN ('processing','terminal')), result_json TEXT CHECK(result_json IS NULL OR length(result_json) <= 8192), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, account_id, idempotency_key)) WITHOUT ROWID;");
        const row = database.prepare("SELECT version FROM execution_schema").get() as { version?: unknown } | undefined;
        if (!row) database.prepare("INSERT INTO execution_schema(version) VALUES (?)").run(SCHEMA_VERSION);
        else if (row.version !== SCHEMA_VERSION) throw new Error("Unsupported execution-state schema");
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      if (path !== ":memory:") chmodSync(path, 0o600);
    } catch {
      try { database?.close(); } catch { /* fail closed */ }
      database = null;
    }
    this.database = database;
  }

  claim(userId: string, accountId: string, idempotencyKey: string, occurredAt: string): Claim {
    if (!this.database) return { kind: "unavailable" };
    try {
      const inserted = this.database.prepare("INSERT OR IGNORE INTO execution_results(user_id,account_id,idempotency_key,status,result_json,created_at,updated_at) VALUES (?,?,?,'processing',NULL,?,?)").run(userId, accountId, idempotencyKey, occurredAt, occurredAt);
      if (inserted.changes === 1) return { kind: "claimed" };
      const row = this.database.prepare("SELECT status,result_json FROM execution_results WHERE user_id=? AND account_id=? AND idempotency_key=?").get(userId, accountId, idempotencyKey) as { status: unknown; result_json: unknown } | undefined;
      if (!row || row.status !== "terminal" || typeof row.result_json !== "string" || row.result_json.length > MAX_RESULT_BYTES) return { kind: "unavailable" };
      const parsed: unknown = JSON.parse(row.result_json);
      return isPersistedExecutionResult(parsed) ? { kind: "duplicate", result: Object.freeze(parsed) } : { kind: "unavailable" };
    } catch { return { kind: "unavailable" }; }
  }

  complete(userId: string, accountId: string, idempotencyKey: string, result: ExecutionResult, occurredAt: string): boolean {
    if (!this.database || !isPersistedExecutionResult(result)) return false;
    try {
      const json = JSON.stringify(result);
      if (Buffer.byteLength(json) > MAX_RESULT_BYTES) return false;
      const updated = this.database.prepare("UPDATE execution_results SET status='terminal',result_json=?,updated_at=? WHERE user_id=? AND account_id=? AND idempotency_key=? AND status='processing'").run(json, occurredAt, userId, accountId, idempotencyKey);
      return updated.changes === 1;
    } catch { return false; }
  }
}
