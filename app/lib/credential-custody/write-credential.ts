import "server-only";

import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const MEXC_WRITE_CREDENTIAL_CUSTODY_PURPOSE = "mexc-write-provisioning/v1" as const;

const VERSION = 1;
const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const GENERIC_ERROR = "MEXC_WRITE_CREDENTIAL_CUSTODY_UNAVAILABLE";
const KEY_DERIVATION_LABEL = "DizyTrades/mexc-write-credential-custody/v1";

export type MexcWriteCredentialIdentity = Readonly<{ userId: string; accountId: string; writeCredentialGeneration: string }>;
export type MexcWriteCredentialSecret = Readonly<{ accessKey: string; secretKey: string }>;
export type MexcWriteCredentialEgressEvidence = Readonly<{ revision: number; ipSetDigestSha256: string; allowlistedAt: string }>;
export type MexcWriteCredentialCustodyReceipt = Readonly<{
  userId: string; accountId: string; writeCredentialGeneration: string; revision: number; status: "sealed" | "revoked";
  credentialFingerprintSha256: string; egressProofRevision: number; egressIpSetDigestSha256: string; egressAllowlistedAt: string;
  createdAt: string; updatedAt: string; revokedAt: string | null;
}>;
type Row = {
  user_id: string; account_id: string; write_generation: string; revision: number | bigint; status: string;
  credential_fingerprint_sha256: string; key_version: number | bigint; nonce: Buffer; ciphertext: Buffer; auth_tag: Buffer;
  egress_proof_revision: number | bigint; egress_ip_set_digest_sha256: string; egress_allowlisted_at: string;
  created_at: string; updated_at: string; revoked_at: string | null;
};
type FileIdentity = Readonly<{ dev: number; ino: number }>;

