import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
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
  if (versionTwo) return;
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

export function getAuthDatabase() {
  if (unavailable) return null;
  if (database) return database;
  try {
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

export type DatabaseAuthenticationResult =
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "email-unverified"; email: string }>
  | Readonly<{ status: "authenticated"; user: AuthUser }>;

export async function authenticateDatabaseUserDetailed(identifier: string, password: string): Promise<DatabaseAuthenticationResult> {
  const normalized = normaliseIdentifier(identifier);
  if (!normalized || normalized.length > 254 || password.length < 1 || password.length > 128) return { status: "invalid" };
  const db = getAuthDatabase();
  if (!db) return { status: "invalid" };
  const row = db.prepare("SELECT id,username,email,password_hash,display_name,role,email_verified_at FROM users WHERE username_normalized=? OR email_normalized=?").get(normalized, normalized) as UserRow | undefined;
  if (!row || !await verifyPassword(password, row.password_hash)) return { status: "invalid" };
  if (row.email && !row.email_verified_at) return { status: "email-unverified", email: row.email };
  return { status: "authenticated", user: publicUser(row) };
}

export async function authenticateDatabaseUser(identifier: string, password: string) {
  const result = await authenticateDatabaseUserDetailed(identifier, password);
  return result.status === "authenticated" ? result.user : null;
}

export function createDatabaseSession(user: AuthUser, maxAgeSeconds: number) {
  const db = getAuthDatabase();
  if (!db || !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 60 || maxAgeSeconds > 60 * 60 * 24 * 30) return null;
  const ownerId = safeOwnerId(user.id, "account");
  const account = db.prepare("SELECT email,email_verified_at FROM users WHERE id=?").get(ownerId) as { email: string | null; email_verified_at: string | null } | undefined;
  if (!account) return null;
  if (account.email && !account.email_verified_at) return null;
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM sessions WHERE user_id=? OR expires_at<=?").run(ownerId, now);
    db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(digest(token), ownerId, now + maxAgeSeconds * 1000, now);
    db.exec("COMMIT");
    return token;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function databaseSession(token: string) {
  if (!isOpaqueSessionToken(token)) return null;
  const db = getAuthDatabase();
  if (!db) return null;
  const row = db.prepare("SELECT u.id,u.username,u.email,u.password_hash,u.display_name,u.role,u.email_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").get(digest(token), Date.now()) as UserRow | undefined;
  if (!row || (row.email && !row.email_verified_at)) return null;
  return publicUser(row);
}

export function revokeDatabaseSession(token: string) {
  if (!isOpaqueSessionToken(token)) return;
  getAuthDatabase()?.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
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
