import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import test from "node:test";
import {
  authenticateUser,
  authIsConfigured,
} from "../app/lib/auth-credentials.ts";

const authEnvironmentKeys = [
  "ALLOW_TEST_PLAINTEXT_PASSWORDS",
  "LIVE_TRADING_ENABLED",
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

test.beforeEach(resetAuthEnvironment);

test.after(() => {
  resetAuthEnvironment();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value !== undefined) process.env[key] = value;
  }
});

test("allows an explicitly enabled test plaintext password and strips secrets", () => {
  process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS = "true";
  process.env.LIVE_TRADING_ENABLED = "false";
  process.env.ROB_EMAIL = "owner@example.test";
  process.env.ROB_PASSWORD = "unique-throwaway-owner-password";
  process.env.ROB_PASSWORD_HASH = passwordHash("different-hashed-password");

  assert.equal(authIsConfigured(), true);
  const user = authenticateUser(
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
  assert.equal(authenticateUser("owner@example.test", "different-hashed-password"), null);
});

test("blocks plaintext mode during live trading", () => {
  process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS = "true";
  process.env.LIVE_TRADING_ENABLED = "true";
  process.env.ROB_EMAIL = "owner@example.test";
  process.env.ROB_PASSWORD = "unique-throwaway-owner-password";

  assert.equal(authIsConfigured(), false);
  assert.equal(
    authenticateUser("owner@example.test", "unique-throwaway-owner-password"),
    null,
  );
});

test("uses scrypt hashes when plaintext mode is disabled", () => {
  process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS = "false";
  process.env.FRIEND_EMAIL = "friend@example.test";
  process.env.FRIEND_PASSWORD = "unused-throwaway-password";
  process.env.FRIEND_PASSWORD_HASH = passwordHash("hashed-friend-password");

  assert.equal(authIsConfigured(), true);
  assert.equal(
    authenticateUser("friend@example.test", "hashed-friend-password")?.id,
    "friend",
  );
  assert.equal(
    authenticateUser("friend@example.test", "unused-throwaway-password"),
    null,
  );
});

test("does not configure a user with a malformed hash", () => {
  process.env.ROB_EMAIL = "owner@example.test";
  process.env.ROB_PASSWORD_HASH = "not-a-valid-scrypt-hash";

  assert.equal(authIsConfigured(), false);
});
