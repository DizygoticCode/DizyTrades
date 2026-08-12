import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const CUSTODY_EXCHANGE = "mexc" as const;
export const CUSTODY_PURPOSE = "future-execution" as const;
const ENVELOPE_VERSION = 1;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const GENERIC_ERROR = "CREDENTIAL_CUSTODY_UNAVAILABLE";

type Binding = Readonly<{ userId: string; accountRef: string; recordId: string }>;
type Credentials = Readonly<{ apiKey: string; apiSecret: string }>;
type RecordRow = {
  record_id: string; user_id: string; account_ref: string; exchange: string; purpose: string;
  envelope_version: number; key_version: number; nonce: Buffer; ciphertext: Buffer; auth_tag: Buffer;
  created_at: number; updated_at: number;
};

export type CustodyMetadata = Readonly<{
  recordId: string; userId: string; accountRef: string; exchange: typeof CUSTODY_EXCHANGE;
  purpose: typeof CUSTODY_PURPOSE; envelopeVersion: number; keyVersion: number;
  createdAt: number; updatedAt: number;
}>;

function fail(): never { throw new Error(GENERIC_ERROR); }
function validToken(value: string) { if (!TOKEN.test(value)) fail(); return value; }
function validateBinding(value: Binding) {
  return { userId: validToken(value.userId), accountRef: validToken(value.accountRef), recordId: validToken(value.recordId) };
}
function aad(binding: Binding, keyVersion: number) {
  return Buffer.from(JSON.stringify({
    accountRef: binding.accountRef, envelopeVersion: ENVELOPE_VERSION, exchange: CUSTODY_EXCHANGE,
    keyVersion, purpose: CUSTODY_PURPOSE, recordId: binding.recordId, userId: binding.userId,
  }), "utf8");
}
function decode32(value: string) {
  const text = value.trim();
  let decoded: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(text)) decoded = Buffer.from(text, "hex");
  else if (/^[A-Za-z0-9+/]{43}=$/.test(text)) decoded = Buffer.from(text, "base64");
  else fail();
  if (decoded.length !== 32) fail();
  return decoded;
}
function reservedKeyCandidates(value: string | undefined, includeRawUtf8 = false) {
  if (!value) return [];
  const candidates: Buffer[] = [];
  const add = (candidate: Buffer) => {
    if (candidate.length === 32 && !candidates.some((existing) => timingSafeEqual(existing, candidate))) candidates.push(candidate);
  };
  if (/^[0-9a-fA-F]{64}$/.test(value)) add(Buffer.from(value, "hex"));
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) add(Buffer.from(value, "base64"));
  if (/^[A-Za-z0-9_-]{43}=?$/.test(value)) add(Buffer.from(value, "base64url"));
  if (includeRawUtf8) add(Buffer.from(value, "utf8"));
  return candidates;
}
function keyring() {
  if (process.env.CREDENTIAL_CUSTODY_ENABLED !== "true") fail();
  const active = Number(process.env.CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION);
  if (!Number.isSafeInteger(active) || active < 1 || active > 1_000_000) fail();
  let raw: unknown;
  try { raw = JSON.parse(process.env.CREDENTIAL_CUSTODY_KEYRING || ""); } catch { fail(); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail();
  const entries = Object.entries(raw as Record<string, unknown>);
  if (!entries.length || entries.length > 16) fail();
  const keys = new Map<number, Buffer>();
  const reserved = [
    ...reservedKeyCandidates(process.env.SESSION_SECRET, true),
    ...reservedKeyCandidates(process.env.MFA_ENCRYPTION_KEY),
  ];
  for (const [versionText, encoded] of entries) {
    const version = Number(versionText);
    if (!Number.isSafeInteger(version) || version < 1 || version > 1_000_000 || typeof encoded !== "string") fail();
    const key = decode32(encoded);
    if (reserved.some((other) => timingSafeEqual(key, other))) fail();
    keys.set(version, key);
  }
  if (!keys.has(active)) fail();
  return { active, keys };
}

function dbPath() { return join(process.env.DATA_DIR || join(process.cwd(), ".data"), "credential-custody.sqlite"); }
function openDatabase() {
  // Configuration is checked before the filesystem is touched, allowing a safe disabled boot.
  keyring();
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS custody_records (
      record_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_ref TEXT NOT NULL,
      exchange TEXT NOT NULL CHECK(exchange='mexc'), purpose TEXT NOT NULL CHECK(purpose='future-execution'),
      envelope_version INTEGER NOT NULL CHECK(envelope_version=1), key_version INTEGER NOT NULL,
      nonce BLOB NOT NULL CHECK(length(nonce)=12), ciphertext BLOB NOT NULL, auth_tag BLOB NOT NULL CHECK(length(auth_tag)=16),
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS custody_owner_idx ON custody_records(user_id, account_ref);
    CREATE TABLE IF NOT EXISTS custody_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL CHECK(event_type IN ('create','open','rotate','revoke')),
      record_id TEXT NOT NULL, user_id TEXT NOT NULL, account_ref TEXT NOT NULL, key_version INTEGER NOT NULL, created_at INTEGER NOT NULL
    );`);
  chmodSync(path, 0o600);
  return db;
}
function encrypt(credentials: Credentials, binding: Binding, keyVersion: number, key: Buffer) {
  if (!credentials.apiKey || !credentials.apiSecret || credentials.apiKey.length > 512 || credentials.apiSecret.length > 512) fail();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(binding, keyVersion));
  const plaintext = Buffer.from(JSON.stringify({ apiKey: credentials.apiKey, apiSecret: credentials.apiSecret }), "utf8");
  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { nonce, ciphertext, authTag: cipher.getAuthTag() };
  } finally { plaintext.fill(0); }
}
function decrypt(row: RecordRow, binding: Binding, key: Buffer) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, row.nonce);
    decipher.setAAD(aad(binding, row.key_version));
    decipher.setAuthTag(row.auth_tag);
    const plaintext = Buffer.concat([decipher.update(row.ciphertext), decipher.final()]);
    try {
      const parsed = JSON.parse(plaintext.toString("utf8"));
      if (!parsed || typeof parsed.apiKey !== "string" || typeof parsed.apiSecret !== "string") fail();
      return Object.freeze({ apiKey: parsed.apiKey, apiSecret: parsed.apiSecret }) as Credentials;
    } finally { plaintext.fill(0); }
  } catch { fail(); }
}
function select(db: DatabaseSync, binding: Binding) {
  const row = db.prepare("SELECT * FROM custody_records WHERE record_id=? AND user_id=? AND account_ref=? AND exchange=? AND purpose=?")
    .get(binding.recordId, binding.userId, binding.accountRef, CUSTODY_EXCHANGE, CUSTODY_PURPOSE) as RecordRow | undefined;
  if (!row || row.envelope_version !== ENVELOPE_VERSION) fail();
  return row;
}
function metadata(row: RecordRow): CustodyMetadata {
  return Object.freeze({ recordId: row.record_id, userId: row.user_id, accountRef: row.account_ref,
    exchange: CUSTODY_EXCHANGE, purpose: CUSTODY_PURPOSE, envelopeVersion: row.envelope_version,
    keyVersion: row.key_version, createdAt: row.created_at, updatedAt: row.updated_at });
}
function audit(db: DatabaseSync, event: string, binding: Binding, version: number, now: number) {
  db.prepare("INSERT INTO custody_audit(event_type,record_id,user_id,account_ref,key_version,created_at) VALUES(?,?,?,?,?,?)")
    .run(event, binding.recordId, binding.userId, binding.accountRef, version, now);
}

export function storeCredentials(input: Readonly<{ userId: string; accountRef: string; credentials: Credentials; recordId?: string }>) {
  const binding = validateBinding({ userId: input.userId, accountRef: input.accountRef, recordId: input.recordId || randomUUID() });
  const ring = keyring(); const envelope = encrypt(input.credentials, binding, ring.active, ring.keys.get(ring.active)!); const now = Date.now();
  const db = openDatabase();
  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO custody_records VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(binding.recordId, binding.userId, binding.accountRef,
      CUSTODY_EXCHANGE, CUSTODY_PURPOSE, ENVELOPE_VERSION, ring.active, envelope.nonce, envelope.ciphertext, envelope.authTag, now, now);
    audit(db, "create", binding, ring.active, now); db.exec("COMMIT");
    return metadata(select(db, binding));
  } catch { try { db.exec("ROLLBACK"); } catch { /* no active transaction */ } fail(); } finally { db.close(); }
}

export function inspectCredential(bindingInput: Binding) {
  const binding = validateBinding(bindingInput); const db = openDatabase();
  try { return metadata(select(db, binding)); } finally { db.close(); }
}

export function withCredentials(bindingInput: Binding, consume: (credentials: Credentials) => void) {
  const binding = validateBinding(bindingInput); const ring = keyring(); const db = openDatabase();
  try {
    const row = select(db, binding); const key = ring.keys.get(row.key_version); if (!key) fail();
    const credentials = decrypt(row, binding, key);
    audit(db, "open", binding, row.key_version, Date.now());
    consume(credentials);
  } finally { db.close(); }
}

export function rotateCredentials(bindingInput: Binding) {
  const binding = validateBinding(bindingInput); const ring = keyring(); const db = openDatabase();
  try {
    db.exec("BEGIN IMMEDIATE"); const row = select(db, binding); const oldKey = ring.keys.get(row.key_version); if (!oldKey) fail();
    const credentials = decrypt(row, binding, oldKey); const envelope = encrypt(credentials, binding, ring.active, ring.keys.get(ring.active)!); const now = Date.now();
    db.prepare("UPDATE custody_records SET key_version=?,nonce=?,ciphertext=?,auth_tag=?,updated_at=? WHERE record_id=? AND user_id=? AND account_ref=?")
      .run(ring.active, envelope.nonce, envelope.ciphertext, envelope.authTag, now, binding.recordId, binding.userId, binding.accountRef);
    audit(db, "rotate", binding, ring.active, now); db.exec("COMMIT"); return metadata(select(db, binding));
  } catch { try { db.exec("ROLLBACK"); } catch { /* no active transaction */ } fail(); } finally { db.close(); }
}

export function revokeCredentials(bindingInput: Binding) {
  const binding = validateBinding(bindingInput); const db = openDatabase();
  try {
    db.exec("BEGIN IMMEDIATE"); const row = select(db, binding);
    db.prepare("DELETE FROM custody_records WHERE record_id=? AND user_id=? AND account_ref=?").run(binding.recordId, binding.userId, binding.accountRef);
    audit(db, "revoke", binding, row.key_version, Date.now()); db.exec("COMMIT");
  } catch { try { db.exec("ROLLBACK"); } catch { /* no active transaction */ } fail(); } finally { db.close(); }
}

export function custodyDatabasePathForTests() { return dbPath(); }
