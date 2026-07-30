import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import test from "node:test";
import { authenticateDatabaseUser, closeAuthDatabaseForTests, createAccount, createDatabaseSession, databaseSession, revokeDatabaseSession } from "../app/lib/auth-db.ts";
import { authenticateLegacyUser, publicSignupEnabled } from "../app/lib/auth-credentials.ts";
import { readUserRecord, saveSettings } from "../app/lib/store.ts";

let directory;
test.beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "dizy-auth-")); process.env.DATA_DIR = directory; process.env.LEGACY_AUTH_FALLBACK_ENABLED = "true"; closeAuthDatabaseForTests(); });
test.afterEach(async () => { closeAuthDatabaseForTests(); await rm(directory, { recursive: true, force: true }); });

const password = "correct horse battery staple";

test("supports username-only, email-only, and either-identifier accounts", async () => {
  const usernameOnly = await createAccount({ username: "Trader.One", password });
  assert.equal((await authenticateDatabaseUser("trader.one", password))?.id, usernameOnly.id);
  const emailOnly = await createAccount({ email: "Person@Example.TEST", password });
  assert.equal((await authenticateDatabaseUser("person@example.test", password))?.id, emailOnly.id);
  const both = await createAccount({ username: "Chart_User", email: "chart@example.test", password });
  assert.equal((await authenticateDatabaseUser("CHART_USER", password))?.id, both.id);
  assert.equal((await authenticateDatabaseUser("CHART@EXAMPLE.TEST", password))?.id, both.id);
});

test("enforces case-insensitive identifier uniqueness and ignores client privileges", async () => {
  await createAccount({ username: "Unique.Name", email: "unique@example.test", password });
  await assert.rejects(createAccount({ username: "unique.name", password }), /DUPLICATE/);
  await assert.rejects(createAccount({ email: "UNIQUE@example.test", password }), /DUPLICATE/);
  const elevated = await createAccount({ username: "ordinary", password, role: "owner", id: "rob" });
  assert.equal(elevated.role, "user"); assert.notEqual(elevated.id, "rob");
});

test("stores neither plaintext passwords nor session tokens and revokes logout sessions", async () => {
  const messages = []; const originalLog = console.log; console.log = (...values) => messages.push(values.join(" "));
  const user = await createAccount({ username: "private_user", password });
  console.log = originalLog;
  const token = createDatabaseSession(user, 3600); assert.ok(token); assert.deepEqual(databaseSession(token), user);
  const bytes = await readFile(join(directory, "auth.sqlite"));
  assert.equal(bytes.includes(Buffer.from(password)), false); assert.equal(bytes.includes(Buffer.from(token)), false);
  assert.equal(messages.join(" ").includes(password), false);
  revokeDatabaseSession(token); assert.equal(databaseSession(token), null);
});

test("rejects signup when public registration is disabled", async () => {
  process.env.PUBLIC_SIGNUP_ENABLED = "false";
  assert.equal(publicSignupEnabled(), false);
  delete process.env.PUBLIC_SIGNUP_ENABLED;
});

test("keeps arbitrary users' settings isolated", async () => {
  const a = await createAccount({ username: "isolate_a", password }); const b = await createAccount({ username: "isolate_b", password });
  const settings = (await readUserRecord(a.id)).settings; settings.risk.riskPct = 0.25; await saveSettings(a.id, settings);
  assert.equal((await readUserRecord(a.id)).settings.risk.riskPct, 0.25);
  assert.notEqual((await readUserRecord(b.id)).settings.risk.riskPct, 0.25);
});

test("authenticates Rob and Nick through legacy fallback when SQLite is unavailable", async () => {
  closeAuthDatabaseForTests(); const blocker = join(directory, "blocker"); await writeFile(blocker, "not a directory"); process.env.DATA_DIR = join(blocker, "child");
  process.env.ROB_EMAIL = "rob@example.test"; process.env.FRIEND_EMAIL = "nick@example.test";
  const legacyHash = (value) => { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`; };
  process.env.ROB_PASSWORD_HASH = legacyHash(password); process.env.FRIEND_PASSWORD_HASH = legacyHash(password);
  assert.equal(await authenticateDatabaseUser("rob@example.test", password), null);
  assert.deepEqual((await authenticateLegacyUser("rob@example.test", password))?.role, "owner");
  const nick = await authenticateLegacyUser("nick@example.test", password); assert.equal(nick?.id, "friend"); assert.equal(nick?.role, "admin");
});
