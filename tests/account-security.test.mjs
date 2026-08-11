import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  applyAccountProfile,
  authenticateDatabaseUserDetailed,
  closeAuthDatabaseForTests,
  createAccount,
  createDatabaseSession,
  createEmailVerificationTokenForUser,
  createPasswordResetTokenForEmail,
  databaseSession,
  getAccountAvatar,
  getAccountProfile,
  getAuthDatabase,
  removeAccountAvatar,
  resetPasswordWithToken,
  setAccountAvatar,
  updateAccountProfile,
  verifyEmailToken,
} from "../app/lib/auth-db.ts";
import { hashPassword } from "../app/lib/auth-credentials.ts";

let directory = "";
const originalDataDir = process.env.DATA_DIR;

test.beforeEach(() => {
  closeAuthDatabaseForTests();
  directory = mkdtempSync(join(tmpdir(), "dizy-auth-"));
  process.env.DATA_DIR = directory;
});

test.afterEach(() => {
  closeAuthDatabaseForTests();
  rmSync(directory, { recursive: true, force: true });
});

test.after(() => {
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

test("new database accounts require email verification before sessions can be issued", async () => {
  const user = await createAccount({ email: "new@example.test", username: "new-user", password: "correct-horse-battery" });
  assert.equal((await authenticateDatabaseUserDetailed("new@example.test", "correct-horse-battery")).status, "email-unverified");
  assert.equal(createDatabaseSession(user, 3600), null);

  const verification = createEmailVerificationTokenForUser(user.id);
  assert.ok(verification);
  assert.equal(verification.email, "new@example.test");
  assert.equal(verification.token.length, 43);
  assert.equal(verifyEmailToken(verification.token)?.id, user.id);
  assert.equal(verifyEmailToken(verification.token), null, "verification token must be single use");

  const authenticated = await authenticateDatabaseUserDetailed("new-user", "correct-horse-battery");
  assert.equal(authenticated.status, "authenticated");
  if (authenticated.status !== "authenticated") return;
  const session = createDatabaseSession(authenticated.user, 3600);
  assert.ok(session);
  assert.equal(databaseSession(session)?.id, user.id);
});

test("signup database validation rejects missing email", async () => {
  await assert.rejects(
    createAccount({ email: "", username: "username", password: "correct-horse-battery" }),
    /INVALID_ACCOUNT/,
  );
});

test("password reset is verified-email only, single use, changes the password and revokes sessions", async () => {
  const user = await createAccount({ email: "reset@example.test", password: "old-password-value" });
  assert.equal(createPasswordResetTokenForEmail("reset@example.test"), null);
  const verification = createEmailVerificationTokenForUser(user.id);
  assert.ok(verification);
  assert.ok(verifyEmailToken(verification.token));

  const authenticated = await authenticateDatabaseUserDetailed("reset@example.test", "old-password-value");
  assert.equal(authenticated.status, "authenticated");
  if (authenticated.status !== "authenticated") return;
  const session = createDatabaseSession(authenticated.user, 3600);
  assert.ok(session);

  const reset = createPasswordResetTokenForEmail("RESET@example.test");
  assert.ok(reset);
  assert.equal(await resetPasswordWithToken(reset.token, "new-password-value"), true);
  assert.equal(databaseSession(session), null, "successful reset must revoke existing database sessions");
  assert.equal((await authenticateDatabaseUserDetailed("reset@example.test", "old-password-value")).status, "invalid");
  assert.equal((await authenticateDatabaseUserDetailed("reset@example.test", "new-password-value")).status, "authenticated");
  assert.equal(await resetPasswordWithToken(reset.token, "another-password-value"), false, "reset token must be single use");
});

test("persistent profiles also overlay legacy owner identities without changing their role", () => {
  const owner = { id: "rob", name: "Rob", email: "owner@example.test", role: "owner" };
  const saved = updateAccountProfile(owner, { displayName: "Dizygotic", bio: "Owner profile" });
  assert.equal(saved.displayName, "Dizygotic");
  assert.equal(saved.bio, "Owner profile");
  assert.equal(saved.role, "owner");
  assert.equal(saved.credentialSource, "legacy");
  assert.deepEqual(applyAccountProfile(owner), { ...owner, name: "Dizygotic" });
});

test("avatar bytes persist in SQLite and can be removed", () => {
  const owner = { id: "rob", name: "Rob", email: "owner@example.test", role: "owner" };
  const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const profile = setAccountAvatar(owner, "image/png", pngHeader);
  assert.equal(profile.hasAvatar, true);
  const avatar = getAccountAvatar(owner);
  assert.equal(avatar?.mime, "image/png");
  assert.deepEqual([...avatar.bytes], [...pngHeader]);
  assert.equal(removeAccountAvatar(owner).hasAvatar, false);
  assert.equal(getAccountAvatar(owner), null);
});

test("v1 users with an existing email are grandfathered as verified during migration", async () => {
  closeAuthDatabaseForTests();
  const dbPath = join(directory, "auth.sqlite");
  const old = new DatabaseSync(dbPath);
  old.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, username_normalized TEXT UNIQUE, email TEXT, email_normalized TEXT UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','admin','user')), created_at TEXT NOT NULL);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE auth_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    INSERT INTO schema_migrations(version, applied_at) VALUES(1, datetime('now'));
  `);
  const passwordHash = await hashPassword("legacy-database-password");
  old.prepare("INSERT INTO users(id,username,username_normalized,email,email_normalized,password_hash,display_name,role,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run("legacy-db", "legacydb", "legacydb", "legacy@example.test", "legacy@example.test", passwordHash, "Legacy DB", "user", "2026-08-01T00:00:00.000Z");
  old.close();

  const migrated = getAuthDatabase();
  assert.ok(migrated);
  const row = migrated.prepare("SELECT email_verified_at FROM users WHERE id='legacy-db'").get();
  assert.equal(row.email_verified_at, "2026-08-01T00:00:00.000Z");
  assert.equal((await authenticateDatabaseUserDetailed("legacy@example.test", "legacy-database-password")).status, "authenticated");
});

test("profile API data never exposes avatar bytes or a role mutation field", () => {
  const owner = { id: "rob", name: "Rob", email: "owner@example.test", role: "owner" };
  const profile = getAccountProfile(owner);
  assert.equal(Object.hasOwn(profile, "avatarData"), false);
  assert.equal(Object.hasOwn(profile, "password"), false);
});
