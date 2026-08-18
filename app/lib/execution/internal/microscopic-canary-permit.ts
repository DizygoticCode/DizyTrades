import "server-only";

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  mexcExecutionIdentityDigest,
  mexcExternalOid,
  type MexcExecutionIntent,
  type MexcIntentEvidence,
} from "./mexc-execution-writer";

export const MEXC_MICROSCOPIC_CANARY_MAX_NOTIONAL = 25;
export const MEXC_MICROSCOPIC_CANARY_TTL_MS = 2 * 60 * 1000;
const DATABASE_VERSION = 1;
const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const TOKEN = /^[A-Za-z0-9_-]{1,120}$/;
const SYMBOL = /^[A-Z0-9]{1,20}_USDT$/;
const POSITION_ID = /^[1-9][0-9]{0,30}$/;
const SHA256 = /^[a-f0-9]{64}$/;

type Identity = Readonly<{
  userId: string;
  accountId: string;
  writeCredentialGeneration: string;
}>;

export type MicroscopicCanaryPermitStatus = "unknown" | "armed" | "consumed" | "revoked";
export type MicroscopicCanaryPermitState = Readonly<{
  userId: string;
  accountId: string;
  writeCredentialGeneration: string;
  identityDigestSha256: string | null;
  revision: number;
  status: MicroscopicCanaryPermitStatus;
  lifecycleBindingDigestSha256: string | null;
  armedAt: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  terminalAt: string | null;
  updatedAt: string | null;
}>;
export type MicroscopicCanaryPermitEvent = Readonly<{
  sequence: number;
  userId: string;
  accountId: string;
  writeCredentialGeneration: string;
  revision: number;
  kind: "armed" | "consumed" | "revoked";
  occurredAt: string;
}>;

export class MicroscopicCanaryPermitError extends Error {
  constructor(readonly code: "MICROSCOPIC_CANARY_UNAVAILABLE" | "MICROSCOPIC_CANARY_INVALID" | "MICROSCOPIC_CANARY_CONFLICT") {
    super("MICROSCOPIC_CANARY_PERMIT_FAILURE");
    this.name = "MicroscopicCanaryPermitError";
  }
}

const fail = (code: MicroscopicCanaryPermitError["code"]): never => {
  throw new MicroscopicCanaryPermitError(code);
};
const timestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};
const identityValid = (identity: Identity) =>
  ID.test(identity.userId)
  && ID.test(identity.accountId)
  && TOKEN.test(identity.writeCredentialGeneration);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const providerSide = (intent: MexcExecutionIntent) => intent.side === "long" ? 2 : 4;
const providerOpenType = (intent: MexcExecutionIntent): 1 | 2 => intent.marginMode === "isolated" ? 1 : 2;

export const microscopicCanaryIdentity = (intent: MexcExecutionIntent): Identity => Object.freeze({
  userId: intent.userId,
  accountId: intent.accountId,
  writeCredentialGeneration: intent.writeCredentialGeneration,
});

export function microscopicCanaryIntentEligible(intent: MexcExecutionIntent) {
  return Boolean(
    intent
    && ID.test(intent.userId)
    && ID.test(intent.accountId)
    && TOKEN.test(intent.intentId)
    && TOKEN.test(intent.idempotencyKey)
    && SYMBOL.test(intent.symbol)
    && (intent.side === "long" || intent.side === "short")
    && intent.orderType === "limit"
    && intent.positionMode === "one-way"
    && POSITION_ID.test(intent.positionId)
    && (intent.marginMode === "isolated" || intent.marginMode === "cross")
    && intent.reduceOnly === true
    && intent.leverage === 1
    && TOKEN.test(intent.bindingGeneration)
    && TOKEN.test(intent.writeCredentialGeneration)
    && [intent.positionVolume, intent.volume, intent.price, intent.referencePrice, intent.estimatedNotional].every(Number.isFinite)
    && intent.positionVolume > 0
    && intent.volume > 0
    && intent.volume <= intent.positionVolume
    && intent.price > 0
    && intent.referencePrice > 0
    && intent.estimatedNotional > 0
    && intent.estimatedNotional <= MEXC_MICROSCOPIC_CANARY_MAX_NOTIONAL
    && [intent.rolloutRevision, intent.riskRevision, intent.reconciliationRevision].every((value) => Number.isSafeInteger(value) && value >= 1)
  );
}

