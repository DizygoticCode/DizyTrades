import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import test from "node:test";
import {
  authenticateUser,
  authIsConfigured,
  legacyAuthFallbackEnabled,
  publicSignupEnabled,
} from "../app/lib/auth-credentials.ts";

const authEnvironmentKeys = [
  "ALLOW_TEST_PLAINTEXT_PASSWORDS",
  "NODE_ENV",
  "LIVE_TRADING_ENABLED",
  "PUBLIC_SIGNUP_ENABLED",
  "LEGACY_AUTH_FALLBACK_ENABLED",
  "ROB_EMAIL",
  "ROB_PASSWORD",
  "ROB_PASSWORD_HASH",
  "FRIEND_EMAIL",
  "FRIEND_PASSWORD",
  "FRIEND_PASSWORD_HASH",
];

const originalEnvironment = Object.fromEntries(
  authEnvironmentKeys.map((key) => [key, process.env[key]]),
);

function resetAuthEnvironment() {
  for (const key of authEnvironmentKeys) delete process.env[key];
}

function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

test.beforeEach(() => {
  resetAuthEnvironment();
  process.env.LEGACY_AUTH_FALLBACK_ENABLED = "true";
});

test.after(() => {
  resetAuthEnvironment();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value !== undefined) process.env[key] = value;
  }
});

test("keeps signup and legacy fallback disabled unless explicitly enabled", () => {
  delete process.env.PUBLIC_SIGNUP_ENABLED;
  delete process.env.LEGACY_AUTH_FALLBACK_ENABLED;
  assert.equal(publicSignupEnabled(), false);
  assert.equal(legacyAuthFallbackEnabled(), false);
  process.env.PUBLIC_SIGNUP_ENABLED = "true";
  process.env.LEGACY_AUTH_FALLBACK_ENABLED = "true";
  assert.equal(publicSignupEnabled(), true);
  assert.equal(legacyAuthFallbackEnabled(), true);
});

test("allows an explicitly enabled test plaintext password and strips secrets", async () => {
  process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS = "true";
  process.env.LIVE_TRADING_ENABLED = "false";
  process.env.ROB_EMAIL = "owner@example.test";
  process.env.ROB_PASSWORD = "unique-throwaway-owner-password";
  process.env.ROB_PASSWORD_HASH = passwordHash("different-hashed-password");

  assert.equal(authIsConfigured(), true);
  const user = await authenticateUser(
    "OWNER@example.test",
    "unique-throwaway-owner-password",
  );
  assert.deepEqual(user, {
    id: "rob",
    name: "Rob",
    email: "owner@example.test",
    role: "owner",
  });
  assert.equal(Object.hasOwn(user, "passwordHash"), false);
  assert.equal(Object.hasOwn(user, "plaintextPassword"), false);
  assert.equal(await authenticateUser("owner@example.test", "different-hashed-password"), null);
});

test("blocks plaintext mode during live trading", async () => {
  process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS = "true";
  process.env.LIVE_TRADING_ENABLED = "true";
  process.env.ROB_EMAIL = "owner@example.test";
  process.env.ROB_PASSWORD = "unique-throwaway-owner-password";

  assert.equal(authIsConfigured(), false);
  assert.equal(
    await authenticateUser("owner@example.test", "unique-throwaway-owner-password"),
    null,
  );
});

test("production ignores plaintext legacy passwords even when the test flag is set", async () => {
  process.env.NODE_ENV = "production";
  process.env.LEGACY_AUTH_FALLBACK_ENABLED = "true";
  process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS = "true";
  process.env.LIVE_TRADING_ENABLED = "false";
  process.env.ROB_EMAIL = "rob.noyce@gmail.com";
  process.env.ROB_PASSWORD = "production-plaintext-must-not-authenticate";
  assert.equal(await authenticateUser("rob.noyce@gmail.com", "production-plaintext-must-not-authenticate"), null);
});

test("uses scrypt hashes when plaintext mode is disabled", async () => {
  process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS = "false";
  process.env.FRIEND_EMAIL = "friend@example.test";
  process.env.FRIEND_PASSWORD = "unused-throwaway-password";
  process.env.FRIEND_PASSWORD_HASH = passwordHash("hashed-friend-password");

  assert.equal(authIsConfigured(), true);
  assert.equal(
    (await authenticateUser("friend@example.test", "hashed-friend-password"))?.id,
    "friend",
  );
  assert.equal(
    await authenticateUser("friend@example.test", "unused-throwaway-password"),
    null,
  );
});

test("does not configure a user with a malformed hash", () => {
  process.env.ROB_EMAIL = "owner@example.test";
  process.env.ROB_PASSWORD_HASH = "not-a-valid-scrypt-hash";

  assert.equal(authIsConfigured(), false);
});

test("does not authenticate legacy users when fallback is disabled", async () => {
  process.env.LEGACY_AUTH_FALLBACK_ENABLED = "false";
  process.env.ROB_EMAIL = "owner@example.test";
  process.env.ROB_PASSWORD_HASH = passwordHash("hashed-owner-password");
  assert.equal(await authenticateUser("owner@example.test", "hashed-owner-password"), null);
});
