import "server-only";

import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const MEXC_WRITE_PERMISSION_ATTESTATION = "mexc-futures-order-placing-only/v1" as const;
export const MEXC_WRITE_EGRESS_ATTESTATION = "mexc-write-egress-allowlisted-for-generation/v1" as const;

const VERSION = 1;
const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const SHA256 = /^[a-f0-9]{64}$/;

type FileIdentity = Readonly<{ dev: number; ino: number }>;
export type WriteCredentialAuthorityIdentity = Readonly<{
  userId: string;
  accountId: string;
  writeCredentialGeneration: string;
}>;
export type WriteCredentialAuthorityStatus = "unknown" | "attested" | "active" | "revoked";
export type WriteCredentialAuthorityState = Readonly<{
  revision: number;
  status: WriteCredentialAuthorityStatus;
  credentialFingerprintSha256: string | null;
  permissionAttestation: typeof MEXC_WRITE_PERMISSION_ATTESTATION | null;
  egressAttestation: typeof MEXC_WRITE_EGRESS_ATTESTATION | null;
  attestedAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  updatedAt: string | null;
}>;
export type WriteCredentialAuthorityEvent = Readonly<{
  sequence: number;
  userId: string;
  accountId: string;
  writeCredentialGeneration: string;
  revision: number;
  kind: "attested" | "activated" | "revoked";
  occurredAt: string;
}>;

export class ExecutionWriteCredentialAuthorityStoreError extends Error {
  constructor(readonly code:
    | "EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE"
    | "EXECUTION_WRITE_CREDENTIAL_AUTHORITY_INVALID"
    | "EXECUTION_WRITE_CREDENTIAL_AUTHORITY_CONFLICT") {
    super(code);
    this.name = "ExecutionWriteCredentialAuthorityStoreError";
  }
}

const fail = (code: ExecutionWriteCredentialAuthorityStoreError["code"]): never => {
  throw new ExecutionWriteCredentialAuthorityStoreError(code);
};
const validIdentity = (identity: WriteCredentialAuthorityIdentity) =>
  ID.test(identity.userId) && ID.test(identity.accountId) && ID.test(identity.writeCredentialGeneration);
const canonicalTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};

export interface ExecutionWriteCredentialAuthorityStore {
  read(identity: WriteCredentialAuthorityIdentity): WriteCredentialAuthorityState;
  attest(
    identity: WriteCredentialAuthorityIdentity,
    credentialFingerprintSha256: string,
    permissionAttestation: typeof MEXC_WRITE_PERMISSION_ATTESTATION,
    egressAttestation: typeof MEXC_WRITE_EGRESS_ATTESTATION,
    occurredAt: string,
    expectedRevision: number,
  ): WriteCredentialAuthorityState;
  activate(identity: WriteCredentialAuthorityIdentity, occurredAt: string, expectedRevision: number): WriteCredentialAuthorityState;
  revoke(identity: WriteCredentialAuthorityIdentity, occurredAt: string, expectedRevision: number): WriteCredentialAuthorityState;
  events(identity: WriteCredentialAuthorityIdentity): readonly WriteCredentialAuthorityEvent[];
}

export class SqliteExecutionWriteCredentialAuthorityStore implements ExecutionWriteCredentialAuthorityStore {
  private database: DatabaseSync | null = null;
  private fileIdentity: FileIdentity | null = null;
  private poisoned = false;

  constructor(
    private readonly path = join(
      process.env.DATA_DIR || join(process.cwd(), ".data"),
      "execution-write-credential-authority.sqlite",
    ),
  ) {}

  private harden() {
    if (this.path === ":memory:") return;
    for (const candidate of [this.path, `${this.path}-wal`, `${this.path}-shm`]) {
      if (existsSync(candidate)) chmodSync(candidate, 0o600);
    }
  }

  private currentFileIdentity(): FileIdentity {
    try {
      const stat = statSync(this.path);
      return { dev: stat.dev, ino: stat.ino };
    } catch {
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    }
  }

  private assertBackingFile() {
    if (this.poisoned) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    if (this.path === ":memory:") return;
    const current = this.currentFileIdentity();
    if (!this.fileIdentity || current.dev !== this.fileIdentity.dev || current.ino !== this.fileIdentity.ino) {
      this.poisoned = true;
      this.close();
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    }
  }