function fail(): never { throw new Error(GENERIC_ERROR); }
const validIdentity = (value: MexcWriteCredentialIdentity) => ID.test(value.userId) && ID.test(value.accountId) && ID.test(value.writeCredentialGeneration);
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
function decode32(value: string) {
  const text = value.trim(); let decoded: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(text)) decoded = Buffer.from(text, "hex");
  else if (/^[A-Za-z0-9+/]{43}=$/.test(text)) decoded = Buffer.from(text, "base64");
  else fail();
  if (decoded.length !== 32) fail(); return decoded;
}
function reservedKeyCandidates(value: string | undefined, includeRawUtf8 = false) {
  if (!value) return []; const candidates: Buffer[] = [];
  const add = (candidate: Buffer) => { if (candidate.length === 32 && !candidates.some((existing) => timingSafeEqual(existing, candidate))) candidates.push(candidate); };
  if (/^[0-9a-fA-F]{64}$/.test(value)) add(Buffer.from(value, "hex"));
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) add(Buffer.from(value, "base64"));
  if (/^[A-Za-z0-9_-]{43}=?$/.test(value)) add(Buffer.from(value, "base64url"));
  if (includeRawUtf8) add(Buffer.from(value, "utf8")); return candidates;
}
function keyring() {
  if (process.env.MEXC_WRITE_CREDENTIAL_CUSTODY_ENABLED !== "true") fail();
  const active = Number(process.env.CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION);
  if (!Number.isSafeInteger(active) || active < 1 || active > 1_000_000) fail();
  let raw: unknown; try { raw = JSON.parse(process.env.CREDENTIAL_CUSTODY_KEYRING || ""); } catch { fail(); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail();
  const entries = Object.entries(raw as Record<string, unknown>); if (!entries.length || entries.length > 16) fail();
  const reserved = [...reservedKeyCandidates(process.env.SESSION_SECRET, true), ...reservedKeyCandidates(process.env.MFA_ENCRYPTION_KEY)];
  const keys = new Map<number, Buffer>();
  for (const [versionText, encoded] of entries) {
    const version = Number(versionText);
    if (!Number.isSafeInteger(version) || version < 1 || version > 1_000_000 || typeof encoded !== "string") fail();
    const key = decode32(encoded); if (reserved.some((other) => timingSafeEqual(key, other))) fail(); keys.set(version, key);
  }
  if (!keys.has(active)) fail(); return { active, keys };
}
function derivedKey(master: Buffer) { return createHmac("sha256", master).update(KEY_DERIVATION_LABEL).digest(); }
export function mexcWriteCredentialFingerprintSha256(secret: MexcWriteCredentialSecret) {
  if (!secret.accessKey || !secret.secretKey || secret.accessKey.length > 512 || secret.secretKey.length > 512) fail();
  const hash = createHash("sha256").update("DizyTrades/mexc-write-credential-fingerprint/v1\0");
  for (const value of [secret.accessKey, secret.secretKey]) {
    const bytes = Buffer.from(value, "utf8"), length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
    try { hash.update(length); hash.update(bytes); } finally { bytes.fill(0); length.fill(0); }
  }
  return hash.digest("hex");
}
function aad(identity: MexcWriteCredentialIdentity, fingerprint: string, keyVersion: number) {
  return Buffer.from(JSON.stringify({ purpose: MEXC_WRITE_CREDENTIAL_CUSTODY_PURPOSE, version: VERSION, keyVersion,
    userId: identity.userId, accountId: identity.accountId, writeCredentialGeneration: identity.writeCredentialGeneration,
    credentialFingerprintSha256: fingerprint }), "utf8");
}
function encrypt(secret: MexcWriteCredentialSecret, identity: MexcWriteCredentialIdentity, fingerprint: string, keyVersion: number, master: Buffer) {
  const key = derivedKey(master), nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(identity, fingerprint, keyVersion));
  const plaintext = Buffer.from(JSON.stringify({ accessKey: secret.accessKey, secretKey: secret.secretKey }), "utf8");
  try { const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]); return { nonce, ciphertext, authTag: cipher.getAuthTag() }; }
  finally { plaintext.fill(0); key.fill(0); }
}
function receipt(row: Row): MexcWriteCredentialCustodyReceipt {
  const revision = Number(row.revision), egressRevision = Number(row.egress_proof_revision);
  if (!Number.isSafeInteger(revision) || revision < 1 || !Number.isSafeInteger(egressRevision) || egressRevision < 1 ||
      !["sealed", "revoked"].includes(row.status) || !SHA256.test(row.credential_fingerprint_sha256) || !SHA256.test(row.egress_ip_set_digest_sha256) ||
      !timestamp(row.egress_allowlisted_at) || !timestamp(row.created_at) || !timestamp(row.updated_at) || (row.revoked_at !== null && !timestamp(row.revoked_at))) fail();
  return Object.freeze({ userId: row.user_id, accountId: row.account_id, writeCredentialGeneration: row.write_generation,
    revision, status: row.status as "sealed" | "revoked", credentialFingerprintSha256: row.credential_fingerprint_sha256,
    egressProofRevision: egressRevision, egressIpSetDigestSha256: row.egress_ip_set_digest_sha256, egressAllowlistedAt: row.egress_allowlisted_at,
    createdAt: row.created_at, updatedAt: row.updated_at, revokedAt: row.revoked_at });
}

