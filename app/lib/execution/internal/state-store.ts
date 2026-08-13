import "server-only";

import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ExecutionBlockCode,
  ExecutionRejectionCode,
  ExecutionResult,
  SyntheticProviderResult,
} from "../types";
import { isSyntheticProviderResult } from "./provider";

const SCHEMA_VERSION = 1;
const GENERIC_ERROR = "EXECUTION_STATE_STORE_FAILURE";
const TOKEN = /^[A-Za-z0-9_-]{1,120}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,120}$/;
const SYMBOL = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const MAX_PREVIEW_JSON_BYTES = 4096;
const MAX_PROVIDER_JSON_BYTES = 1024;

const persistableBlockedCodes = new Set<ExecutionBlockCode>([
  "GLOBAL_EXECUTION_DISABLED",
  "USER_EXECUTION_DISABLED",
  "ACCOUNT_EXECUTION_DISABLED",
  "PROVIDER_STATE_STALE",
  "MAINTENANCE_STOP",
  "EMERGENCY_STOP",
  "ADAPTER_UNAVAILABLE",
  "PROVIDER_EXCEPTION",
  "PROVIDER_MALFORMED_RESULT",
]);
const rejectionCodes = new Set<ExecutionRejectionCode>([
  "CALLER_UNAUTHENTICATED",
  "CALLER_IDENTITY_MISMATCH",
  "BOUNDARY_DEPENDENCY_FAILURE",
  "INVALID_IDENTITY",
  "INVALID_IDEMPOTENCY_KEY",
  "INVALID_SYMBOL",
  "UNKNOWN_SYMBOL",
  "INVALID_SIDE",
  "INVALID_ORDER_TYPE",
  "INVALID_QUANTITY",
  "INVALID_PRICE",
  "INVALID_LEVERAGE",
  "INVALID_REDUCE_ONLY",
  "INVALID_SOURCE",
  "INVALID_TIMESTAMP",
  "PREREQUISITE_STATE_STALE",
  "POLICY_SYMBOL_DENIED",
  "POLICY_LEVERAGE_EXCEEDED",
  "POLICY_NOTIONAL_EXCEEDED",
  "REFERENCE_PRICE_MISSING",
  "REFERENCE_PRICE_STALE",
  "ACCOUNT_STATE_MISSING",
  "ACCOUNT_STATE_IDENTITY_MISMATCH",
  "ACCOUNT_STATE_STALE",
  "REDUCE_ONLY_VIOLATION",
]);

export type ExecutionIdempotencyScope = Readonly<{
  userId: string;
  accountId: string;
  idempotencyKey: string;
}>;

export type ExecutionStateIdentity = Readonly<{
  intentId: string;
  symbol: string;
}>;

export type ExecutionStateClaim =
  | Readonly<{ kind: "claimed" }>
  | Readonly<{ kind: "duplicate"; result: ExecutionResult | null }>;

export interface ExecutionStateStore {
  claim(
    scope: ExecutionIdempotencyScope,
    identity: ExecutionStateIdentity,
    occurredAt: string,
  ): ExecutionStateClaim;
  complete(
    scope: ExecutionIdempotencyScope,
    result: ExecutionResult,
    occurredAt: string,
  ): void;
}

export type ExecutionStatePersistenceIdentity = Readonly<{
  scope: ExecutionIdempotencyScope;
  identity: ExecutionStateIdentity;
}>;

/**
 * Extract only the bounded identity needed to durably reserve a rejected intent.
 * Invalid identity/key/symbol shapes are deliberately not persisted because no
 * trustworthy durable scope can be formed for them.
 */
export function executionStateIdentityFromInput(
  input: Readonly<Record<string, unknown>>,
): ExecutionStatePersistenceIdentity | null {
  const userId = typeof input.userId === "string" ? input.userId : "";
  const accountId = typeof input.accountId === "string" ? input.accountId : "";
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
  const intentId = typeof input.intentId === "string" ? input.intentId : "";
  const symbol = typeof input.symbol === "string" ? input.symbol : "";
  if (!TOKEN.test(userId) || !TOKEN.test(accountId) || !IDEMPOTENCY_KEY.test(idempotencyKey)
    || !TOKEN.test(intentId) || !SYMBOL.test(symbol)) return null;
  return Object.freeze({
    scope: Object.freeze({ userId, accountId, idempotencyKey }),
    identity: Object.freeze({ intentId, symbol }),
  });
}

type StoredStateRow = Readonly<{
  schema_version: number;
  user_id: string;
  account_id: string;
  idempotency_key: string;
  intent_id: string;
  symbol: string;
  record_state: "processing" | "complete";
  result_state: ExecutionResult["state"] | null;
  result_reason: string | null;
  preview_json: string | null;
  provider_json: string | null;
  executed: number;
  created_at: string;
  updated_at: string;
}>;

