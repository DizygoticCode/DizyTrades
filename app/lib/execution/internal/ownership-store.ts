import "server-only";

import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExecutionAccountIdentity } from "./reconciliation-store";

export type ExecutionOwnershipStatus = "unknown" | "proved" | "active" | "revoked";
export type ExecutionOwnershipState = Readonly<{
  revision: number;
  status: ExecutionOwnershipStatus;
  proofObservedAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
}>;

const VERSION = 1;
const TOKEN = /^[A-Za-z0-9_-]{1,120}$/;
type FileIdentity = Readonly<{ dev: number; ino: number }>;

export class ExecutionOwnershipStoreError extends Error {
  constructor(readonly code: "EXECUTION_OWNERSHIP_UNAVAILABLE" | "EXECUTION_OWNERSHIP_INVALID") {
    super("EXECUTION_OWNERSHIP_STORE_FAILURE");
    this.name = "ExecutionOwnershipStoreError";
  }
}

const fail = (code: ExecutionOwnershipStoreError["code"]): never => { throw new ExecutionOwnershipStoreError(code); };
const validIdentity = (identity: ExecutionAccountIdentity) => TOKEN.test(identity.userId) && TOKEN.test(identity.accountId);
const validIso = (value: string | null) => value === null || (Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value && value.length <= 64);

export interface ExecutionOwnershipStore {
  read(identity: ExecutionAccountIdentity): ExecutionOwnershipState;
  recordProof(identity: ExecutionAccountIdentity, proofObservedAt: string, expectedRevision: number): ExecutionOwnershipState;
  activate(identity: ExecutionAccountIdentity, expectedRevision: number, now: Date): ExecutionOwnershipState;
  revoke(identity: ExecutionAccountIdentity, expectedRevision: number, now: Date): ExecutionOwnershipState;
}

export class SqliteExecutionOwnershipStore implements ExecutionOwnershipStore {
  private database: DatabaseSync | null = null;
  private identity: FileIdentity | null = null;

