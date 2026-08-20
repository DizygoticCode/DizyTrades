import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const config = await readFile("playwright.config.ts", "utf8");

test("CI browser smoke runs against production standalone Next while local Playwright retains dev mode", () => {
  assert.match(
    config,
    /const localWebServerCommand = "npm run dev -- --hostname 127\.0\.0\.1 --port 3100";/,
  );
  assert.match(
    config,
    /const ciWebServerCommand = "npm run build && npm run start";/,
  );
  assert.match(
    config,
    /command: process\.env\.CI \? ciWebServerCommand : localWebServerCommand,/,
  );
  assert.match(config, /HOSTNAME: "127\.0\.0\.1",/);
  assert.match(config, /PORT: "3100",/);
});

test("internal Playwright server shares the repository data root with browser fixtures", () => {
  assert.match(
    config,
    /const dataDir = process\.env\.DATA_DIR \?\? join\(process\.cwd\(\), "\.data"\);/,
  );
  assert.match(config, /DATA_DIR: dataDir,/);
});

test("production Playwright bootstrap supplies a distinct valid MFA encryption key", () => {
  const mfaMatch = config.match(
    /MFA_ENCRYPTION_KEY:\s*process\.env\.MFA_ENCRYPTION_KEY \?\?\s*"([A-Za-z0-9_-]+)"/,
  );
  const sessionMatch = config.match(
    /SESSION_SECRET:\s*process\.env\.SESSION_SECRET \?\?\s*"([^"]+)"/,
  );

  assert.ok(mfaMatch, "expected an E2E MFA_ENCRYPTION_KEY fallback");
  assert.ok(sessionMatch, "expected an E2E SESSION_SECRET fallback");
  assert.ok(mfaMatch[1].length >= 43, "MFA key must be a full 32-byte base64url value");
  assert.equal(Buffer.from(mfaMatch[1], "base64url").length, 32);
  assert.notEqual(mfaMatch[1], sessionMatch[1], "MFA key must not reuse SESSION_SECRET");
});
