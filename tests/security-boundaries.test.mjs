import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  closeAuthDatabaseForTests,
  consumeRateLimit,
  createAccount,
} from "../app/lib/auth-db.ts";
import {
  createSessionToken,
  issueSession,
  parseSessionToken,
  VIEWER_USER,
} from "../app/lib/auth-session.ts";
import { readJournal } from "../app/lib/journal-store.ts";
import {
  requestIp,
  validRequestOrigin,
  validSameOriginNavigation,
} from "../app/lib/request-security.ts";
import { safeOwnerId } from "../app/lib/security-boundaries.ts";
import { readUserRecord } from "../app/lib/store.ts";

const environmentKeys = [
  "DATA_DIR",
  "SESSION_SECRET",
  "LEGACY_AUTH_FALLBACK_ENABLED",
  "ALLOW_TEST_PLAINTEXT_PASSWORDS",
  "LIVE_TRADING_ENABLED",
  "ROB_EMAIL",
  "ROB_PASSWORD",
  "ROB_PASSWORD_HASH",
];
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

let directory;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "dizy-security-"));
  process.env.DATA_DIR = directory;
  process.env.SESSION_SECRET = "dizy-security-test-secret-with-more-than-32-characters";
  process.env.LEGACY_AUTH_FALLBACK_ENABLED = "true";
  process.env.ALLOW_TEST_PLAINTEXT_PASSWORDS = "true";
  process.env.LIVE_TRADING_ENABLED = "false";
  process.env.ROB_EMAIL = "owner@example.test";
  process.env.ROB_PASSWORD = "throwaway-owner-password-for-security-tests";
  delete process.env.ROB_PASSWORD_HASH;
  closeAuthDatabaseForTests();
});

test.afterEach(async () => {
  closeAuthDatabaseForTests();
  await rm(directory, { recursive: true, force: true });
});

test.after(() => {
  for (const key of environmentKeys) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value !== undefined) process.env[key] = value;
  }
});

test("owner identifiers are collision-free and reject path syntax", async () => {
  for (const value of ["rob", "friend", "guest", "ab12cd34-ef56-7890-ab12-cd34ef567890"]) {
    assert.equal(safeOwnerId(value), value);
  }
  for (const value of ["", "../rob", "rob!!", "rob.json", "a".repeat(121)]) {
    assert.throws(() => safeOwnerId(value), /Invalid owner identifier/);
  }
  await assert.rejects(readUserRecord("rob!!"), /Invalid profile owner identifier/);
  await assert.rejects(readJournal("../rob"), /Invalid Journal owner identifier/);
});

test("signed sessions are bounded, tamper-resistant and revoke with legacy fallback", () => {
  const viewerToken = createSessionToken(VIEWER_USER, 3600);
  assert.deepEqual(parseSessionToken(viewerToken), VIEWER_USER);
  assert.equal(parseSessionToken(`${viewerToken}.extra`), null);
  assert.equal(parseSessionToken(`x${viewerToken.slice(1)}`), null);
  assert.equal(parseSessionToken("x".repeat(2049)), null);

  const owner = {
    id: "rob",
    name: "Rob",
    email: "owner@example.test",
    role: "owner",
  };
  const ownerToken = createSessionToken(owner, 3600);
  assert.deepEqual(parseSessionToken(ownerToken), owner);
  process.env.LEGACY_AUTH_FALLBACK_ENABLED = "false";
  assert.equal(parseSessionToken(ownerToken), null);
  assert.deepEqual(parseSessionToken(viewerToken), VIEWER_USER);
});

test("database users never receive an unusable signed fallback session", async () => {
  const blocker = join(directory, "not-a-directory");
  await writeFile(blocker, "blocked");
  process.env.DATA_DIR = join(blocker, "child");
  closeAuthDatabaseForTests();
  assert.equal(
    issueSession({
      id: "ordinary-user",
      name: "Ordinary user",
      email: "ordinary@example.test",
      role: "user",
    }),
    null,
  );
});

test("authentication throttling remains active when SQLite is unavailable", async () => {
  const blocker = join(directory, "rate-limit-blocker");
  await writeFile(blocker, "blocked");
  process.env.DATA_DIR = join(blocker, "child");
  closeAuthDatabaseForTests();
  assert.equal(consumeRateLimit(["login:ip:203.0.113.4"], 2, 60_000), false);
  assert.equal(consumeRateLimit(["login:ip:203.0.113.4"], 2, 60_000), false);
  assert.equal(consumeRateLimit(["login:ip:203.0.113.4"], 2, 60_000), true);
});

test("the auth database is private and validates accounts at its own boundary", async () => {
  await assert.rejects(
    createAccount({ username: "<script>", password: "correct horse battery staple" }),
    /INVALID_ACCOUNT/,
  );
  await assert.rejects(
    createAccount({ email: "not-an-email", password: "correct horse battery staple" }),
    /INVALID_ACCOUNT/,
  );
  await createAccount({ username: "valid_user", password: "correct horse battery staple" });
  const mode = (await stat(join(directory, "auth.sqlite"))).mode & 0o777;
  assert.equal(mode, 0o600);
});

test("request metadata rejects cross-site origins and spoof-shaped IP values", () => {
  const request = new Request("https://dizytrades.test/api/auth/login", {
    method: "POST",
    headers: {
      host: "dizytrades.test",
      origin: "https://dizytrades.test",
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": "203.0.113.4, 10.0.0.1",
    },
  });
  assert.equal(requestIp(request), "203.0.113.4");
  assert.equal(validRequestOrigin(request), true);

  const crossSite = new Request("https://dizytrades.test/api/auth/login", {
    method: "POST",
    headers: {
      host: "dizytrades.test",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
      "x-forwarded-for": "not-an-ip",
    },
  });
  assert.equal(requestIp(crossSite), "unknown");
  assert.equal(validRequestOrigin(crossSite), false);

  const protocolMismatch = new Request("https://dizytrades.test/api/auth/login", {
    method: "POST",
    headers: {
      host: "dizytrades.test",
      origin: "http://dizytrades.test",
      "sec-fetch-site": "same-origin",
    },
  });
  assert.equal(validRequestOrigin(protocolMismatch), false);
});

test("GET logout requires an explicit same-origin browser navigation", () => {
  const navigation = new Request("https://dizytrades.test/api/auth/logout", {
    headers: {
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "sec-fetch-user": "?1",
    },
  });
  assert.equal(validSameOriginNavigation(navigation), true);

  const embedded = new Request("https://dizytrades.test/api/auth/logout", {
    headers: {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "no-cors",
    },
  });
  assert.equal(validSameOriginNavigation(embedded), false);
});