  private db() {
    if (this.poisoned) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    if (this.database) {
      this.assertBackingFile();
      return this.database;
    }

    let database: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      database = new DatabaseSync(this.path);
      database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version = (database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
      if (version !== 0 && version !== VERSION) fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_INVALID");
      if (version === 0) {
        database.exec(`BEGIN IMMEDIATE;
          CREATE TABLE write_credential_authority(
            schema_version INTEGER NOT NULL CHECK(schema_version=1),
            user_id TEXT NOT NULL CHECK(length(user_id) BETWEEN 1 AND 120),
            account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 120),
            write_generation TEXT NOT NULL CHECK(length(write_generation) BETWEEN 1 AND 120),
            revision INTEGER NOT NULL CHECK(revision>=1),
            status TEXT NOT NULL CHECK(status IN ('attested','active','revoked')),
            credential_fingerprint_sha256 TEXT NOT NULL CHECK(length(credential_fingerprint_sha256)=64),
            permission_attestation TEXT NOT NULL CHECK(permission_attestation='mexc-futures-order-placing-only/v1'),
            egress_attestation TEXT NOT NULL CHECK(egress_attestation='mexc-write-egress-allowlisted-for-generation/v1'),
            attested_at TEXT NOT NULL CHECK(length(attested_at)<=64),
            activated_at TEXT CHECK(activated_at IS NULL OR length(activated_at)<=64),
            revoked_at TEXT CHECK(revoked_at IS NULL OR length(revoked_at)<=64),
            updated_at TEXT NOT NULL CHECK(length(updated_at)<=64),
            PRIMARY KEY(user_id,account_id,write_generation)
          );
          CREATE UNIQUE INDEX one_active_write_generation_per_account
            ON write_credential_authority(user_id,account_id) WHERE status='active';
          CREATE TABLE write_credential_authority_events(
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL CHECK(length(user_id) BETWEEN 1 AND 120),
            account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 120),
            write_generation TEXT NOT NULL CHECK(length(write_generation) BETWEEN 1 AND 120),
            revision INTEGER NOT NULL CHECK(revision>=1),
            kind TEXT NOT NULL CHECK(kind IN ('attested','activated','revoked')),
            occurred_at TEXT NOT NULL CHECK(length(occurred_at)<=64)
          );
          PRAGMA user_version=1;
          COMMIT;`);
      }
      this.database = database;
      this.harden();
      if (this.path !== ":memory:") this.fileIdentity = this.currentFileIdentity();
      return database;
    } catch (error) {
      try { database?.close(); } catch { /* fail closed */ }
      this.database = null;
      this.fileIdentity = null;
      if (error instanceof ExecutionWriteCredentialAuthorityStoreError) throw error;
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    }
  }

  private parse(row: Record<string, unknown> | undefined, identity: WriteCredentialAuthorityIdentity): WriteCredentialAuthorityState {
    if (!row) {
      return Object.freeze({
        revision: 0,
        status: "unknown" as const,
        credentialFingerprintSha256: null,
        permissionAttestation: null,
        egressAttestation: null,
        attestedAt: null,
        activatedAt: null,
        revokedAt: null,
        updatedAt: null,
      });
    }

    const status = String(row.status) as WriteCredentialAuthorityStatus;
    const fingerprint = String(row.credential_fingerprint_sha256);
    const permissionAttestation = String(row.permission_attestation);
    const egressAttestation = String(row.egress_attestation);
    const attestedAt = String(row.attested_at);
    const activatedAt = row.activated_at === null ? null : String(row.activated_at);
    const revokedAt = row.revoked_at === null ? null : String(row.revoked_at);
    const updatedAt = String(row.updated_at);
    const semanticState =
      (status === "attested" && activatedAt === null && revokedAt === null)
      || (status === "active" && activatedAt !== null && revokedAt === null)
      || (status === "revoked" && revokedAt !== null);

    if (
      row.schema_version !== VERSION
      || row.user_id !== identity.userId
      || row.account_id !== identity.accountId
      || row.write_generation !== identity.writeCredentialGeneration
      || !validIdentity(identity)
      || !Number.isSafeInteger(row.revision)
      || Number(row.revision) < 1
      || !["attested", "active", "revoked"].includes(status)
      || !SHA256.test(fingerprint)
      || permissionAttestation !== MEXC_WRITE_PERMISSION_ATTESTATION
      || egressAttestation !== MEXC_WRITE_EGRESS_ATTESTATION
      || !canonicalTimestamp(attestedAt)
      || (activatedAt !== null && !canonicalTimestamp(activatedAt))
      || (revokedAt !== null && !canonicalTimestamp(revokedAt))
      || !canonicalTimestamp(updatedAt)
      || !semanticState
      || (activatedAt !== null && Date.parse(activatedAt) < Date.parse(attestedAt))
      || (revokedAt !== null && Date.parse(revokedAt) < Date.parse(attestedAt))
    ) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_INVALID");

    return Object.freeze({
      revision: Number(row.revision),
      status,
      credentialFingerprintSha256: fingerprint,
      permissionAttestation: MEXC_WRITE_PERMISSION_ATTESTATION,
      egressAttestation: MEXC_WRITE_EGRESS_ATTESTATION,
      attestedAt,
      activatedAt,
      revokedAt,
      updatedAt,
    });
  }

