import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword, normaliseIdentifier, verifyPassword, type AuthUser, type UserRole } from "./auth-credentials";

let database: DatabaseSync | null = null;
let unavailable = false;
const authPath = () => join(process.env.DATA_DIR || join(process.cwd(), ".data"), "auth.sqlite");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

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
    mkdirSync(dirname(authPath()), { recursive: true });
    database = new DatabaseSync(authPath());
    migrate(database);
    return database;
  } catch {
    unavailable = true;
    database = null;
    return null;
  }
}

export function closeAuthDatabaseForTests() {
  database?.close(); database = null; unavailable = false;
}

type UserRow = { id: string; username: string | null; email: string | null; password_hash: string; display_name: string; role: UserRole };
const publicUser = (row: UserRow): AuthUser => ({ id: row.id, name: row.display_name, email: row.email || "", role: row.role });

export async function createAccount(input: { username?: string; email?: string; password: string }) {
  const db = getAuthDatabase();
  if (!db) throw new Error("AUTH_UNAVAILABLE");
  const username = input.username?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  const displayName = username || email!.split("@")[0];
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
  const db = getAuthDatabase(); if (!db) return null;
  const normalized = normaliseIdentifier(identifier);
  const row = db.prepare("SELECT id,username,email,password_hash,display_name,role FROM users WHERE username_normalized=? OR email_normalized=?").get(normalized, normalized) as UserRow | undefined;
  return row && await verifyPassword(password, row.password_hash) ? publicUser(row) : null;
}

export function createDatabaseSession(user: AuthUser, maxAgeSeconds: number) {
  const db = getAuthDatabase(); if (!db) return null;
  if (!db.prepare("SELECT 1 FROM users WHERE id=?").get(user.id)) return null;
  const token = randomBytes(32).toString("base64url"); const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM sessions WHERE user_id=? OR expires_at<=?").run(user.id, now);
    db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(digest(token), user.id, now + maxAgeSeconds * 1000, now);
    db.exec("COMMIT"); return token;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function databaseSession(token: string) {
  const db = getAuthDatabase(); if (!db) return null;
  const row = db.prepare("SELECT u.id,u.username,u.email,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").get(digest(token), Date.now()) as UserRow | undefined;
  return row ? publicUser(row) : null;
}

export function revokeDatabaseSession(token: string) { getAuthDatabase()?.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token)); }

export function consumeRateLimit(keys: string[], limit: number, windowMs: number) {
  const db = getAuthDatabase(); if (!db) return false; const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM auth_attempts WHERE reset_at<=? OR bucket NOT IN (SELECT bucket FROM auth_attempts ORDER BY reset_at DESC LIMIT 5000)").run(now);
    for (const key of keys) {
      const bucket = digest(key); const row = db.prepare("SELECT count,reset_at FROM auth_attempts WHERE bucket=?").get(bucket) as { count: number; reset_at: number } | undefined;
      if (row && row.reset_at > now && row.count >= limit) { db.exec("COMMIT"); return true; }
      db.prepare("INSERT INTO auth_attempts(bucket,count,reset_at) VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN reset_at>? THEN count+1 ELSE 1 END,reset_at=CASE WHEN reset_at>? THEN reset_at ELSE excluded.reset_at END").run(bucket, 1, now + windowMs, now, now);
    }
    db.exec("COMMIT"); return false;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