export class ExecutionStateStoreError extends Error {
  constructor(readonly code: "EXECUTION_STATE_UNAVAILABLE" | "EXECUTION_STATE_INVALID") {
    super(GENERIC_ERROR);
    this.name = "ExecutionStateStoreError";
  }
}

function unavailable(): never { throw new ExecutionStateStoreError("EXECUTION_STATE_UNAVAILABLE"); }
function invalid(): never { throw new ExecutionStateStoreError("EXECUTION_STATE_INVALID"); }

export function executionStateFailureCode(error: unknown): "EXECUTION_STATE_UNAVAILABLE" | "EXECUTION_STATE_INVALID" {
  return error instanceof ExecutionStateStoreError ? error.code : "EXECUTION_STATE_UNAVAILABLE";
}

function executionStateDatabasePath() {
  return join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-state.sqlite");
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isFiniteNumber(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

function isPreview(value: unknown): value is NonNullable<ExecutionResult["preview"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preview = value as Record<string, unknown>;
  if (!hasOnlyKeys(preview, [
    "symbol", "side", "orderType", "quantity", "normalizedContractVolume",
    "referencePrice", "estimatedNotional", "estimatedMargin", "policyVersion",
    "price", "leverage", "reduceOnly",
  ])) return false;
  return typeof preview.symbol === "string" && SYMBOL.test(preview.symbol)
    && (preview.side === "long" || preview.side === "short")
    && (preview.orderType === "market" || preview.orderType === "limit")
    && isFiniteNumber(preview.quantity, Number.MIN_VALUE)
    && isFiniteNumber(preview.normalizedContractVolume, Number.MIN_VALUE)
    && isFiniteNumber(preview.referencePrice, Number.MIN_VALUE)
    && isFiniteNumber(preview.estimatedNotional)
    && isFiniteNumber(preview.estimatedMargin)
    && typeof preview.policyVersion === "string" && preview.policyVersion.length > 0 && preview.policyVersion.length <= 120
    && (preview.price === undefined || isFiniteNumber(preview.price, Number.MIN_VALUE))
    && Number.isInteger(preview.leverage) && (preview.leverage as number) > 0
    && typeof preview.reduceOnly === "boolean";
}

function strictSyntheticProvider(value: unknown): value is SyntheticProviderResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const provider = value as Record<string, unknown>;
  return hasOnlyKeys(provider, [
    "contractVersion", "providerKind", "provenance", "outcome", "executed", "reasonClass", "reconciliation",
  ]) && isSyntheticProviderResult(value);
}

function normalizeStoredResult(
  value: unknown,
  row: Pick<StoredStateRow, "intent_id" | "idempotency_key" | "symbol">,
): ExecutionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const result = value as Record<string, unknown>;
  if (!hasOnlyKeys(result, [
    "intentId", "idempotencyKey", "state", "executed", "duplicate", "reason", "preview", "providerResult",
  ])) invalid();
  if (result.intentId !== row.intent_id || result.idempotencyKey !== row.idempotency_key) invalid();
  if (result.state !== "blocked" && result.state !== "rejected" && result.state !== "prepared") invalid();
  if (result.executed !== false || result.duplicate !== false || typeof result.reason !== "string") invalid();

  const previewValue = result.preview;
  if (previewValue === undefined) invalid();
  if (previewValue !== null) {
    if (!isPreview(previewValue)) invalid();
    if (previewValue.symbol !== row.symbol) invalid();
  }

  const providerValue = result.providerResult;
  if (providerValue !== undefined && !strictSyntheticProvider(providerValue)) invalid();

  if (result.state === "rejected") {
    if (!rejectionCodes.has(result.reason as ExecutionRejectionCode)
      || previewValue !== null
      || providerValue !== undefined) invalid();
  } else if (result.state === "blocked") {
    if (!persistableBlockedCodes.has(result.reason as ExecutionBlockCode)
      || previewValue === null
      || providerValue !== undefined) invalid();
  } else if (result.reason !== "SYNTHETIC_PROVIDER_OUTCOME" || !previewValue || !providerValue) {
    invalid();
  }

  const preview = previewValue === null
    ? null
    : Object.freeze({ ...(previewValue as NonNullable<ExecutionResult["preview"]>) });
  const storedProvider = providerValue as SyntheticProviderResult | undefined;
  const providerResult: SyntheticProviderResult | undefined = storedProvider === undefined
    ? undefined
    : Object.freeze({
      ...storedProvider,
      ...(storedProvider.reconciliation
        ? { reconciliation: Object.freeze({ ...storedProvider.reconciliation }) }
        : {}),
    });
  return Object.freeze({
    intentId: result.intentId as string,
    idempotencyKey: result.idempotencyKey as string,
    state: result.state as ExecutionResult["state"],
    executed: false,
    duplicate: false,
    reason: result.reason as ExecutionResult["reason"],
    preview,
    ...(providerResult ? { providerResult } : {}),
  });
}

