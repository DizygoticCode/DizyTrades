import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { executionGradeDatabaseSession, executionGradeDatabaseSessionFingerprint } from "../../auth-db";
import type { AuthenticatedExecutionCaller, ExecutionBoundaryRequest } from "../types";

export const EXECUTION_INTERNAL_CALLER_ID = "dizytrades-server" as const;
export const EXECUTION_CALLER_ASSERTION_TTL_MS = 30_000;
const DATABASE_VERSION = 1;
const MAX_ROWS = 2_000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const IDENTITY = /^[A-Za-z0-9_:@.-]{1,120}$/;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export class ExecutionCallerAssertionError extends Error {
  constructor() { super("EXECUTION_CALLER_ASSERTION_UNAVAILABLE"); this.name = "ExecutionCallerAssertionError"; }
}

export const executionCallerDatabasePath = () => join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-caller.sqlite");

type SessionResolver = (token: string, now?: number) => Readonly<{ userId: string; sessionFingerprint: string; expiresAt: number }> | null;
type FingerprintResolver = (fingerprint: string, now?: number) => Readonly<{ userId: string; sessionFingerprint: string; expiresAt: number }> | null;

export class ExecutionCallerAssertionStore {
  private database: DatabaseSync | null = null;
  private fileIdentity: Readonly<{ device: bigint; inode: bigint }> | null = null;
  constructor(
    private readonly path = executionCallerDatabasePath(),
    private readonly clock: () => number = Date.now,
    private readonly resolveSession: SessionResolver = executionGradeDatabaseSession,
    private readonly resolveFingerprint: FingerprintResolver = executionGradeDatabaseSessionFingerprint,
  ) {}