  read(identity: WriteCredentialAuthorityIdentity): WriteCredentialAuthorityState {
    if (!validIdentity(identity)) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_INVALID");
    try {
      const state = this.parse(
        this.db().prepare("SELECT * FROM write_credential_authority WHERE user_id=? AND account_id=? AND write_generation=?")
          .get(identity.userId, identity.accountId, identity.writeCredentialGeneration) as Record<string, unknown> | undefined,
        identity,
      );
      this.assertBackingFile();
      return state;
    } catch (error) {
      if (error instanceof ExecutionWriteCredentialAuthorityStoreError) throw error;
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    }
  }

  attest(
    identity: WriteCredentialAuthorityIdentity,
    credentialFingerprintSha256: string,
    permissionAttestation: typeof MEXC_WRITE_PERMISSION_ATTESTATION,
    egressAttestation: typeof MEXC_WRITE_EGRESS_ATTESTATION,
    occurredAt: string,
    expectedRevision: number,
  ): WriteCredentialAuthorityState {
    if (
      !validIdentity(identity)
      || !SHA256.test(credentialFingerprintSha256)
      || permissionAttestation !== MEXC_WRITE_PERMISSION_ATTESTATION
      || egressAttestation !== MEXC_WRITE_EGRESS_ATTESTATION
      || !canonicalTimestamp(occurredAt)
      || expectedRevision !== 0
    ) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_INVALID");
    return this.write(identity, "attested", credentialFingerprintSha256, occurredAt, null, null, occurredAt, expectedRevision, "attested");
  }

  activate(identity: WriteCredentialAuthorityIdentity, occurredAt: string, expectedRevision: number): WriteCredentialAuthorityState {
    if (!validIdentity(identity) || !canonicalTimestamp(occurredAt) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_INVALID");
    }
    const state = this.read(identity);
    if (state.revision !== expectedRevision || state.status !== "attested" || !state.credentialFingerprintSha256 || !state.attestedAt) {
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_CONFLICT");
    }
    return this.write(identity, "active", state.credentialFingerprintSha256, state.attestedAt, occurredAt, null, occurredAt, expectedRevision, "activated");
  }

  revoke(identity: WriteCredentialAuthorityIdentity, occurredAt: string, expectedRevision: number): WriteCredentialAuthorityState {
    if (!validIdentity(identity) || !canonicalTimestamp(occurredAt) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_INVALID");
    }
    const state = this.read(identity);
    if (state.revision !== expectedRevision || state.status === "unknown") {
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_CONFLICT");
    }
    if (state.status === "revoked") return state;
    return this.write(
      identity,
      "revoked",
      state.credentialFingerprintSha256!,
      state.attestedAt!,
      state.activatedAt,
      occurredAt,
      occurredAt,
      expectedRevision,
      "revoked",
    );
  }

  events(identity: WriteCredentialAuthorityIdentity): readonly WriteCredentialAuthorityEvent[] {
    if (!validIdentity(identity)) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_INVALID");
    try {
      const rows = this.db().prepare(
        "SELECT sequence,user_id,account_id,write_generation,revision,kind,occurred_at FROM write_credential_authority_events WHERE user_id=? AND account_id=? AND write_generation=? ORDER BY sequence",
      ).all(identity.userId, identity.accountId, identity.writeCredentialGeneration) as Record<string, unknown>[];
      const events = rows.map((row) => {
        if (
          !Number.isSafeInteger(row.sequence)
          || !Number.isSafeInteger(row.revision)
          || row.user_id !== identity.userId
          || row.account_id !== identity.accountId
          || row.write_generation !== identity.writeCredentialGeneration
          || !["attested", "activated", "revoked"].includes(String(row.kind))
          || !canonicalTimestamp(row.occurred_at)
        ) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_INVALID");
        return Object.freeze({
          sequence: Number(row.sequence),
          userId: identity.userId,
          accountId: identity.accountId,
          writeCredentialGeneration: identity.writeCredentialGeneration,
          revision: Number(row.revision),
          kind: String(row.kind) as WriteCredentialAuthorityEvent["kind"],
          occurredAt: String(row.occurred_at),
        });
      });
      this.assertBackingFile();
      return Object.freeze(events);
    } catch (error) {
      if (error instanceof ExecutionWriteCredentialAuthorityStoreError) throw error;
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    }
  }