  constructor(private readonly path = join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-ownership.sqlite")) {}

  private current(): FileIdentity {
    try { const stat = statSync(this.path); return { dev: stat.dev, ino: stat.ino }; }
    catch { return fail("EXECUTION_OWNERSHIP_UNAVAILABLE"); }
  }
  private assertBacking() {
    if (this.path === ":memory:") return;
    const current = this.current();
    if (!this.identity || current.dev !== this.identity.dev || current.ino !== this.identity.ino) {
      this.close();
      fail("EXECUTION_OWNERSHIP_UNAVAILABLE");
    }
  }
  private harden() {
    if (this.path === ":memory:") return;
    for (const file of [this.path, `${this.path}-wal`, `${this.path}-shm`]) if (existsSync(file)) chmodSync(file, 0o600);
  }
  private db() {
    if (this.database) { this.assertBacking(); return this.database; }
    let database: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      database = new DatabaseSync(this.path);
      database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const row = database.prepare("PRAGMA user_version").get() as { user_version: number };
      if (row.user_version !== 0 && row.user_version !== VERSION) fail("EXECUTION_OWNERSHIP_INVALID");
      if (row.user_version === 0) database.exec(`BEGIN IMMEDIATE; CREATE TABLE ownership_state(
        schema_version INTEGER NOT NULL CHECK(schema_version=1),
        user_id TEXT NOT NULL CHECK(length(user_id) BETWEEN 1 AND 120),
        account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 120),
        revision INTEGER NOT NULL CHECK(revision>=1),
        status TEXT NOT NULL CHECK(status IN ('proved','active','revoked')),
        proof_observed_at TEXT CHECK(proof_observed_at IS NULL OR length(proof_observed_at)<=64),
        activated_at TEXT CHECK(activated_at IS NULL OR length(activated_at)<=64),
        revoked_at TEXT CHECK(revoked_at IS NULL OR length(revoked_at)<=64),
        updated_at TEXT NOT NULL CHECK(length(updated_at)<=64),
        PRIMARY KEY(user_id,account_id)); PRAGMA user_version=1; COMMIT;`);
      this.database = database;
      this.harden();
      if (this.path !== ":memory:") this.identity = this.current();
      return database;
    } catch (error) {
      try { database?.close(); } catch {}
      this.database = null; this.identity = null;
      if (error instanceof ExecutionOwnershipStoreError) throw error;
      return fail("EXECUTION_OWNERSHIP_UNAVAILABLE");
    }
  }
  private parse(row: Record<string, unknown> | undefined, identity: ExecutionAccountIdentity): ExecutionOwnershipState {
    if (!row) return Object.freeze({ revision: 0, status: "unknown", proofObservedAt: null, activatedAt: null, revokedAt: null });
    const status = String(row.status) as ExecutionOwnershipStatus;
    const proofObservedAt = row.proof_observed_at === null ? null : String(row.proof_observed_at);
    const activatedAt = row.activated_at === null ? null : String(row.activated_at);
    const revokedAt = row.revoked_at === null ? null : String(row.revoked_at);
    const updatedAt = String(row.updated_at);
    const semantic = (status === "proved" && proofObservedAt !== null && activatedAt === null && revokedAt === null)
      || (status === "active" && proofObservedAt !== null && activatedAt !== null && revokedAt === null)
      || (status === "revoked" && activatedAt === null && revokedAt !== null);
    if (row.schema_version !== VERSION || row.user_id !== identity.userId || row.account_id !== identity.accountId
      || !validIdentity({ userId: String(row.user_id), accountId: String(row.account_id) })
      || !Number.isSafeInteger(row.revision) || (row.revision as number) < 1
      || !semantic || !validIso(proofObservedAt) || !validIso(activatedAt) || !validIso(revokedAt) || !validIso(updatedAt))
      fail("EXECUTION_OWNERSHIP_INVALID");
    return Object.freeze({ revision: row.revision as number, status, proofObservedAt, activatedAt, revokedAt });
  }
  read(identity: ExecutionAccountIdentity) {
    if (!validIdentity(identity)) return fail("EXECUTION_OWNERSHIP_INVALID");
    const database = this.db();
    try {
      const state = this.parse(database.prepare("SELECT * FROM ownership_state WHERE user_id=? AND account_id=?").get(identity.userId, identity.accountId) as Record<string, unknown> | undefined, identity);
      this.assertBacking();
      return state;
    } catch (error) {
      if (error instanceof ExecutionOwnershipStoreError) throw error;
      return fail("EXECUTION_OWNERSHIP_UNAVAILABLE");
    }
  }
  recordProof(identity: ExecutionAccountIdentity, proofObservedAt: string, expectedRevision: number) {
    if (!validIdentity(identity) || !validIso(proofObservedAt) || proofObservedAt === null) return fail("EXECUTION_OWNERSHIP_INVALID");
    const previous = this.read(identity);
    if (previous.revision !== expectedRevision) return fail("EXECUTION_OWNERSHIP_INVALID");
    // Readback never activates and never clears revocation. It may retain a fresh
    // proof so a later, separate activation call can deliberately reactivate.
    return this.write(
      identity,
      previous.status === "revoked" ? "revoked" : previous.status === "active" ? "active" : "proved",
      proofObservedAt,
      previous.status === "active" ? previous.activatedAt : null,
      previous.revokedAt,
      expectedRevision,
    );
  }
  activate(identity: ExecutionAccountIdentity, expectedRevision: number, now: Date) {
    const previous = this.read(identity);
    if (previous.revision !== expectedRevision || previous.proofObservedAt === null || previous.status === "active") return fail("EXECUTION_OWNERSHIP_INVALID");
    return this.write(identity, "active", previous.proofObservedAt, now.toISOString(), null, expectedRevision);
  }
  revoke(identity: ExecutionAccountIdentity, expectedRevision: number, now: Date) {
    const previous = this.read(identity);
    if (previous.revision !== expectedRevision || previous.status === "unknown" || previous.status === "revoked") return fail("EXECUTION_OWNERSHIP_INVALID");
    return this.write(identity, "revoked", null, null, now.toISOString(), expectedRevision);
  }
  private write(identity: ExecutionAccountIdentity, status: Exclude<ExecutionOwnershipStatus, "unknown">, proofObservedAt: string | null, activatedAt: string | null, revokedAt: string | null, revision: number) {
    const database = this.db();
    try {
      database.exec("BEGIN IMMEDIATE");
      const current = database.prepare("SELECT revision FROM ownership_state WHERE user_id=? AND account_id=?").get(identity.userId, identity.accountId) as { revision: number } | undefined;
      if ((current?.revision ?? 0) !== revision) fail("EXECUTION_OWNERSHIP_INVALID");
      database.prepare(`INSERT INTO ownership_state VALUES(1,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,account_id) DO UPDATE SET
        revision=excluded.revision,status=excluded.status,proof_observed_at=excluded.proof_observed_at,activated_at=excluded.activated_at,revoked_at=excluded.revoked_at,updated_at=excluded.updated_at`)
        .run(identity.userId, identity.accountId, revision + 1, status, proofObservedAt, activatedAt, revokedAt, new Date().toISOString());
      database.exec("COMMIT"); this.harden(); this.assertBacking(); return this.read(identity);
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      if (error instanceof ExecutionOwnershipStoreError) throw error;
      return fail("EXECUTION_OWNERSHIP_UNAVAILABLE");
    }
  }
  close() { try { this.database?.close(); } finally { this.database = null; this.identity = null; } }
  databasePath() { return this.path; }
}

export const createProductionExecutionOwnershipStore = () => new SqliteExecutionOwnershipStore();