function validateScope(scope: ExecutionIdempotencyScope, identity?: ExecutionStateIdentity) {
  if (!TOKEN.test(scope.userId) || !TOKEN.test(scope.accountId) || !IDEMPOTENCY_KEY.test(scope.idempotencyKey)) invalid();
  if (identity && (!TOKEN.test(identity.intentId) || !SYMBOL.test(identity.symbol))) invalid();
}

function validateOccurredAt(value: string) {
  if (!value || value.length > 64 || !Number.isFinite(Date.parse(value))) invalid();
}

function rowResult(row: StoredStateRow): ExecutionResult | null {
  if (row.schema_version !== SCHEMA_VERSION || row.executed !== 0) invalid();
  if (!TOKEN.test(row.user_id) || !TOKEN.test(row.account_id) || !IDEMPOTENCY_KEY.test(row.idempotency_key)
    || !TOKEN.test(row.intent_id) || !SYMBOL.test(row.symbol)) invalid();
  validateOccurredAt(row.created_at);
  validateOccurredAt(row.updated_at);
  if (row.record_state === "processing") {
    if (row.result_state !== null || row.result_reason !== null || row.preview_json !== null || row.provider_json !== null) invalid();
    return null;
  }
  if (row.record_state !== "complete" || !row.result_state || !row.result_reason) invalid();

  let preview: unknown = null;
  let providerResult: unknown = undefined;
  try {
    preview = row.preview_json === null ? null : JSON.parse(row.preview_json);
    providerResult = row.provider_json === null ? undefined : JSON.parse(row.provider_json);
  } catch {
    invalid();
  }
  return normalizeStoredResult({
    intentId: row.intent_id,
    idempotencyKey: row.idempotency_key,
    state: row.result_state,
    executed: false,
    duplicate: false,
    reason: row.result_reason,
    preview,
    ...(providerResult === undefined ? {} : { providerResult }),
  }, row);
}

function rollback(db: DatabaseSync) {
  try { db.exec("ROLLBACK"); } catch { /* no active transaction */ }
}

export class SqliteExecutionStateStore implements ExecutionStateStore {
  private database: DatabaseSync | null = null;

  constructor(private readonly path = executionStateDatabasePath()) {}

  private hardenFiles() {
    if (this.path === ":memory:") return;
    for (const candidate of [this.path, `${this.path}-wal`, `${this.path}-shm`]) {
      if (existsSync(candidate)) chmodSync(candidate, 0o600);
    }
  }