  private db() {
    if (this.database) { this.assertFileIdentity(); return this.database; }
    let db: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      db = new DatabaseSync(this.path);
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
      if (version !== 0 && version !== DATABASE_VERSION) throw new Error("unsupported");
      if (version === 0) db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE caller_assertions (
          assertion_hash TEXT PRIMARY KEY CHECK(length(assertion_hash)=64),
          caller_id TEXT NOT NULL, user_id TEXT NOT NULL, account_id TEXT NOT NULL,
          session_fingerprint TEXT NOT NULL CHECK(length(session_fingerprint)=64),
          created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
        );
        CREATE INDEX caller_assertions_expiry_idx ON caller_assertions(expires_at);
        PRAGMA user_version=${DATABASE_VERSION}; COMMIT;`);
      this.harden();
      this.fileIdentity = this.readFileIdentity();
      this.database = db;
      this.assertFileIdentity();
      return db;
    } catch {
      try { db?.close(); } catch { /* fail closed */ }
      throw new ExecutionCallerAssertionError();
    }
  }

  private readFileIdentity() {
    if (this.path === ":memory:") return null;
    const file = statSync(this.path, { bigint: true });
    if (!file.isFile()) throw new Error("invalid storage");
    return Object.freeze({ device: file.dev, inode: file.ino });
  }

  /** A cached SQLite descriptor must never outlive the pathname that authorized it. */
  private assertFileIdentity() {
    if (this.path === ":memory:") return;
    try {
      const current = this.readFileIdentity();
      if (!this.fileIdentity || !current || current.device !== this.fileIdentity.device || current.inode !== this.fileIdentity.inode) throw new Error("storage replaced");
    } catch {
      throw new ExecutionCallerAssertionError();
    }
  }

  private harden() {
    if (this.path === ":memory:") return;
    for (const file of [this.path, `${this.path}-wal`, `${this.path}-shm`]) if (existsSync(file)) chmodSync(file, 0o600);
  }

  issue(input: Readonly<{ sessionToken: string; accountId: string; callerId?: string }>) {
    const now = this.clock();
    if (input.callerId !== undefined && input.callerId !== EXECUTION_INTERNAL_CALLER_ID) return null;
    if (!IDENTITY.test(input.accountId) || !Number.isSafeInteger(now) || now < 0) return null;
    const session = this.resolveSession(input.sessionToken, now);
    if (!session || !IDENTITY.test(session.userId) || !/^[a-f0-9]{64}$/.test(session.sessionFingerprint)) return null;
    const assertionId = randomBytes(32).toString("base64url"), expiresAt = Math.min(now + EXECUTION_CALLER_ASSERTION_TTL_MS, session.expiresAt);
    if (expiresAt <= now) return null;
    const db = this.db();
    try {
      db.exec("BEGIN IMMEDIATE");
      db.prepare("DELETE FROM caller_assertions WHERE expires_at<=? OR consumed_at IS NOT NULL").run(now);
      const count = (db.prepare("SELECT count(*) AS count FROM caller_assertions").get() as { count: number }).count;
      if (count >= MAX_ROWS) { db.exec("ROLLBACK"); return null; }
      db.prepare("INSERT INTO caller_assertions VALUES(?,?,?,?,?,?,?,NULL)").run(digest(assertionId), EXECUTION_INTERNAL_CALLER_ID, session.userId, input.accountId, session.sessionFingerprint, now, expiresAt);
      this.assertFileIdentity(); db.exec("COMMIT"); this.assertFileIdentity(); this.harden(); this.assertFileIdentity();
      return Object.freeze({ callerId: EXECUTION_INTERNAL_CALLER_ID, assertionId, userId: session.userId, accountId: input.accountId, expiresAt });
    } catch { try { db.exec("ROLLBACK"); } catch { /* fail closed */ } throw new ExecutionCallerAssertionError(); }
  }

  consume(assertion: ExecutionBoundaryRequest["callerAssertion"]): AuthenticatedExecutionCaller | null {
    const now = this.clock();
    if (!assertion || assertion.callerId !== EXECUTION_INTERNAL_CALLER_ID || !TOKEN.test(assertion.assertionId) || !Number.isSafeInteger(now)) return null;
    const db = this.db(), assertionHash = digest(assertion.assertionId);
    try {
      db.exec("BEGIN IMMEDIATE");
      const row = db.prepare(`SELECT caller_id,user_id,account_id,session_fingerprint,expires_at FROM caller_assertions
        WHERE assertion_hash=? AND consumed_at IS NULL AND expires_at>?`).get(assertionHash, now) as
        { caller_id: string; user_id: string; account_id: string; session_fingerprint: string; expires_at: number } | undefined;
      if (!row || row.caller_id !== EXECUTION_INTERNAL_CALLER_ID || !IDENTITY.test(row.user_id) || !IDENTITY.test(row.account_id)
        || !/^[a-f0-9]{64}$/.test(row.session_fingerprint) || !Number.isSafeInteger(row.expires_at)) { db.exec("COMMIT"); return null; }
      const result = db.prepare("UPDATE caller_assertions SET consumed_at=? WHERE assertion_hash=? AND consumed_at IS NULL").run(now, assertionHash);
      if (result.changes !== 1) { db.exec("COMMIT"); return null; }
      const active = this.resolveFingerprint(row.session_fingerprint, now);
      this.assertFileIdentity(); db.exec("COMMIT"); this.assertFileIdentity();
      if (!active || active.userId !== row.user_id) return null;
      return Object.freeze({ callerId: row.caller_id, userId: row.user_id, accountId: row.account_id });
    } catch { try { db.exec("ROLLBACK"); } catch { /* fail closed */ } throw new ExecutionCallerAssertionError(); }
  }

  close() { this.database?.close(); this.database = null; this.fileIdentity = null; }
}

let productionStore: ExecutionCallerAssertionStore | null = null;
export const verifyProductionExecutionCaller = (assertion: ExecutionBoundaryRequest["callerAssertion"]) => {
  try { productionStore ??= new ExecutionCallerAssertionStore(); return productionStore.consume(assertion); } catch { return null; }
};
