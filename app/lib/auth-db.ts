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

type UserRow = { id: string; username: string | null; email: string | null; password_hash: string; display_name: string; role: UserRole };
const publicUser = (row: UserRow): AuthUser => ({
  id: safeOwnerId(row.id, "account"),
  name: row.display_name,
  email: row.email || "",
  role: row.role,
});

function validateNewAccount(input: { username?: string; email?: string; password: string }) {
  const username = input.username?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  if (!username && !email) throw new Error("INVALID_ACCOUNT");
  if (username && (!/^[A-Za-z0-9_.-]{3,32}$/.test(username) || username.includes("@"))) {
    throw new Error("INVALID_ACCOUNT");
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("INVALID_ACCOUNT");
  }
  if (input.password.length < 12 || input.password.length > 128) {
    throw new Error("INVALID_ACCOUNT");
  }
  return { username, email };
}

export async function createAccount(input: { username?: string; email?: string; password: string }) {
  const db = getAuthDatabase();
  if (!db) throw new Error("AUTH_UNAVAILABLE");
  const { username, email } = validateNewAccount(input);
  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  const displayName = (username || email!.split("@")[0]).slice(0, 64);
  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO users(id,username,username_normalized,email,email_normalized,password_hash,display_name,role,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(id, username, username && normaliseIdentifier(username), email, email, passwordHash, displayName, "user", new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
    if (String(error).includes("UNIQUE")) throw new Error("DUPLICATE");
    throw error;
  }
  return { id, name: displayName, email: email || "", role: "user" } satisfies AuthUser;
}

export async function authenticateDatabaseUser(identifier: string, password: string) {
  const normalized = normaliseIdentifier(identifier);
  if (!normalized || normalized.length > 254 || password.length < 1 || password.length > 128) return null;
  const db = getAuthDatabase();
  if (!db) return null;
  const row = db.prepare("SELECT id,username,email,password_hash,display_name,role FROM users WHERE username_normalized=? OR email_normalized=?").get(normalized, normalized) as UserRow | undefined;
  return row && await verifyPassword(password, row.password_hash) ? publicUser(row) : null;
}

export function createDatabaseSession(user: AuthUser, maxAgeSeconds: number) {
  const db = getAuthDatabase();
  if (!db || !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 60 || maxAgeSeconds > 60 * 60 * 24 * 30) return null;
  const ownerId = safeOwnerId(user.id, "account");
  if (!db.prepare("SELECT 1 FROM users WHERE id=?").get(ownerId)) return null;
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
  const row = db.prepare("SELECT u.id,u.username,u.email,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").get(digest(token), Date.now()) as UserRow | undefined;
  return row ? publicUser(row) : null;
}

export function revokeDatabaseSession(token: string) {
  if (!isOpaqueSessionToken(token)) return;
  getAuthDatabase()?.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
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