export class SqliteMexcWriteCredentialCustody {
  private database: DatabaseSync | null = null; private fileIdentity: FileIdentity | null = null; private poisoned = false;
  constructor(private readonly path = join(process.env.DATA_DIR || join(process.cwd(), ".data"), "mexc-write-credential-custody.sqlite")) {}
  private harden() { if (this.path === ":memory:") return; for (const p of [this.path, `${this.path}-wal`, `${this.path}-shm`]) if (existsSync(p)) chmodSync(p, 0o600); }
  private currentFileIdentity() { try { const s = statSync(this.path); return { dev: s.dev, ino: s.ino }; } catch { return fail(); } }
  private assertBacking() { if (this.poisoned) return fail(); if (this.path === ":memory:") return; const current = this.currentFileIdentity();
    if (!this.fileIdentity || current.dev !== this.fileIdentity.dev || current.ino !== this.fileIdentity.ino) { this.poisoned = true; this.close(); return fail(); } }
  private db() {
    if (this.poisoned) return fail(); if (this.database) { this.assertBacking(); return this.database; }
    keyring(); let db: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      db = new DatabaseSync(this.path); db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;");
      const userVersion = Number((db.prepare("PRAGMA user_version").get() as { user_version: number | bigint }).user_version);
      if (userVersion !== 0 && userVersion !== VERSION) fail();
      if (userVersion === 0) db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE mexc_write_credential_custody(schema_version INTEGER NOT NULL CHECK(schema_version=1),user_id TEXT NOT NULL,account_id TEXT NOT NULL,write_generation TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK(revision>=1),status TEXT NOT NULL CHECK(status IN ('sealed','revoked')),credential_fingerprint_sha256 TEXT NOT NULL CHECK(length(credential_fingerprint_sha256)=64),
          key_version INTEGER NOT NULL,nonce BLOB NOT NULL CHECK(length(nonce)=12),ciphertext BLOB NOT NULL,auth_tag BLOB NOT NULL CHECK(length(auth_tag)=16),egress_proof_revision INTEGER NOT NULL CHECK(egress_proof_revision>=1),
          egress_ip_set_digest_sha256 TEXT NOT NULL CHECK(length(egress_ip_set_digest_sha256)=64),egress_allowlisted_at TEXT NOT NULL CHECK(length(egress_allowlisted_at)<=64),created_at TEXT NOT NULL CHECK(length(created_at)<=64),
          updated_at TEXT NOT NULL CHECK(length(updated_at)<=64),revoked_at TEXT CHECK(revoked_at IS NULL OR length(revoked_at)<=64),PRIMARY KEY(user_id,account_id,write_generation));
        CREATE TABLE mexc_write_credential_custody_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,account_id TEXT NOT NULL,write_generation TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK(revision>=1),kind TEXT NOT NULL CHECK(kind IN ('sealed','revoked','discarded')),occurred_at TEXT NOT NULL CHECK(length(occurred_at)<=64));
        PRAGMA user_version=1; COMMIT;`);
      this.database = db; this.harden(); if (this.path !== ":memory:") this.fileIdentity = this.currentFileIdentity(); return db;
    } catch { try { db?.close(); } catch {} this.database = null; this.fileIdentity = null; return fail(); }
  }
  private row(identity: MexcWriteCredentialIdentity) { return this.db().prepare("SELECT * FROM mexc_write_credential_custody WHERE user_id=? AND account_id=? AND write_generation=?").get(identity.userId, identity.accountId, identity.writeCredentialGeneration) as Row | undefined; }
  private hasHistory(identity: MexcWriteCredentialIdentity) { return Boolean(this.db().prepare("SELECT 1 FROM mexc_write_credential_custody_events WHERE user_id=? AND account_id=? AND write_generation=? LIMIT 1").get(identity.userId, identity.accountId, identity.writeCredentialGeneration)); }
  read(identity: MexcWriteCredentialIdentity): MexcWriteCredentialCustodyReceipt | null { if (!validIdentity(identity)) return fail(); const row = this.row(identity); this.assertBacking(); return row ? receipt(row) : null; }
  seal(identity: MexcWriteCredentialIdentity, secret: MexcWriteCredentialSecret, evidence: MexcWriteCredentialEgressEvidence, at: string, expectedRevision = 0) {
    if (!validIdentity(identity) || expectedRevision !== 0 || !Number.isSafeInteger(evidence.revision) || evidence.revision < 1 || !SHA256.test(evidence.ipSetDigestSha256) || !timestamp(evidence.allowlistedAt) || !timestamp(at) || Date.parse(at) < Date.parse(evidence.allowlistedAt)) return fail();
    const ring = keyring(), fingerprint = mexcWriteCredentialFingerprintSha256(secret), envelope = encrypt(secret, identity, fingerprint, ring.active, ring.keys.get(ring.active)!); const db = this.db();
    try { db.exec("BEGIN IMMEDIATE"); if (this.row(identity) || this.hasHistory(identity)) return fail();
      const changes = Number(db.prepare(`INSERT INTO mexc_write_credential_custody VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(identity.userId,identity.accountId,identity.writeCredentialGeneration,1,"sealed",fingerprint,ring.active,envelope.nonce,envelope.ciphertext,envelope.authTag,evidence.revision,evidence.ipSetDigestSha256,evidence.allowlistedAt,at,at,null).changes);
      if (changes !== 1) return fail(); db.prepare("INSERT INTO mexc_write_credential_custody_events(user_id,account_id,write_generation,revision,kind,occurred_at) VALUES(?,?,?,?,?,?)").run(identity.userId,identity.accountId,identity.writeCredentialGeneration,1,"sealed",at);
      db.exec("COMMIT"); this.harden(); this.assertBacking(); return receipt(this.row(identity)!);
    } catch { try { db.exec("ROLLBACK"); } catch {} return fail(); }
  }
  discardFailedAttestation(identity: MexcWriteCredentialIdentity, at: string, expectedRevision = 1) {
    if (!validIdentity(identity) || !timestamp(at) || expectedRevision !== 1) return fail(); const db = this.db();
    try { db.exec("BEGIN IMMEDIATE"); const row = this.row(identity); if (!row) return fail(); const current = receipt(row);
      if (current.status !== "sealed" || current.revision !== 1 || Date.parse(at) < Date.parse(current.updatedAt)) return fail();
      const changes = Number(db.prepare("DELETE FROM mexc_write_credential_custody WHERE user_id=? AND account_id=? AND write_generation=? AND revision=1 AND status='sealed'").run(identity.userId,identity.accountId,identity.writeCredentialGeneration).changes);
      if (changes !== 1) return fail(); db.prepare("INSERT INTO mexc_write_credential_custody_events(user_id,account_id,write_generation,revision,kind,occurred_at) VALUES(?,?,?,?,?,?)").run(identity.userId,identity.accountId,identity.writeCredentialGeneration,2,"discarded",at);
      db.exec("COMMIT"); this.harden(); this.assertBacking(); return true;
    } catch { try { db.exec("ROLLBACK"); } catch {} return fail(); }
  }
  revoke(identity: MexcWriteCredentialIdentity, at: string, expectedRevision: number) {
    if (!validIdentity(identity) || !timestamp(at) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return fail(); const db = this.db();
    try { db.exec("BEGIN IMMEDIATE"); const row = this.row(identity); if (!row) return fail(); const current = receipt(row);
      if (current.status === "revoked") { if (current.revision !== expectedRevision) return fail(); db.exec("COMMIT"); return current; }
      if (current.revision !== expectedRevision || Date.parse(at) < Date.parse(current.updatedAt)) return fail(); const nextRevision = expectedRevision + 1;
      const changes = Number(db.prepare("UPDATE mexc_write_credential_custody SET revision=?,status='revoked',updated_at=?,revoked_at=? WHERE user_id=? AND account_id=? AND write_generation=? AND revision=? AND status='sealed'").run(nextRevision,at,at,identity.userId,identity.accountId,identity.writeCredentialGeneration,expectedRevision).changes);
      if (changes !== 1) return fail(); db.prepare("INSERT INTO mexc_write_credential_custody_events(user_id,account_id,write_generation,revision,kind,occurred_at) VALUES(?,?,?,?,?,?)").run(identity.userId,identity.accountId,identity.writeCredentialGeneration,nextRevision,"revoked",at);
      db.exec("COMMIT"); this.harden(); this.assertBacking(); return receipt(this.row(identity)!);
    } catch { try { db.exec("ROLLBACK"); } catch {} return fail(); }
  }
  events(identity: MexcWriteCredentialIdentity) { if (!validIdentity(identity)) return fail(); return Object.freeze((this.db().prepare("SELECT revision,kind,occurred_at FROM mexc_write_credential_custody_events WHERE user_id=? AND account_id=? AND write_generation=? ORDER BY sequence").all(identity.userId,identity.accountId,identity.writeCredentialGeneration) as {revision:number|bigint;kind:string;occurred_at:string}[]).map((row)=>Object.freeze({revision:Number(row.revision),kind:row.kind,occurredAt:row.occurred_at}))); }
  close() { try { this.database?.close(); } finally { this.database = null; this.fileIdentity = null; } }
}

export function mexcWriteCredentialCustodyDatabasePathForTests() { return join(process.env.DATA_DIR || join(process.cwd(), ".data"), "mexc-write-credential-custody.sqlite"); }