  private db(): DatabaseSync {
    if (this.database) return this.database;
    let db: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      db = new DatabaseSync(this.path);
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const versionRow = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
      const version = versionRow?.user_version;
      if (version !== 0 && version !== SCHEMA_VERSION) invalid();
      if (version === 0) {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.exec(`CREATE TABLE execution_state (
            schema_version INTEGER NOT NULL CHECK(schema_version=1),
            user_id TEXT NOT NULL CHECK(length(user_id) BETWEEN 1 AND 120),
            account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 120),
            idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 120),
            intent_id TEXT NOT NULL CHECK(length(intent_id) BETWEEN 1 AND 120),
            symbol TEXT NOT NULL CHECK(length(symbol) BETWEEN 3 AND 41),
            record_state TEXT NOT NULL CHECK(record_state IN ('processing','complete')),
            result_state TEXT CHECK(result_state IN ('blocked','rejected','prepared')),
            result_reason TEXT CHECK(result_reason IS NULL OR length(result_reason) BETWEEN 1 AND 80),
            preview_json TEXT CHECK(preview_json IS NULL OR length(preview_json) <= ${MAX_PREVIEW_JSON_BYTES}),
            provider_json TEXT CHECK(provider_json IS NULL OR length(provider_json) <= ${MAX_PROVIDER_JSON_BYTES}),
            executed INTEGER NOT NULL DEFAULT 0 CHECK(executed=0),
            created_at TEXT NOT NULL CHECK(length(created_at) BETWEEN 1 AND 64),
            updated_at TEXT NOT NULL CHECK(length(updated_at) BETWEEN 1 AND 64),
            PRIMARY KEY(user_id, account_id, idempotency_key),
            CHECK (
              (record_state='processing' AND result_state IS NULL AND result_reason IS NULL AND preview_json IS NULL AND provider_json IS NULL)
              OR
              (record_state='complete' AND result_reason IS NOT NULL AND (
                (result_state='rejected' AND preview_json IS NULL AND provider_json IS NULL)
                OR (result_state='blocked' AND preview_json IS NOT NULL AND provider_json IS NULL)
                OR (result_state='prepared' AND preview_json IS NOT NULL AND provider_json IS NOT NULL)
              ))
            )
          );`);
          db.exec(`PRAGMA user_version=${SCHEMA_VERSION};`);
          db.exec("COMMIT");
        } catch (error) {
          rollback(db);
          throw error;
        }
      }
      this.hardenFiles();
      this.database = db;
      return db;
    } catch (error) {
      try { db?.close(); } catch { /* best effort */ }
      if (error instanceof ExecutionStateStoreError) throw error;
      unavailable();
    }
  }

  claim(scope: ExecutionIdempotencyScope, identity: ExecutionStateIdentity, occurredAt: string): ExecutionStateClaim {
    validateScope(scope, identity);
    validateOccurredAt(occurredAt);
    const db = this.db();
    try {
      db.exec("BEGIN IMMEDIATE");
      const existing = db.prepare(
        "SELECT * FROM execution_state WHERE user_id=? AND account_id=? AND idempotency_key=?",
      ).get(scope.userId, scope.accountId, scope.idempotencyKey) as StoredStateRow | undefined;
      if (existing) {
        if (existing.intent_id !== identity.intentId || existing.symbol !== identity.symbol) invalid();
        const result = rowResult(existing);
        db.exec("COMMIT");
        this.hardenFiles();
        return Object.freeze({ kind: "duplicate", result });
      }
      db.prepare(`INSERT INTO execution_state(
        schema_version,user_id,account_id,idempotency_key,intent_id,symbol,record_state,
        result_state,result_reason,preview_json,provider_json,executed,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,'processing',NULL,NULL,NULL,NULL,0,?,?)`)
        .run(SCHEMA_VERSION, scope.userId, scope.accountId, scope.idempotencyKey, identity.intentId, identity.symbol, occurredAt, occurredAt);
      db.exec("COMMIT");
      this.hardenFiles();
      return Object.freeze({ kind: "claimed" });
    } catch (error) {
      rollback(db);
      if (error instanceof ExecutionStateStoreError) throw error;
      unavailable();
    }
  }

  complete(scope: ExecutionIdempotencyScope, result: ExecutionResult, occurredAt: string): void {
    validateScope(scope);
    validateOccurredAt(occurredAt);
    const db = this.db();
    try {
      db.exec("BEGIN IMMEDIATE");
      const existing = db.prepare(
        "SELECT * FROM execution_state WHERE user_id=? AND account_id=? AND idempotency_key=?",
      ).get(scope.userId, scope.accountId, scope.idempotencyKey) as StoredStateRow | undefined;
      if (!existing || existing.record_state !== "processing") invalid();
      rowResult(existing);

      const normalized = normalizeStoredResult(result, existing);
      if (normalized.idempotencyKey !== scope.idempotencyKey || normalized.duplicate) invalid();

      const previewJson = normalized.preview ? JSON.stringify(normalized.preview) : null;
      const providerJson = normalized.providerResult ? JSON.stringify(normalized.providerResult) : null;
      if ((previewJson && Buffer.byteLength(previewJson, "utf8") > MAX_PREVIEW_JSON_BYTES)
        || (providerJson && Buffer.byteLength(providerJson, "utf8") > MAX_PROVIDER_JSON_BYTES)) invalid();

      const updated = db.prepare(`UPDATE execution_state
        SET record_state='complete',result_state=?,result_reason=?,preview_json=?,provider_json=?,updated_at=?
        WHERE user_id=? AND account_id=? AND idempotency_key=? AND record_state='processing'`)
        .run(normalized.state, normalized.reason, previewJson, providerJson, occurredAt, scope.userId, scope.accountId, scope.idempotencyKey);
      if (Number(updated.changes) !== 1) invalid();
      db.exec("COMMIT");
      this.hardenFiles();
    } catch (error) {
      rollback(db);
      if (error instanceof ExecutionStateStoreError) throw error;
      unavailable();
    }
  }

  close(): void {
    if (!this.database) return;
    try { this.database.close(); } finally { this.database = null; }
  }

  /** Test/ops evidence only; returns the configured path, never record contents. */
  databasePath(): string { return this.path; }
}

export function createProductionExecutionStateStore(): ExecutionStateStore {
  return new SqliteExecutionStateStore();
}

export function createInMemoryExecutionStateStoreForTests(): SqliteExecutionStateStore {
  return new SqliteExecutionStateStore(":memory:");
}

export function executionStateDatabasePathForTests(): string {
  return executionStateDatabasePath();
}

export function executionStateSidecarPathsForTests(path: string): readonly string[] {
  return Object.freeze([path, `${path}-wal`, `${path}-shm`].filter((candidate) => existsSync(candidate)));
}
