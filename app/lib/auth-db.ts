import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword, normaliseIdentifier, verifyPassword, type AuthUser, type UserRole } from "./auth-credentials";
import { isOpaqueSessionToken, safeOwnerId } from "./security-boundaries";

let database: DatabaseSync | null = null;
let unavailable = false;
const authPath = () => join(process.env.DATA_DIR || join(process.cwd(), ".data"), "auth.sqlite");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const ACCOUNT_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;
export const PASSWORD_RESET_TTL_MS = 60 * 60_000;
export const ACCOUNT_AVATAR_MAX_BYTES = 512 * 1024;
export const MFA_CHALLENGE_TTL_MS = 5 * 60_000;
export const MFA_EMAIL_RECOVERY_TTL_MS = 15 * 60_000;

type AttemptBucket = { count: number; resetAt: number };
const fallbackAttempts = new Map<string, AttemptBucket>();

function migrate(db: DatabaseSync) {
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT, username_normalized TEXT UNIQUE, email TEXT, email_normalized TEXT UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','admin','user')), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS auth_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
    COMMIT;`);

  const versionTwo = db.prepare("SELECT 1 FROM schema_migrations WHERE version=2").get();
  if (!versionTwo) {
   db.exec("BEGIN IMMEDIATE");
   try {
    db.exec(`
      ALTER TABLE users ADD COLUMN email_verified_at TEXT;
      CREATE TABLE email_verification_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX email_verification_tokens_user_idx ON email_verification_tokens(user_id);
      CREATE TABLE password_reset_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens(user_id);
      CREATE TABLE account_profiles (
        user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        avatar_mime TEXT,
        avatar_data BLOB,
        avatar_updated_at INTEGER,
        updated_at TEXT NOT NULL
      );
      UPDATE users
        SET email_verified_at=created_at
        WHERE email IS NOT NULL AND trim(email)<>'' AND email_verified_at IS NULL;
      INSERT INTO schema_migrations(version, applied_at) VALUES (2, datetime('now'));
    `);
    db.exec("COMMIT");
   } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
    throw error;
   }
  }
  const versionThree = db.prepare("SELECT 1 FROM schema_migrations WHERE version=3").get();
  if (!versionThree) {
   db.exec("BEGIN IMMEDIATE");
   try {
    db.exec(`
      ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
      ALTER TABLE sessions ADD COLUMN revoked_at INTEGER;
      UPDATE sessions SET last_seen_at=created_at WHERE last_seen_at IS NULL;
      CREATE TABLE mfa_credentials (
        user_id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('pending','active')),
        secret_ciphertext BLOB NOT NULL, nonce BLOB NOT NULL, auth_tag BLOB NOT NULL,
        key_version INTEGER NOT NULL, created_at INTEGER NOT NULL, activated_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE mfa_recovery_codes (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL, consumed_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX mfa_recovery_user_idx ON mfa_recovery_codes(user_id);
      CREATE TABLE mfa_challenges (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, consumed_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX mfa_challenge_user_idx ON mfa_challenges(user_id);
      INSERT INTO schema_migrations(version, applied_at) VALUES (3, datetime('now'));
    `);
    db.exec("COMMIT");
   } catch (error) {
     try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
     throw error;
   }
  }
  const versionFour = db.prepare("SELECT 1 FROM schema_migrations WHERE version=4").get();
  if (!versionFour) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE privileged_account_migrations (
        migration_key TEXT PRIMARY KEY, completed_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations(version, applied_at) VALUES (4, datetime('now'));
      COMMIT;`);
  }
  const versionFive = db.prepare("SELECT 1 FROM schema_migrations WHERE version=5").get();
  if (!versionFive) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE privileged_identity_aliases (
        alias_normalized TEXT PRIMARY KEY,
        user_id TEXT NOT NULL CHECK(user_id IN ('rob','friend')),
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX privileged_identity_aliases_user_idx ON privileged_identity_aliases(user_id);
      INSERT INTO schema_migrations(version, applied_at) VALUES (5, datetime('now'));
      COMMIT;`);
  }
  const versionSix = db.prepare("SELECT 1 FROM schema_migrations WHERE version=6").get();
  if (!versionSix) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE mfa_email_recovery_tokens (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX mfa_email_recovery_user_idx ON mfa_email_recovery_tokens(user_id);
      INSERT INTO schema_migrations(version, applied_at) VALUES (6, datetime('now'));
      COMMIT;`);
  }
  const versionSeven = db.prepare("SELECT 1 FROM schema_migrations WHERE version=7").get();
  if (!versionSeven) {
    db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE sessions ADD COLUMN assurance TEXT NOT NULL DEFAULT 'password'
        CHECK(assurance IN ('password','totp','recovery'));
      INSERT INTO schema_migrations(version, applied_at) VALUES (7, datetime('now'));
      COMMIT;`);
  }
}

export function getAuthDatabase() {
  if (unavailable) return null;
  if (database) return database;
  try {
    if (process.env.NODE_ENV === "production") assertMfaConfiguration();
    mkdirSync(dirname(authPath()), { recursive: true, mode: 0o700 });
    database = new DatabaseSync(authPath());
    migrate(database);
    chmodSync(authPath(), 0o600);
    return database;
  } catch {
    unavailable = true;
    database = null;
    return null;
  }
}

export function closeAuthDatabaseForTests() {
  database?.close();
  database = null;
  unavailable = false;
  fallbackAttempts.clear();
}

type UserRow = {
  id: string;
  username: string | null;
  email: string | null;
  password_hash: string;
  display_name: string;
  role: UserRole;
  email_verified_at: string | null;
};

type ProfileRow = {
  display_name: string;
  bio: string;
  avatar_mime: string | null;
  avatar_updated_at: number | null;
};

const publicUser = (row: UserRow): AuthUser => ({
  id: safeOwnerId(row.id, "account"),
  name: row.display_name,
  email: row.email || "",
  role: row.role,
});

function validateEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INVALID_ACCOUNT");
  return email;
}

function validateNewAccount(input: { username?: string; email: string; password: string }) {
  const username = input.username?.trim() || null;
  const email = validateEmail(input.email);
  if (username && (!/^[A-Za-z0-9_.-]{3,32}$/.test(username) || username.includes("@"))) throw new Error("INVALID_ACCOUNT");
  if (input.password.length < 12 || input.password.length > 128) throw new Error("INVALID_ACCOUNT");
  return { username, email };
}

export async function createAccount(input: { username?: string; email: string; password: string }) {
  const db = getAuthDatabase();
  if (!db) throw new Error("AUTH_UNAVAILABLE");
  const { username, email } = validateNewAccount(input);
  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  const displayName = (username || email.split("@")[0]).slice(0, 64);
  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO users(id,username,username_normalized,email,email_normalized,password_hash,display_name,role,created_at,email_verified_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)")
      .run(id, username, username && normaliseIdentifier(username), email, email, passwordHash, displayName, "user", new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
    if (String(error).includes("UNIQUE")) throw new Error("DUPLICATE");
    throw error;
  }
  return { id, name: displayName, email, role: "user" } satisfies AuthUser;
}

const PRIVILEGED_MIGRATION_KEY = "legacy-privileged-accounts-v1";
type PrivilegedSpec = Readonly<{ id: "rob" | "friend"; email: string; name: string; role: "owner" | "admin"; password: string }>;

/** Completed migration makes stable privileged identities database-authoritative. */
export function privilegedAccountMigrationCompleted() {
  const db = getAuthDatabase();
  if (!db) return false;
  return Boolean(db.prepare("SELECT 1 FROM privileged_account_migrations WHERE migration_key=?").get(PRIVILEGED_MIGRATION_KEY));
}

function privilegedSpecs(): PrivilegedSpec[] | null {
  const values = [
    { id: "rob", email: process.env.ROB_EMAIL || "", name: process.env.ROB_NAME?.trim() || "Rob", role: "owner", password: process.env.ROB_PASSWORD || "" },
    { id: "friend", email: process.env.FRIEND_EMAIL || "", name: process.env.FRIEND_NAME?.trim() || "Nick", role: "admin", password: process.env.FRIEND_PASSWORD || "" },
  ] as const;
  if (values.every(value => !value.email && !value.password)) return null;
  if (values.some(value => !value.email)) throw new Error("PRIVILEGED_ACCOUNT_MIGRATION_CONFIGURATION_INVALID");
  return values.map(value => ({ ...value, email: validateEmail(value.email) }));
}

/** One-way bootstrap from trusted legacy plaintext inputs into ordinary database credentials. */
export async function migratePrivilegedAccounts() {
  const db = getAuthDatabase();
  if (!db) throw new Error("PRIVILEGED_ACCOUNT_MIGRATION_AUTH_UNAVAILABLE");
  const completed = db.prepare("SELECT completed_at FROM privileged_account_migrations WHERE migration_key=?").get(PRIVILEGED_MIGRATION_KEY);
  if (completed) {
    // Completion makes the stable database identities authoritative. In particular,
    // bootstrap environment values may be removed or become stale after an email
    // change and must never be used to reconcile current account data.
    const identities = db.prepare("SELECT id,email_normalized,role,email_verified_at,password_hash FROM users WHERE id IN ('rob','friend') ORDER BY id").all() as Array<UserRow & { email_normalized: string | null }>;
    if (identities.length !== 2 || identities.some(row => row.role !== (row.id === "rob" ? "owner" : "admin") || !row.email_normalized || !row.email_verified_at || !row.password_hash.startsWith("scrypt$"))) {
      throw new Error("PRIVILEGED_ACCOUNT_MIGRATION_CONFLICT");
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of identities) {
        const alias = db.prepare("SELECT user_id FROM privileged_identity_aliases WHERE alias_normalized=?").get(row.email_normalized) as { user_id: string } | undefined;
        if (alias && alias.user_id !== row.id) throw new Error("PRIVILEGED_ACCOUNT_MIGRATION_CONFLICT");
        if (!alias) db.prepare("INSERT INTO privileged_identity_aliases(alias_normalized,user_id,created_at) VALUES(?,?,?)").run(row.email_normalized, row.id, new Date().toISOString());
      }
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
      throw error;
    }
    return { status: "completed" } as const;
  }
  const specs = privilegedSpecs();
  if (!specs) return { status: "not-configured" } as const;
  const rows = db.prepare("SELECT id,username,username_normalized,email,email_normalized,password_hash,display_name,role,email_verified_at FROM users WHERE id IN ('rob','friend') OR email_normalized IN (?,?) OR username_normalized IN ('rob','friend',?,?)")
    .all(specs[0].email, specs[1].email, specs[0].email, specs[1].email) as Array<UserRow & { username_normalized: string | null; email_normalized: string | null }>;
  for (const spec of specs) {
    const byId = rows.find(row => row.id === spec.id);
    const collisions = rows.filter(row => row.id !== spec.id && (row.email_normalized === spec.email || row.username_normalized === spec.id || row.username_normalized === spec.email));
    if (collisions.length || (byId && (byId.email_normalized !== spec.email || byId.role !== spec.role))) {
      throw new Error("PRIVILEGED_ACCOUNT_MIGRATION_CONFLICT");
    }
    if (byId && (!byId.email_verified_at || !byId.password_hash.startsWith("scrypt$"))) throw new Error("PRIVILEGED_ACCOUNT_MIGRATION_CONFLICT");
  }
  const missing = specs.filter(spec => !rows.some(row => row.id === spec.id));
  if (missing.some(spec => !spec.password)) throw new Error("PRIVILEGED_ACCOUNT_MIGRATION_PASSWORD_REQUIRED");
  const hashes = new Map<string, string>();
  for (const spec of missing) hashes.set(spec.id, await hashPassword(spec.password));
  db.exec("BEGIN IMMEDIATE");
  try {
    // Recheck all uniqueness relationships under the write lock; never elevate or merge an existing row.
    for (const spec of specs) {
      const conflict = db.prepare("SELECT id,role,email_normalized FROM users WHERE id=? OR email_normalized=? OR username_normalized IN (?,?)").all(spec.id, spec.email, spec.id, spec.email) as Array<{ id: string; role: string; email_normalized: string | null }>;
      if (conflict.some(row => row.id !== spec.id || row.role !== spec.role || row.email_normalized !== spec.email)) throw new Error("PRIVILEGED_ACCOUNT_MIGRATION_CONFLICT");
      if (!conflict.length) db.prepare("INSERT INTO users(id,username,username_normalized,email,email_normalized,password_hash,display_name,role,created_at,email_verified_at) VALUES(?,NULL,NULL,?,?,?,?,?,?,?)")
        .run(spec.id, spec.email, spec.email, hashes.get(spec.id)!, spec.name.slice(0, 64), spec.role, new Date().toISOString(), new Date().toISOString());
      db.prepare("INSERT INTO privileged_identity_aliases(alias_normalized,user_id,created_at) VALUES(?,?,?)").run(spec.email, spec.id, new Date().toISOString());
    }
    db.prepare("INSERT INTO privileged_account_migrations(migration_key,completed_at) VALUES(?,?)").run(PRIVILEGED_MIGRATION_KEY, new Date().toISOString());
    db.exec("COMMIT");
    return { status: "migrated" } as const;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
    throw error;
  }
}

export function databaseHasPrivilegedIdentity(identifier: string) {
  const normalized = normaliseIdentifier(identifier);
  if (!normalized) return false;
  const db = getAuthDatabase();
  if (!db) return false;
  return Boolean(db.prepare(`SELECT 1 FROM users WHERE id IN ('rob','friend') AND (id=? OR email_normalized=? OR username_normalized=?)
    UNION ALL SELECT 1 FROM privileged_identity_aliases WHERE alias_normalized=? LIMIT 1`).get(normalized, normalized, normalized, normalized));
}

export type DatabaseAuthenticationResult =
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "email-unverified"; email: string }>
  | Readonly<{ status: "authenticated"; user: AuthUser; mfaEnabled: boolean }>;

export async function authenticateDatabaseUserDetailed(identifier: string, password: string): Promise<DatabaseAuthenticationResult> {
  const normalized = normaliseIdentifier(identifier);
  if (!normalized || normalized.length > 254 || password.length < 1 || password.length > 128) return { status: "invalid" };
  const db = getAuthDatabase();
  if (!db) return { status: "invalid" };
  const row = db.prepare("SELECT id,username,email,password_hash,display_name,role,email_verified_at FROM users WHERE username_normalized=? OR email_normalized=?").get(normalized, normalized) as UserRow | undefined;
  if (!row || !await verifyPassword(password, row.password_hash)) return { status: "invalid" };
  if (row.email && !row.email_verified_at) return { status: "email-unverified", email: row.email };
  const mfa = db.prepare("SELECT state FROM mfa_credentials WHERE user_id=?").get(row.id) as { state: string } | undefined;
  return { status: "authenticated", user: publicUser(row), mfaEnabled: mfa?.state === "active" };
}

export async function authenticateDatabaseUser(identifier: string, password: string) {
  const result = await authenticateDatabaseUserDetailed(identifier, password);
  return result.status === "authenticated" ? result.user : null;
}

export type DatabaseSessionAssurance = "password" | "totp" | "recovery";

export function createDatabaseSession(user: AuthUser, maxAgeSeconds: number, assurance: DatabaseSessionAssurance = "password") {
  const db = getAuthDatabase();
  if (!db || !["password", "totp", "recovery"].includes(assurance) || !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 60 || maxAgeSeconds > 60 * 60 * 24 * 30) return null;
  const ownerId = safeOwnerId(user.id, "account");
  const account = db.prepare("SELECT email,email_verified_at FROM users WHERE id=?").get(ownerId) as { email: string | null; email_verified_at: string | null } | undefined;
  if (!account) return null;
  if (account.email && !account.email_verified_at) return null;
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM sessions WHERE user_id=? OR expires_at<=?").run(ownerId, now);
    db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at,revoked_at,assurance) VALUES(?,?,?,?,?,NULL,?)").run(digest(token), ownerId, now + maxAgeSeconds * 1000, now, now, assurance);
    db.exec("COMMIT");
    return token;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type ExecutionGradeSession = Readonly<{ userId: string; sessionFingerprint: string; expiresAt: number }>;

/** Execution authentication accepts only an opaque, live TOTP-established DB session. */
export function executionGradeDatabaseSession(token: string, now = Date.now()): ExecutionGradeSession | null {
  if (!isOpaqueSessionToken(token) || !Number.isSafeInteger(now) || now < 0) return null;
  const db = getAuthDatabase();
  if (!db) return null;
  try {
    const tokenHash = digest(token);
    const row = db.prepare(`SELECT s.user_id,s.expires_at,s.assurance,u.email,u.email_verified_at,m.state AS mfa_state
      FROM sessions s JOIN users u ON u.id=s.user_id
      LEFT JOIN mfa_credentials m ON m.user_id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL`).get(tokenHash, now) as
      { user_id: string; expires_at: number; assurance: string; email: string | null; email_verified_at: string | null; mfa_state: string | null } | undefined;
    if (!row || row.assurance !== "totp" || !row.email || !row.email_verified_at || row.mfa_state !== "active"
      || !Number.isSafeInteger(row.expires_at) || row.expires_at <= now) return null;
    return Object.freeze({ userId: safeOwnerId(row.user_id, "account"), sessionFingerprint: tokenHash, expiresAt: row.expires_at });
  } catch {
    return null;
  }
}

/** Revalidation seam for a digest already held by a server-only assertion store. */
export function executionGradeDatabaseSessionFingerprint(sessionFingerprint: string, now = Date.now()): ExecutionGradeSession | null {
  if (!/^[a-f0-9]{64}$/.test(sessionFingerprint) || !Number.isSafeInteger(now) || now < 0) return null;
  const db = getAuthDatabase();
  if (!db) return null;
  try {
    const row = db.prepare(`SELECT s.user_id,s.expires_at,s.assurance,u.email,u.email_verified_at,m.state AS mfa_state
      FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN mfa_credentials m ON m.user_id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL`).get(sessionFingerprint, now) as
      { user_id: string; expires_at: number; assurance: string; email: string | null; email_verified_at: string | null; mfa_state: string | null } | undefined;
    if (!row || row.assurance !== "totp" || !row.email || !row.email_verified_at || row.mfa_state !== "active") return null;
    return Object.freeze({ userId: safeOwnerId(row.user_id, "account"), sessionFingerprint, expiresAt: row.expires_at });
  } catch { return null; }
}

export function databaseSession(token: string) {
  if (!isOpaqueSessionToken(token)) return null;
  const db = getAuthDatabase();
  if (!db) return null;
  const now = Date.now();
  const row = db.prepare("SELECT u.id,u.username,u.email,u.password_hash,u.display_name,u.role,u.email_verified_at,s.last_seen_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL").get(digest(token), now) as (UserRow & { last_seen_at: number }) | undefined;
  if (!row || (row.email && !row.email_verified_at)) return null;
  if (now - row.last_seen_at >= 15 * 60_000) db.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=? AND revoked_at IS NULL").run(now, digest(token));
  return publicUser(row);
}

export function revokeDatabaseSession(token: string) {
  if (!isOpaqueSessionToken(token)) return;
  getAuthDatabase()?.prepare("UPDATE sessions SET revoked_at=? WHERE token_hash=?").run(Date.now(), digest(token));
}

function mfaKey() {
  const encoded = process.env.MFA_ENCRYPTION_KEY || "";
  let key: Buffer;
  try { key = Buffer.from(encoded, "base64url"); } catch { key = Buffer.alloc(0); }
  if (key.length === 32 && encoded.length >= 43) return key;
  if (process.env.NODE_ENV !== "production" && !encoded) return createHash("sha256").update("local-only-mfa-key-not-for-deployment").digest();
  throw new Error("MFA_ENCRYPTION_KEY must be a base64url-encoded 32-byte key distinct from SESSION_SECRET");
}

export function assertMfaConfiguration() {
  const key = mfaKey();
  const sessionSecret = process.env.SESSION_SECRET || "";
  let decodedSession = Buffer.alloc(0);
  try { decodedSession = Buffer.from(sessionSecret, "base64url"); } catch { /* not base64url */ }
  const exactReuse = Boolean(sessionSecret) && sessionSecret === (process.env.MFA_ENCRYPTION_KEY || "");
  const decodedReuse = decodedSession.length === key.length && timingSafeEqual(decodedSession, key);
  if (exactReuse || decodedReuse) {
    throw new Error("MFA_ENCRYPTION_KEY must not reuse SESSION_SECRET");
  }
}

function encryptMfaSecret(secret: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", mfaKey(), nonce);
  cipher.setAAD(Buffer.from("dizytrades:mfa:v1"));
  return { ciphertext: Buffer.concat([cipher.update(secret), cipher.final()]), nonce, tag: cipher.getAuthTag() };
}

function decryptMfaSecret(row: { secret_ciphertext: Uint8Array; nonce: Uint8Array; auth_tag: Uint8Array; key_version: number }) {
  if (row.key_version !== 1) throw new Error("Unsupported MFA key version");
  const decipher = createDecipheriv("aes-256-gcm", mfaKey(), Buffer.from(row.nonce));
  decipher.setAAD(Buffer.from("dizytrades:mfa:v1"));
  decipher.setAuthTag(Buffer.from(row.auth_tag));
  return Buffer.concat([decipher.update(Buffer.from(row.secret_ciphertext)), decipher.final()]);
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(value: Buffer) {
  let bits = 0, accumulator = 0, result = "";
  for (const byte of value) { accumulator = (accumulator << 8) | byte; bits += 8; while (bits >= 5) { result += BASE32[(accumulator >>> (bits -= 5)) & 31]; } }
  if (bits) result += BASE32[(accumulator << (5 - bits)) & 31];
  return result;
}

function totp(secret: Buffer, time = Date.now()) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const offset = mac[19] & 15;
  return (((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0"));
}

function validTotp(secret: Buffer, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some(step => timingSafeEqual(Buffer.from(code), Buffer.from(totp(secret, now + step * 30_000))));
}

function mfaRow(userId: string) {
  return getAuthDatabase()?.prepare("SELECT state,secret_ciphertext,nonce,auth_tag,key_version FROM mfa_credentials WHERE user_id=?").get(safeOwnerId(userId, "account")) as { state: "pending" | "active"; secret_ciphertext: Uint8Array; nonce: Uint8Array; auth_tag: Uint8Array; key_version: number } | undefined;
}

export function getMfaStatus(userId: string) { return { enabled: mfaRow(userId)?.state === "active", pending: mfaRow(userId)?.state === "pending" }; }

export async function verifyAccountPassword(userId: string, password: string) {
  if (!password || password.length > 128) return false;
  const row = getAuthDatabase()?.prepare("SELECT password_hash FROM users WHERE id=?").get(safeOwnerId(userId, "account")) as { password_hash: string } | undefined;
  return Boolean(row && await verifyPassword(password, row.password_hash));
}

export function beginMfaEnrollment(userId: string) {
  assertMfaConfiguration();
  const id = safeOwnerId(userId, "account"), db = getAuthDatabase();
  if (!db) throw new Error("AUTH_UNAVAILABLE");
  const existing = mfaRow(id);
  if (existing?.state === "active") throw new Error("MFA_ALREADY_ACTIVE");
  const secret = randomBytes(20), encrypted = encryptMfaSecret(secret), now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
   const result = db.prepare(`INSERT INTO mfa_credentials(user_id,state,secret_ciphertext,nonce,auth_tag,key_version,created_at,activated_at)
    VALUES(?,'pending',?,?,?,?,?,NULL) ON CONFLICT(user_id) DO UPDATE SET state='pending',secret_ciphertext=excluded.secret_ciphertext,nonce=excluded.nonce,auth_tag=excluded.auth_tag,key_version=1,created_at=excluded.created_at,activated_at=NULL WHERE mfa_credentials.state='pending'`)
    .run(id, encrypted.ciphertext, encrypted.nonce, encrypted.tag, 1, now);
   if (result.changes !== 1 || mfaRow(id)?.state !== "pending") throw new Error("MFA_ALREADY_ACTIVE");
   db.prepare("DELETE FROM mfa_recovery_codes WHERE user_id=?").run(id);
   db.exec("COMMIT");
  } catch (error) {
   try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
   throw error;
  }
  return base32(secret);
}

function freshRecoveryCodes() { return Array.from({ length: 10 }, () => `${randomBytes(5).toString("hex").toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}`); }
function replaceRecoveryCodes(db: DatabaseSync, userId: string) {
  const codes = freshRecoveryCodes(), now = Date.now();
  db.prepare("DELETE FROM mfa_recovery_codes WHERE user_id=?").run(userId);
  const insert = db.prepare("INSERT INTO mfa_recovery_codes(id,user_id,code_hash,created_at,consumed_at) VALUES(?,?,?,?,NULL)");
  for (const code of codes) insert.run(randomUUID(), userId, digest(`recovery:${code}`), now);
  return codes;
}

export function confirmMfaEnrollment(userId: string, code: string, now = Date.now()) {
  const id = safeOwnerId(userId, "account"), db = getAuthDatabase(), row = mfaRow(id);
  if (!db || row?.state !== "pending" || !validTotp(decryptMfaSecret(row), code, now)) return null;
  db.exec("BEGIN IMMEDIATE");
  try { db.prepare("UPDATE mfa_credentials SET state='active',activated_at=? WHERE user_id=? AND state='pending'").run(now, id); const codes = replaceRecoveryCodes(db, id); db.exec("COMMIT"); return codes; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function createMfaChallenge(userId: string, now = Date.now()) {
  const db = getAuthDatabase(), id = safeOwnerId(userId, "account"); if (!db || mfaRow(id)?.state !== "active") return null;
  const token = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM mfa_challenges WHERE expires_at<=? OR user_id=?").run(now, id);
  db.prepare("INSERT INTO mfa_challenges(token_hash,user_id,created_at,expires_at,consumed_at,attempts) VALUES(?,?,?,?,NULL,0)").run(digest(token), id, now, now + MFA_CHALLENGE_TTL_MS);
  return token;
}

export function completeMfaChallenge(token: string, proof: string, now = Date.now()) {
  if (!ACCOUNT_TOKEN.test(token)) return null;
  const db = getAuthDatabase(); if (!db) return null;
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT user_id,expires_at,consumed_at,attempts FROM mfa_challenges WHERE token_hash=?").get(digest(token)) as { user_id: string; expires_at: number; consumed_at: number | null; attempts: number } | undefined;
    if (!row || row.consumed_at || row.expires_at <= now || row.attempts >= 5) { db.exec("COMMIT"); return null; }
    db.prepare("UPDATE mfa_challenges SET attempts=attempts+1 WHERE token_hash=?").run(digest(token));
    const credential = mfaRow(row.user_id); let recoveryUsed = false, valid = credential?.state === "active" && validTotp(decryptMfaSecret(credential), proof, now);
    if (!valid) { const recovery = db.prepare("SELECT id FROM mfa_recovery_codes WHERE user_id=? AND code_hash=? AND consumed_at IS NULL").get(row.user_id, digest(`recovery:${proof.trim().toUpperCase()}`)) as { id: string } | undefined; if (recovery) { db.prepare("UPDATE mfa_recovery_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL").run(now, recovery.id); valid = recoveryUsed = true; } }
    if (!valid) { db.exec("COMMIT"); return null; }
    db.prepare("UPDATE mfa_challenges SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL").run(now, digest(token));
    const user = db.prepare("SELECT id,username,email,password_hash,display_name,role,email_verified_at FROM users WHERE id=?").get(row.user_id) as UserRow;
    db.exec("COMMIT"); return { user: publicUser(user), recoveryUsed };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function verifyCurrentMfa(userId: string, proof: string, now = Date.now()) {
  const id = safeOwnerId(userId, "account"), row = mfaRow(id), db = getAuthDatabase();
  if (!db || row?.state !== "active") return false;
  if (validTotp(decryptMfaSecret(row), proof, now)) return true;
  const result = db.prepare("UPDATE mfa_recovery_codes SET consumed_at=? WHERE id=(SELECT id FROM mfa_recovery_codes WHERE user_id=? AND code_hash=? AND consumed_at IS NULL LIMIT 1) AND consumed_at IS NULL").run(now, id, digest(`recovery:${proof.trim().toUpperCase()}`));
  return result.changes === 1;
}

/** TOTP-only proof for high-risk ceremonies. Recovery codes are deliberately rejected. */
export function verifyFreshTotp(userId: string, proof: string, now = Date.now()) {
  const id = safeOwnerId(userId, "account"), row = mfaRow(id), db = getAuthDatabase();
  const current = row?.state === "active" ? totp(decryptMfaSecret(row), now) : "";
  if (!db || !/^\d{6}$/.test(proof) || !current || !timingSafeEqual(Buffer.from(proof), Buffer.from(current))) return false;
  db.exec(`CREATE TABLE IF NOT EXISTS privileged_totp_replay (
    user_id TEXT PRIMARY KEY, counter INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  const counter = Math.floor(now / 30_000);
  const result = db.prepare(`INSERT INTO privileged_totp_replay(user_id,counter) VALUES(?,?)
    ON CONFLICT(user_id) DO UPDATE SET counter=excluded.counter
    WHERE privileged_totp_replay.counter < excluded.counter`).run(id, counter);
  return result.changes === 1;
}

export function regenerateRecoveryCodes(userId: string) { const db = getAuthDatabase(), id = safeOwnerId(userId, "account"); if (!db || mfaRow(id)?.state !== "active") return null; db.exec("BEGIN IMMEDIATE"); try { const codes = replaceRecoveryCodes(db, id); db.prepare("UPDATE sessions SET revoked_at=? WHERE user_id=?").run(Date.now(), id); db.exec("COMMIT"); return codes; } catch (e) { db.exec("ROLLBACK"); throw e; } }
export function disableMfa(userId: string) { const db = getAuthDatabase(), id = safeOwnerId(userId, "account"); if (!db) return false; db.exec("BEGIN IMMEDIATE"); try { db.prepare("DELETE FROM mfa_credentials WHERE user_id=?").run(id); db.prepare("DELETE FROM mfa_recovery_codes WHERE user_id=?").run(id); db.prepare("DELETE FROM mfa_challenges WHERE user_id=?").run(id); db.prepare("DELETE FROM mfa_email_recovery_tokens WHERE user_id=?").run(id); db.prepare("UPDATE sessions SET revoked_at=? WHERE user_id=?").run(Date.now(), id); db.exec("COMMIT"); return true; } catch (e) { db.exec("ROLLBACK"); throw e; } }

/** Resolve only a live password-created MFA challenge; never accepts a session or legacy identity. */
export function mfaEmailRecoveryCandidate(challenge: string, now = Date.now()) {
  if (!validAccountToken(challenge)) return null;
  const row = getAuthDatabase()?.prepare(`SELECT c.user_id,u.email FROM mfa_challenges c
    JOIN users u ON u.id=c.user_id JOIN mfa_credentials m ON m.user_id=u.id AND m.state='active'
    WHERE c.token_hash=? AND c.consumed_at IS NULL AND c.expires_at>? AND u.email_verified_at IS NOT NULL`)
    .get(digest(challenge), now) as { user_id: string; email: string | null } | undefined;
  return row?.email ? { userId: row.user_id, email: row.email } : null;
}

export function createMfaEmailRecoveryToken(challenge: string, now = Date.now()) {
  const candidate = mfaEmailRecoveryCandidate(challenge, now), db = getAuthDatabase();
  if (!candidate || !db) return null;
  const token = freshAccountToken();
  db.exec("BEGIN IMMEDIATE");
  try {
    // Re-check under the write lock, consume the login challenge, and invalidate older links.
    const live = mfaEmailRecoveryCandidate(challenge, now);
    if (!live || live.userId !== candidate.userId) { db.exec("COMMIT"); return null; }
    db.prepare("UPDATE mfa_challenges SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL").run(now, digest(challenge));
    db.prepare("DELETE FROM mfa_email_recovery_tokens WHERE expires_at<=? OR user_id=?").run(now, candidate.userId);
    db.prepare("INSERT INTO mfa_email_recovery_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
      .run(digest(token), candidate.userId, now + MFA_EMAIL_RECOVERY_TTL_MS, now);
    db.exec("COMMIT");
    return { email: candidate.email, token, userId: candidate.userId };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function mfaEmailRecoveryTokenCandidate(token: string, now = Date.now()) {
  if (!validAccountToken(token)) return null;
  const row = getAuthDatabase()?.prepare("SELECT user_id FROM mfa_email_recovery_tokens WHERE token_hash=? AND expires_at>?")
    .get(digest(token), now) as { user_id: string } | undefined;
  return row?.user_id || null;
}

export function completeMfaEmailRecovery(token: string, now = Date.now()) {
  const db = getAuthDatabase();
  if (!db || !validAccountToken(token)) return false;
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT user_id FROM mfa_email_recovery_tokens WHERE token_hash=? AND expires_at>?")
      .get(digest(token), now) as { user_id: string } | undefined;
    if (!row) { db.exec("COMMIT"); return false; }
    db.prepare("DELETE FROM mfa_credentials WHERE user_id=?").run(row.user_id);
    db.prepare("DELETE FROM mfa_recovery_codes WHERE user_id=?").run(row.user_id);
    db.prepare("DELETE FROM mfa_challenges WHERE user_id=?").run(row.user_id);
    db.prepare("DELETE FROM mfa_email_recovery_tokens WHERE user_id=?").run(row.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);
    db.exec("COMMIT");
    return true;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

function freshAccountToken() {
  return randomBytes(32).toString("base64url");
}

function validAccountToken(value: string) {
  return ACCOUNT_TOKEN.test(value);
}

function pruneAccountTokens(db: DatabaseSync, now: number) {
  db.prepare("DELETE FROM email_verification_tokens WHERE expires_at<=?").run(now);
  db.prepare("DELETE FROM password_reset_tokens WHERE expires_at<=?").run(now);
}

export function createEmailVerificationTokenForUser(userId: string) {
  const db = getAuthDatabase();
  if (!db) throw new Error("AUTH_UNAVAILABLE");
  const id = safeOwnerId(userId, "account");
  const row = db.prepare("SELECT email,email_verified_at FROM users WHERE id=?").get(id) as { email: string | null; email_verified_at: string | null } | undefined;
  if (!row?.email || row.email_verified_at) return null;
  const token = freshAccountToken();
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    pruneAccountTokens(db, now);
    db.prepare("DELETE FROM email_verification_tokens WHERE user_id=?").run(id);
    db.prepare("INSERT INTO email_verification_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
      .run(digest(token), id, now + EMAIL_VERIFICATION_TTL_MS, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { email: row.email, token };
}

export function createEmailVerificationTokenForEmail(value: string) {
  let email: string;
  try { email = validateEmail(value); } catch { return null; }
  const db = getAuthDatabase();
  if (!db) return null;
  const row = db.prepare("SELECT id FROM users WHERE email_normalized=? AND email_verified_at IS NULL").get(email) as { id: string } | undefined;
  return row ? createEmailVerificationTokenForUser(row.id) : null;
}

export function verifyEmailToken(token: string) {
  if (!validAccountToken(token)) return null;
  const db = getAuthDatabase();
  if (!db) return null;
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    pruneAccountTokens(db, now);
    const row = db.prepare("SELECT user_id FROM email_verification_tokens WHERE token_hash=? AND expires_at>?").get(digest(token), now) as { user_id: string } | undefined;
    if (!row) {
      db.exec("COMMIT");
      return null;
    }
    db.prepare("UPDATE users SET email_verified_at=? WHERE id=?").run(new Date(now).toISOString(), row.user_id);
    db.prepare("DELETE FROM email_verification_tokens WHERE user_id=?").run(row.user_id);
    const user = db.prepare("SELECT id,username,email,password_hash,display_name,role,email_verified_at FROM users WHERE id=?").get(row.user_id) as UserRow | undefined;
    db.exec("COMMIT");
    return user ? publicUser(user) : null;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createPasswordResetTokenForEmail(value: string) {
  let email: string;
  try { email = validateEmail(value); } catch { return null; }
  const db = getAuthDatabase();
  if (!db) return null;
  const row = db.prepare("SELECT id,email FROM users WHERE email_normalized=? AND email_verified_at IS NOT NULL").get(email) as { id: string; email: string } | undefined;
  if (!row) return null;
  const token = freshAccountToken();
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    pruneAccountTokens(db, now);
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").run(row.id);
    db.prepare("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
      .run(digest(token), row.id, now + PASSWORD_RESET_TTL_MS, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { email: row.email, token };
}

export async function resetPasswordWithToken(token: string, password: string) {
  if (!validAccountToken(token) || password.length < 12 || password.length > 128) return false;
  const db = getAuthDatabase();
  if (!db) return false;
  const now = Date.now();
  const candidate = db.prepare("SELECT user_id FROM password_reset_tokens WHERE token_hash=? AND expires_at>?").get(digest(token), now) as { user_id: string } | undefined;
  if (!candidate) return false;
  const passwordHash = await hashPassword(password);
  db.exec("BEGIN IMMEDIATE");
  try {
    pruneAccountTokens(db, Date.now());
    const live = db.prepare("SELECT user_id FROM password_reset_tokens WHERE token_hash=? AND expires_at>?").get(digest(token), Date.now()) as { user_id: string } | undefined;
    if (!live || live.user_id !== candidate.user_id) {
      db.exec("COMMIT");
      return false;
    }
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(passwordHash, live.user_id);
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").run(live.user_id);
    db.prepare("DELETE FROM email_verification_tokens WHERE user_id=?").run(live.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(live.user_id);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type AccountProfile = Readonly<{
  displayName: string;
  bio: string;
  email: string;
  role: UserRole;
  credentialSource: "database" | "legacy";
  emailVerified: boolean | null;
  hasAvatar: boolean;
  avatarUpdatedAt: number | null;
}>;

export function getAccountProfile(user: AuthUser): AccountProfile {
  const db = getAuthDatabase();
  const id = safeOwnerId(user.id, "account");
  const profile = db?.prepare("SELECT display_name,bio,avatar_mime,avatar_updated_at FROM account_profiles WHERE user_id=?").get(id) as ProfileRow | undefined;
  const account = db?.prepare("SELECT email,email_verified_at FROM users WHERE id=?").get(id) as { email: string | null; email_verified_at: string | null } | undefined;
  return {
    displayName: profile?.display_name || user.name,
    bio: profile?.bio || "",
    email: user.email,
    role: user.role,
    credentialSource: account ? "database" : "legacy",
    emailVerified: account ? (!account.email || Boolean(account.email_verified_at)) : null,
    hasAvatar: Boolean(profile?.avatar_mime),
    avatarUpdatedAt: profile?.avatar_updated_at ?? null,
  };
}

export function applyAccountProfile(user: AuthUser): AuthUser {
  if (user.role === "viewer") return user;
  const profile = getAccountProfile(user);
  return profile.displayName === user.name ? user : { ...user, name: profile.displayName };
}

export function updateAccountProfile(user: AuthUser, input: { displayName: string; bio: string }) {
  if (user.role === "viewer") throw new Error("PROFILE_FORBIDDEN");
  const displayName = input.displayName.trim();
  const bio = input.bio.trim();
  if (!displayName || displayName.length > 64 || bio.length > 500 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new Error("INVALID_PROFILE");
  const db = getAuthDatabase();
  if (!db) throw new Error("AUTH_UNAVAILABLE");
  const id = safeOwnerId(user.id, "account");
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO account_profiles(user_id,display_name,bio,avatar_mime,avatar_data,avatar_updated_at,updated_at)
    VALUES(?,?,?,NULL,NULL,NULL,?)
    ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,updated_at=excluded.updated_at`)
    .run(id, displayName, bio, now);
  return getAccountProfile({ ...user, name: displayName });
}

export function setAccountAvatar(user: AuthUser, mime: "image/png" | "image/jpeg" | "image/webp", bytes: Uint8Array) {
  if (user.role === "viewer") throw new Error("PROFILE_FORBIDDEN");
  if (!bytes.byteLength || bytes.byteLength > ACCOUNT_AVATAR_MAX_BYTES) throw new Error("INVALID_AVATAR");
  const db = getAuthDatabase();
  if (!db) throw new Error("AUTH_UNAVAILABLE");
  const id = safeOwnerId(user.id, "account");
  const current = getAccountProfile(user);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  db.prepare(`INSERT INTO account_profiles(user_id,display_name,bio,avatar_mime,avatar_data,avatar_updated_at,updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET avatar_mime=excluded.avatar_mime,avatar_data=excluded.avatar_data,avatar_updated_at=excluded.avatar_updated_at,updated_at=excluded.updated_at`)
    .run(id, current.displayName, current.bio, mime, Buffer.from(bytes), nowMs, now);
  return getAccountProfile(user);
}

export function removeAccountAvatar(user: AuthUser) {
  if (user.role === "viewer") throw new Error("PROFILE_FORBIDDEN");
  const db = getAuthDatabase();
  if (!db) throw new Error("AUTH_UNAVAILABLE");
  const id = safeOwnerId(user.id, "account");
  db.prepare("UPDATE account_profiles SET avatar_mime=NULL,avatar_data=NULL,avatar_updated_at=NULL,updated_at=? WHERE user_id=?")
    .run(new Date().toISOString(), id);
  return getAccountProfile(user);
}

export function getAccountAvatar(user: AuthUser) {
  if (user.role === "viewer") return null;
  const db = getAuthDatabase();
  if (!db) return null;
  const id = safeOwnerId(user.id, "account");
  const row = db.prepare("SELECT avatar_mime,avatar_data,avatar_updated_at FROM account_profiles WHERE user_id=?").get(id) as { avatar_mime: string | null; avatar_data: Uint8Array | null; avatar_updated_at: number | null } | undefined;
  if (!row?.avatar_mime || !row.avatar_data) return null;
  if (row.avatar_mime !== "image/png" && row.avatar_mime !== "image/jpeg" && row.avatar_mime !== "image/webp") return null;
  return { mime: row.avatar_mime, bytes: Buffer.from(row.avatar_data), updatedAt: row.avatar_updated_at };
}

function pruneFallbackAttempts(now: number) {
  for (const [bucket, value] of fallbackAttempts) {
    if (value.resetAt <= now) fallbackAttempts.delete(bucket);
  }
  if (fallbackAttempts.size <= 5000) return;
  const excess = [...fallbackAttempts.entries()]
    .sort((left, right) => left[1].resetAt - right[1].resetAt)
    .slice(0, fallbackAttempts.size - 5000);
  for (const [bucket] of excess) fallbackAttempts.delete(bucket);
}

function consumeFallbackRateLimit(keys: string[], limit: number, windowMs: number) {
  const now = Date.now();
  pruneFallbackAttempts(now);
  for (const key of keys) {
    const bucket = digest(key);
    const row = fallbackAttempts.get(bucket);
    if (row && row.resetAt > now && row.count >= limit) return true;
    fallbackAttempts.set(bucket, row && row.resetAt > now
      ? { count: row.count + 1, resetAt: row.resetAt }
      : { count: 1, resetAt: now + windowMs });
  }
  return false;
}

export function consumeRateLimit(keys: string[], limit: number, windowMs: number) {
  if (!keys.length || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1000) {
    throw new Error("Invalid authentication rate-limit policy.");
  }
  const db = getAuthDatabase();
  if (!db) return consumeFallbackRateLimit(keys, limit, windowMs);
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM auth_attempts WHERE reset_at<=? OR bucket NOT IN (SELECT bucket FROM auth_attempts ORDER BY reset_at DESC LIMIT 5000)").run(now);
    for (const key of keys) {
      const bucket = digest(key);
      const row = db.prepare("SELECT count,reset_at FROM auth_attempts WHERE bucket=?").get(bucket) as { count: number; reset_at: number } | undefined;
      if (row && row.reset_at > now && row.count >= limit) {
        db.exec("COMMIT");
        return true;
      }
      db.prepare("INSERT INTO auth_attempts(bucket,count,reset_at) VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN reset_at>? THEN count+1 ELSE 1 END,reset_at=CASE WHEN reset_at>? THEN reset_at ELSE excluded.reset_at END").run(bucket, 1, now + windowMs, now, now);
    }
    db.exec("COMMIT");
    return false;
  } catch {
    try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
    return consumeFallbackRateLimit(keys, limit, windowMs);
  }
}