const transportIntentDigest = (intent: MexcExecutionIntent) => sha256(JSON.stringify({
  symbol: intent.symbol,
  price: intent.price,
  vol: intent.volume,
  side: providerSide(intent),
  type: 1,
  openType: providerOpenType(intent),
  leverage: intent.leverage,
  externalOid: mexcExternalOid(intent),
  positionId: intent.positionId,
  positionMode: 2,
  reduceOnly: true,
}));

export function microscopicCanaryLifecycleBindingDigestForIntent(intent: MexcExecutionIntent) {
  if (!microscopicCanaryIntentEligible(intent)) return fail("MICROSCOPIC_CANARY_INVALID");
  return sha256(JSON.stringify([
    mexcExecutionIdentityDigest(intent),
    transportIntentDigest(intent),
    intent.bindingGeneration,
    intent.writeCredentialGeneration,
    intent.rolloutRevision,
    intent.riskRevision,
    intent.reconciliationRevision,
  ]));
}

export function microscopicCanaryLifecycleBindingDigestForEvidence(
  identityDigest: string,
  evidence: MexcIntentEvidence,
) {
  if (
    !SHA256.test(identityDigest)
    || !SHA256.test(evidence.intentDigest)
    || !TOKEN.test(evidence.bindingGeneration)
    || !TOKEN.test(evidence.writeCredentialGeneration)
    || ![evidence.rolloutRevision, evidence.riskRevision, evidence.reconciliationRevision].every((value) => Number.isSafeInteger(value) && value >= 1)
  ) return fail("MICROSCOPIC_CANARY_INVALID");
  return sha256(JSON.stringify([
    identityDigest,
    evidence.intentDigest,
    evidence.bindingGeneration,
    evidence.writeCredentialGeneration,
    evidence.rolloutRevision,
    evidence.riskRevision,
    evidence.reconciliationRevision,
  ]));
}

export class SqliteMicroscopicCanaryPermitStore {
  private database: DatabaseSync | null = null;
  private fileIdentity: Readonly<{ dev: number; ino: number }> | null = null;
  private poisoned = false;

  constructor(
    private readonly path = join(
      process.env.DATA_DIR || join(process.cwd(), ".data"),
      "execution-microscopic-canary.sqlite",
    ),
  ) {}

  private harden() {
    if (this.path === ":memory:") return;
    for (const file of [this.path, `${this.path}-wal`, `${this.path}-shm`]) {
      if (existsSync(file)) chmodSync(file, 0o600);
    }
  }

  private currentFileIdentity() {
    try {
      const stat = statSync(this.path);
      if (!stat.isFile()) return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
      return Object.freeze({ dev: stat.dev, ino: stat.ino });
    } catch (error) {
      if (error instanceof MicroscopicCanaryPermitError) throw error;
      return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    }
  }

  private assertFileIdentity() {
    if (this.poisoned) return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    if (this.path === ":memory:") return;
    const current = this.currentFileIdentity();
    if (!this.fileIdentity || current.dev !== this.fileIdentity.dev || current.ino !== this.fileIdentity.ino) {
      this.poisoned = true;
      this.close();
      return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    }
  }

