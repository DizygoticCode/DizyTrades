import "server-only";

import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MEXC_PROVIDER_READBACK_MAX_AGE_MS, MEXC_PROVIDER_READBACK_VERSION } from "../../mexc-provider-readback";

export const EXECUTION_DAY_START_EQUITY_VERSION = "execution-day-start-equity/1.0.0" as const;
export const EXECUTION_DAY_START_CAPTURE_WINDOW_MS = 5 * 60 * 1000;

const DATABASE_VERSION = 1;
const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const HASH = /^[a-f0-9]{64}$/;
const GENERATION = /^[1-9][0-9]{0,8}$/;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
type FileIdentity = Readonly<{ dev: number; ino: number }>;
type Identity = Readonly<{ userId: string; accountId: string }>;

export type ExecutionDayStartEquityBaseline = Readonly<{
  version: typeof EXECUTION_DAY_START_EQUITY_VERSION;
  userId: string;
  accountId: string;
  utcDay: string;
  revision: number;
  equity: number;
  providerVersion: typeof MEXC_PROVIDER_READBACK_VERSION;
  providerObservedAt: string;
  bindingDigest: string;
  credentialGeneration: string;
  reconciliationRevision: number;
  recordedAt: string;
}>;

export type ExecutionDayStartEquityCapture = Readonly<Omit<
  ExecutionDayStartEquityBaseline,
  "version" | "revision" | "recordedAt"
>>;

export class ExecutionDayStartEquityStoreError extends Error {
  constructor(readonly code:
    | "EXECUTION_DAY_START_EQUITY_UNAVAILABLE"
    | "EXECUTION_DAY_START_EQUITY_INVALID"
    | "EXECUTION_DAY_START_EQUITY_CONFLICT"
    | "EXECUTION_DAY_START_EQUITY_WINDOW_MISSED") {
    super("EXECUTION_DAY_START_EQUITY_STORE_FAILURE");
    this.name = "ExecutionDayStartEquityStoreError";
  }
}

const fail = (code: ExecutionDayStartEquityStoreError["code"]): never => {
  throw new ExecutionDayStartEquityStoreError(code);
};
const canonicalTimestamp = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 64
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const validIdentity = (identity: Identity) => ID.test(identity.userId) && ID.test(identity.accountId);
const finitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function utcDayFor(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return fail("EXECUTION_DAY_START_EQUITY_INVALID");
  return date.toISOString().slice(0, 10);
}

export function isDayStartCaptureObservation(utcDay: string, observedAt: string) {
  if (!UTC_DAY.test(utcDay) || !canonicalTimestamp(observedAt)) return false;
  const start = Date.parse(`${utcDay}T00:00:00.000Z`);
  const observed = Date.parse(observedAt);
  return Number.isFinite(start) && observed >= start && observed < start + EXECUTION_DAY_START_CAPTURE_WINDOW_MS;
}

function validateBaseline(value: unknown, identity?: Identity, utcDay?: string): ExecutionDayStartEquityBaseline {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("EXECUTION_DAY_START_EQUITY_INVALID");
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  const allowed = new Set([
    "version", "userId", "accountId", "utcDay", "revision", "equity", "providerVersion",
    "providerObservedAt", "bindingDigest", "credentialGeneration", "reconciliationRevision", "recordedAt",
  ]);
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))
    || v.version !== EXECUTION_DAY_START_EQUITY_VERSION
    || typeof v.userId !== "string" || typeof v.accountId !== "string"
    || !validIdentity({ userId: v.userId, accountId: v.accountId })
    || typeof v.utcDay !== "string" || !UTC_DAY.test(v.utcDay)
    || !Number.isSafeInteger(v.revision) || Number(v.revision) < 1
    || !finitePositive(v.equity)
    || v.providerVersion !== MEXC_PROVIDER_READBACK_VERSION
    || !canonicalTimestamp(v.providerObservedAt)
    || !isDayStartCaptureObservation(v.utcDay, v.providerObservedAt)
    || typeof v.bindingDigest !== "string" || !HASH.test(v.bindingDigest)
    || typeof v.credentialGeneration !== "string" || !GENERATION.test(v.credentialGeneration)
    || !Number.isSafeInteger(v.reconciliationRevision) || Number(v.reconciliationRevision) < 1
    || !canonicalTimestamp(v.recordedAt)
    || Date.parse(v.recordedAt) < Date.parse(v.providerObservedAt)
    || Date.parse(v.recordedAt) - Date.parse(v.providerObservedAt) > MEXC_PROVIDER_READBACK_MAX_AGE_MS
    || (identity && (v.userId !== identity.userId || v.accountId !== identity.accountId))
    || (utcDay !== undefined && v.utcDay !== utcDay)) return fail("EXECUTION_DAY_START_EQUITY_INVALID");
  return Object.freeze({ ...v }) as ExecutionDayStartEquityBaseline;
}