  private write(
    identity: WriteCredentialAuthorityIdentity,
    status: Exclude<WriteCredentialAuthorityStatus, "unknown">,
    credentialFingerprintSha256: string,
    attestedAt: string,
    activatedAt: string | null,
    revokedAt: string | null,
    updatedAt: string,
    expectedRevision: number,
    kind: WriteCredentialAuthorityEvent["kind"],
  ): WriteCredentialAuthorityState {
    const database = this.db();
    try {
      database.exec("BEGIN IMMEDIATE");
      const current = database.prepare(
        "SELECT revision,status FROM write_credential_authority WHERE user_id=? AND account_id=? AND write_generation=?",
      ).get(identity.userId, identity.accountId, identity.writeCredentialGeneration) as { revision: number; status: string } | undefined;

      if (expectedRevision === 0) {
        if (current) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_CONFLICT");
      } else if (!current || current.revision !== expectedRevision) {
        return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_CONFLICT");
      }

      if (status === "active") {
        const otherActive = database.prepare(
          "SELECT write_generation FROM write_credential_authority WHERE user_id=? AND account_id=? AND status='active' AND write_generation<>? LIMIT 1",
        ).get(identity.userId, identity.accountId, identity.writeCredentialGeneration) as { write_generation: string } | undefined;
        if (otherActive) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_CONFLICT");
      }

      const nextRevision = expectedRevision + 1;
      let changes: number;
      if (expectedRevision === 0) {
        changes = Number(database.prepare(`INSERT INTO write_credential_authority(
          schema_version,user_id,account_id,write_generation,revision,status,credential_fingerprint_sha256,
          permission_attestation,egress_attestation,attested_at,activated_at,revoked_at,updated_at
        ) VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          identity.userId,
          identity.accountId,
          identity.writeCredentialGeneration,
          nextRevision,
          status,
          credentialFingerprintSha256,
          MEXC_WRITE_PERMISSION_ATTESTATION,
          MEXC_WRITE_EGRESS_ATTESTATION,
          attestedAt,
          activatedAt,
          revokedAt,
          updatedAt,
        ).changes);
      } else {
        changes = Number(database.prepare(`UPDATE write_credential_authority SET
          revision=?,status=?,credential_fingerprint_sha256=?,permission_attestation=?,egress_attestation=?,
          attested_at=?,activated_at=?,revoked_at=?,updated_at=?
          WHERE user_id=? AND account_id=? AND write_generation=? AND revision=?`).run(
          nextRevision,
          status,
          credentialFingerprintSha256,
          MEXC_WRITE_PERMISSION_ATTESTATION,
          MEXC_WRITE_EGRESS_ATTESTATION,
          attestedAt,
          activatedAt,
          revokedAt,
          updatedAt,
          identity.userId,
          identity.accountId,
          identity.writeCredentialGeneration,
          expectedRevision,
        ).changes);
      }
      if (changes !== 1) return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_CONFLICT");
      database.prepare(
        "INSERT INTO write_credential_authority_events(user_id,account_id,write_generation,revision,kind,occurred_at) VALUES(?,?,?,?,?,?)",
      ).run(identity.userId, identity.accountId, identity.writeCredentialGeneration, nextRevision, kind, updatedAt);
      database.exec("COMMIT");
      this.harden();
      this.assertBackingFile();
      return this.read(identity);
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch { /* no active transaction */ }
      if (error instanceof ExecutionWriteCredentialAuthorityStoreError) throw error;
      return fail("EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    }
  }

  close() {
    try { this.database?.close(); } finally {
      this.database = null;
      this.fileIdentity = null;
    }
  }

  databasePath() {
    return this.path;
  }
}

export const createProductionExecutionWriteCredentialAuthorityStore = () =>
  new SqliteExecutionWriteCredentialAuthorityStore();