  private db() {
    if (this.poisoned) return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    if (this.database) {
      this.assertFileIdentity();
      return this.database;
    }
    let db: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      db = new DatabaseSync(this.path);
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
      if (version !== 0 && version !== DATABASE_VERSION) return fail("MICROSCOPIC_CANARY_INVALID");
      if (version === 0) db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE microscopic_canary_state (
          schema_version INTEGER NOT NULL CHECK(schema_version=1),
          user_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          write_credential_generation TEXT NOT NULL,
          identity_digest_sha256 TEXT NOT NULL UNIQUE CHECK(length(identity_digest_sha256)=64),
          revision INTEGER NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('armed','consumed','revoked')),
          lifecycle_binding_digest_sha256 TEXT NOT NULL CHECK(length(lifecycle_binding_digest_sha256)=64),
          armed_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          terminal_at TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(user_id, account_id, write_credential_generation)
        );
        CREATE TABLE microscopic_canary_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          write_credential_generation TEXT NOT NULL,
          revision INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('armed','consumed','revoked')),
          occurred_at TEXT NOT NULL
        );
        PRAGMA user_version=${DATABASE_VERSION}; COMMIT;`);
      this.database = db;
      this.harden();
      if (this.path !== ":memory:") this.fileIdentity = this.currentFileIdentity();
      this.assertFileIdentity();
      return db;
    } catch (error) {
      try { db?.close(); } catch { /* fail closed */ }
      this.database = null;
      this.fileIdentity = null;
      if (error instanceof MicroscopicCanaryPermitError) throw error;
      return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    }
  }

  read(identity: Identity): MicroscopicCanaryPermitState {
    if (!identityValid(identity)) return fail("MICROSCOPIC_CANARY_INVALID");
    try {
      const row = this.db().prepare(`SELECT * FROM microscopic_canary_state
        WHERE user_id=? AND account_id=? AND write_credential_generation=?`).get(
          identity.userId,
          identity.accountId,
          identity.writeCredentialGeneration,
        ) as Record<string, unknown> | undefined;
      this.assertFileIdentity();
      if (!row) return Object.freeze({
        ...identity,
        identityDigestSha256: null,
        revision: 0,
        status: "unknown" as const,
        lifecycleBindingDigestSha256: null,
        armedAt: null,
        expiresAt: null,
        consumedAt: null,
        terminalAt: null,
        updatedAt: null,
      });
      const status = String(row.status) as MicroscopicCanaryPermitStatus;
      if (
        row.schema_version !== 1
        || row.user_id !== identity.userId
        || row.account_id !== identity.accountId
        || row.write_credential_generation !== identity.writeCredentialGeneration
        || !SHA256.test(String(row.identity_digest_sha256))
        || !Number.isSafeInteger(row.revision)
        || Number(row.revision) < 1
        || !["armed", "consumed", "revoked"].includes(status)
        || !SHA256.test(String(row.lifecycle_binding_digest_sha256))
        || !timestamp(row.armed_at)
        || !timestamp(row.expires_at)
        || !timestamp(row.updated_at)
        || (row.consumed_at !== null && !timestamp(row.consumed_at))
        || (row.terminal_at !== null && !timestamp(row.terminal_at))
        || (status === "armed" && (row.consumed_at !== null || row.terminal_at !== null))
        || (status === "consumed" && (row.consumed_at === null || row.terminal_at === null))
        || (status === "revoked" && (row.consumed_at !== null || row.terminal_at === null))
      ) return fail("MICROSCOPIC_CANARY_INVALID");
      return Object.freeze({
        ...identity,
        identityDigestSha256: String(row.identity_digest_sha256),
        revision: Number(row.revision),
        status,
        lifecycleBindingDigestSha256: String(row.lifecycle_binding_digest_sha256),
        armedAt: String(row.armed_at),
        expiresAt: String(row.expires_at),
        consumedAt: row.consumed_at === null ? null : String(row.consumed_at),
        terminalAt: row.terminal_at === null ? null : String(row.terminal_at),
        updatedAt: String(row.updated_at),
      });
    } catch (error) {
      if (error instanceof MicroscopicCanaryPermitError) throw error;
      return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    }
  }

  arm(intent: MexcExecutionIntent, at: string, expectedRevision = 0): MicroscopicCanaryPermitState {
    if (!timestamp(at) || expectedRevision !== 0 || !microscopicCanaryIntentEligible(intent)) return fail("MICROSCOPIC_CANARY_INVALID");
    const identity = microscopicCanaryIdentity(intent);
    const identityDigest = mexcExecutionIdentityDigest(intent);
    const bindingDigest = microscopicCanaryLifecycleBindingDigestForIntent(intent);
    const expiresAt = new Date(Date.parse(at) + MEXC_MICROSCOPIC_CANARY_TTL_MS).toISOString();
    const db = this.db();
    try {
      db.exec("BEGIN IMMEDIATE");
      const inserted = db.prepare(`INSERT OR IGNORE INTO microscopic_canary_state
        VALUES(1,?,?,?,?,1,'armed',?,?,?,NULL,NULL,?)`).run(
          identity.userId,
          identity.accountId,
          identity.writeCredentialGeneration,
          identityDigest,
          bindingDigest,
          at,
          expiresAt,
          at,
        );
      if (inserted.changes !== 1) {
        db.exec("ROLLBACK");
        return fail("MICROSCOPIC_CANARY_CONFLICT");
      }
      db.prepare(`INSERT INTO microscopic_canary_events
        (user_id,account_id,write_credential_generation,revision,kind,occurred_at)
        VALUES(?,?,?,?,?,?)`).run(identity.userId, identity.accountId, identity.writeCredentialGeneration, 1, "armed", at);
      db.exec("COMMIT");
      this.harden();
      this.assertFileIdentity();
      return this.read(identity);
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* fail closed */ }
      if (error instanceof MicroscopicCanaryPermitError) throw error;
      return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    }
  }

  consumeLifecycle(identityDigest: string, evidence: MexcIntentEvidence, at: string): boolean {
    if (!SHA256.test(identityDigest) || !timestamp(at)) return false;
    let bindingDigest: string;
    try { bindingDigest = microscopicCanaryLifecycleBindingDigestForEvidence(identityDigest, evidence); }
    catch { return false; }
    const nowMs = Date.parse(at);
    const db = this.db();
    try {
      db.exec("BEGIN IMMEDIATE");
      const row = db.prepare(`SELECT * FROM microscopic_canary_state
        WHERE identity_digest_sha256=? AND write_credential_generation=?`).get(
          identityDigest,
          evidence.writeCredentialGeneration,
        ) as Record<string, unknown> | undefined;
      if (!row || row.status !== "armed" || row.lifecycle_binding_digest_sha256 !== bindingDigest || !timestamp(row.armed_at) || !timestamp(row.expires_at)) {
        db.exec("COMMIT");
        return false;
      }
      const armedMs = Date.parse(String(row.armed_at));
      const expiresMs = Date.parse(String(row.expires_at));
      if (armedMs > nowMs || nowMs > expiresMs || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1) {
        db.exec("COMMIT");
        return false;
      }
      const revision = Number(row.revision) + 1;
      const updated = db.prepare(`UPDATE microscopic_canary_state
        SET revision=?,status='consumed',consumed_at=?,terminal_at=?,updated_at=?
        WHERE identity_digest_sha256=? AND write_credential_generation=?
          AND revision=? AND status='armed' AND lifecycle_binding_digest_sha256=?`).run(
            revision,
            at,
            at,
            at,
            identityDigest,
            evidence.writeCredentialGeneration,
            Number(row.revision),
            bindingDigest,
          );
      if (updated.changes !== 1) {
        db.exec("ROLLBACK");
        return false;
      }
      db.prepare(`INSERT INTO microscopic_canary_events
        (user_id,account_id,write_credential_generation,revision,kind,occurred_at)
        VALUES(?,?,?,?,?,?)`).run(
          String(row.user_id),
          String(row.account_id),
          String(row.write_credential_generation),
          revision,
          "consumed",
          at,
        );
      db.exec("COMMIT");
      this.harden();
      this.assertFileIdentity();
      return true;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* fail closed */ }
      if (error instanceof MicroscopicCanaryPermitError) throw error;
      return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    }
  }

  revoke(identity: Identity, at: string, expectedRevision: number): MicroscopicCanaryPermitState {
    if (!identityValid(identity) || !timestamp(at) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return fail("MICROSCOPIC_CANARY_INVALID");
    const current = this.read(identity);
    if (current.status === "consumed" || current.status === "revoked") return current;
    if (current.status !== "armed" || current.revision !== expectedRevision || !current.lifecycleBindingDigestSha256) return fail("MICROSCOPIC_CANARY_CONFLICT");
    const db = this.db();
    try {
      db.exec("BEGIN IMMEDIATE");
      const revision = expectedRevision + 1;
      const updated = db.prepare(`UPDATE microscopic_canary_state
        SET revision=?,status='revoked',terminal_at=?,updated_at=?
        WHERE user_id=? AND account_id=? AND write_credential_generation=? AND revision=? AND status='armed'`).run(
          revision,
          at,
          at,
          identity.userId,
          identity.accountId,
          identity.writeCredentialGeneration,
          expectedRevision,
        );
      if (updated.changes !== 1) {
        db.exec("ROLLBACK");
        return fail("MICROSCOPIC_CANARY_CONFLICT");
      }
      db.prepare(`INSERT INTO microscopic_canary_events
        (user_id,account_id,write_credential_generation,revision,kind,occurred_at)
        VALUES(?,?,?,?,?,?)`).run(identity.userId, identity.accountId, identity.writeCredentialGeneration, revision, "revoked", at);
      db.exec("COMMIT");
      this.harden();
      this.assertFileIdentity();
      return this.read(identity);
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* fail closed */ }
      if (error instanceof MicroscopicCanaryPermitError) throw error;
      return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    }
  }

  events(identity: Identity): readonly MicroscopicCanaryPermitEvent[] {
    if (!identityValid(identity)) return fail("MICROSCOPIC_CANARY_INVALID");
    try {
      const rows = this.db().prepare(`SELECT * FROM microscopic_canary_events
        WHERE user_id=? AND account_id=? AND write_credential_generation=? ORDER BY sequence`).all(
          identity.userId,
          identity.accountId,
          identity.writeCredentialGeneration,
        ) as Record<string, unknown>[];
      this.assertFileIdentity();
      return Object.freeze(rows.map((row) => {
        if (
          !Number.isSafeInteger(row.sequence)
          || !Number.isSafeInteger(row.revision)
          || row.user_id !== identity.userId
          || row.account_id !== identity.accountId
          || row.write_credential_generation !== identity.writeCredentialGeneration
          || !["armed", "consumed", "revoked"].includes(String(row.kind))
          || !timestamp(row.occurred_at)
        ) return fail("MICROSCOPIC_CANARY_INVALID");
        return Object.freeze({
          sequence: Number(row.sequence),
          userId: identity.userId,
          accountId: identity.accountId,
          writeCredentialGeneration: identity.writeCredentialGeneration,
          revision: Number(row.revision),
          kind: String(row.kind) as MicroscopicCanaryPermitEvent["kind"],
          occurredAt: String(row.occurred_at),
        });
      }));
    } catch (error) {
      if (error instanceof MicroscopicCanaryPermitError) throw error;
      return fail("MICROSCOPIC_CANARY_UNAVAILABLE");
    }
  }

  close() {
    try { this.database?.close(); } finally {
      this.database = null;
      this.fileIdentity = null;
    }
  }
}

export const createProductionMicroscopicCanaryPermitStore = () => new SqliteMicroscopicCanaryPermitStore();