export interface ExecutionDayStartEquityStore {
  read(identity: Identity, utcDay: string): ExecutionDayStartEquityBaseline | null;
  capture(input: ExecutionDayStartEquityCapture, now?: Date): ExecutionDayStartEquityBaseline;
}

export class SqliteExecutionDayStartEquityStore implements ExecutionDayStartEquityStore {
  private database: DatabaseSync | null = null;
  private file: FileIdentity | null = null;
  private poisoned = false;

  constructor(private readonly path = join(
    process.env.DATA_DIR || join(process.cwd(), ".data"),
    "execution-day-start-equity.sqlite",
  )) {}

  private harden() {
    if (this.path === ":memory:") return;
    for (const candidate of [this.path, `${this.path}-wal`, `${this.path}-shm`]) {
      if (existsSync(candidate)) chmodSync(candidate, 0o600);
    }
  }

  private poison(): never {
    this.poisoned = true;
    this.close();
    return fail("EXECUTION_DAY_START_EQUITY_UNAVAILABLE");
  }

  private current(): FileIdentity {
    try {
      const stat = statSync(this.path);
      return { dev: stat.dev, ino: stat.ino };
    } catch {
      return this.poison();
    }
  }

  private assertBacking() {
    if (this.poisoned) return fail("EXECUTION_DAY_START_EQUITY_UNAVAILABLE");
    if (this.path === ":memory:") return;
    const current = this.current();
    if (!this.file || current.dev !== this.file.dev || current.ino !== this.file.ino) return this.poison();
  }

  private db() {
    if (this.poisoned) return fail("EXECUTION_DAY_START_EQUITY_UNAVAILABLE");
    if (this.database) {
      this.assertBacking();
      return this.database;
    }
    let database: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      database = new DatabaseSync(this.path);
      database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version = (database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
      if (version !== 0 && version !== DATABASE_VERSION) fail("EXECUTION_DAY_START_EQUITY_INVALID");
      if (version === 0) database.exec(`BEGIN IMMEDIATE;
        CREATE TABLE execution_day_start_equity(
          schema_version INTEGER NOT NULL CHECK(schema_version=1),
          user_id TEXT NOT NULL CHECK(length(user_id) BETWEEN 1 AND 120),
          account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 120),
          utc_day TEXT NOT NULL CHECK(length(utc_day)=10),
          revision INTEGER NOT NULL CHECK(revision>=1),
          equity REAL NOT NULL CHECK(equity>0),
          provider_version TEXT NOT NULL CHECK(length(provider_version) BETWEEN 1 AND 80),
          provider_observed_at TEXT NOT NULL CHECK(length(provider_observed_at)<=64),
          binding_digest TEXT NOT NULL CHECK(length(binding_digest)=64),
          credential_generation TEXT NOT NULL CHECK(length(credential_generation) BETWEEN 1 AND 9),
          reconciliation_revision INTEGER NOT NULL CHECK(reconciliation_revision>=1),
          recorded_at TEXT NOT NULL CHECK(length(recorded_at)<=64),
          PRIMARY KEY(user_id,account_id,utc_day),
          UNIQUE(user_id,account_id,revision)
        );
        PRAGMA user_version=1;
        COMMIT;`);
      this.database = database;
      this.harden();
      if (this.path !== ":memory:") this.file = this.current();
      return database;
    } catch (error) {
      try { database?.close(); } catch { /* fail closed */ }
      this.database = null;
      this.file = null;
      if (error instanceof ExecutionDayStartEquityStoreError) throw error;
      return fail("EXECUTION_DAY_START_EQUITY_UNAVAILABLE");
    }
  }

  read(identity: Identity, utcDay: string) {
    if (!validIdentity(identity) || !UTC_DAY.test(utcDay)) return fail("EXECUTION_DAY_START_EQUITY_INVALID");
    try {
      const row = this.db().prepare(
        "SELECT * FROM execution_day_start_equity WHERE user_id=? AND account_id=? AND utc_day=?",
      ).get(identity.userId, identity.accountId, utcDay) as Record<string, unknown> | undefined;
      this.assertBacking();
      if (!row) return null;
      if (row.schema_version !== DATABASE_VERSION) return fail("EXECUTION_DAY_START_EQUITY_INVALID");
      return validateBaseline({
        version: EXECUTION_DAY_START_EQUITY_VERSION,
        userId: row.user_id,
        accountId: row.account_id,
        utcDay: row.utc_day,
        revision: row.revision,
        equity: row.equity,
        providerVersion: row.provider_version,
        providerObservedAt: row.provider_observed_at,
        bindingDigest: row.binding_digest,
        credentialGeneration: row.credential_generation,
        reconciliationRevision: row.reconciliation_revision,
        recordedAt: row.recorded_at,
      }, identity, utcDay);
    } catch (error) {
      if (error instanceof ExecutionDayStartEquityStoreError) throw error;
      return fail("EXECUTION_DAY_START_EQUITY_UNAVAILABLE");
    }
  }

  capture(input: ExecutionDayStartEquityCapture, now = new Date()) {
    if (!validIdentity(input) || !UTC_DAY.test(input.utcDay) || !finitePositive(input.equity)
      || input.providerVersion !== MEXC_PROVIDER_READBACK_VERSION
      || !canonicalTimestamp(input.providerObservedAt)
      || !HASH.test(input.bindingDigest) || !GENERATION.test(input.credentialGeneration)
      || !Number.isSafeInteger(input.reconciliationRevision) || input.reconciliationRevision < 1
      || !Number.isFinite(now.getTime())) return fail("EXECUTION_DAY_START_EQUITY_INVALID");
    if (!isDayStartCaptureObservation(input.utcDay, input.providerObservedAt)) {
      return fail("EXECUTION_DAY_START_EQUITY_WINDOW_MISSED");
    }
    const age = now.getTime() - Date.parse(input.providerObservedAt);
    if (age < 0 || age > MEXC_PROVIDER_READBACK_MAX_AGE_MS) return fail("EXECUTION_DAY_START_EQUITY_INVALID");
    const recordedAt = now.toISOString();
    const database = this.db();
    try {
      database.exec("BEGIN IMMEDIATE");
      const existing = database.prepare(
        "SELECT * FROM execution_day_start_equity WHERE user_id=? AND account_id=? AND utc_day=?",
      ).get(input.userId, input.accountId, input.utcDay) as Record<string, unknown> | undefined;
      if (existing) {
        database.exec("ROLLBACK");
        const current = this.read(input, input.utcDay);
        if (current
          && current.equity === input.equity
          && current.providerVersion === input.providerVersion
          && current.providerObservedAt === input.providerObservedAt
          && current.bindingDigest === input.bindingDigest
          && current.credentialGeneration === input.credentialGeneration
          && current.reconciliationRevision === input.reconciliationRevision) return current;
        return fail("EXECUTION_DAY_START_EQUITY_CONFLICT");
      }
      const previous = database.prepare(
        "SELECT MAX(revision) AS revision FROM execution_day_start_equity WHERE user_id=? AND account_id=?",
      ).get(input.userId, input.accountId) as { revision: number | null };
      const revision = Number(previous.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision) || revision < 1) return fail("EXECUTION_DAY_START_EQUITY_INVALID");
      database.prepare(`INSERT INTO execution_day_start_equity(
        schema_version,user_id,account_id,utc_day,revision,equity,provider_version,
        provider_observed_at,binding_digest,credential_generation,reconciliation_revision,recorded_at
      ) VALUES(1,?,?,?,?,?,?,?,?,?,?,?)`).run(
        input.userId, input.accountId, input.utcDay, revision, input.equity, input.providerVersion,
        input.providerObservedAt, input.bindingDigest, input.credentialGeneration,
        input.reconciliationRevision, recordedAt,
      );
      database.exec("COMMIT");
      this.harden();
      this.assertBacking();
      const stored = this.read(input, input.utcDay);
      if (!stored) return fail("EXECUTION_DAY_START_EQUITY_UNAVAILABLE");
      return stored;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch { /* no active transaction */ }
      if (error instanceof ExecutionDayStartEquityStoreError) throw error;
      return fail("EXECUTION_DAY_START_EQUITY_UNAVAILABLE");
    }
  }

  close() {
    try { this.database?.close(); } finally {
      this.database = null;
      this.file = null;
    }
  }

  databasePath() { return this.path; }
}

export const createProductionExecutionDayStartEquityStore = () => new SqliteExecutionDayStartEquityStore();
