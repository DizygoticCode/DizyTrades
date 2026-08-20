import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const config = await readFile("playwright.config.ts", "utf8");

test("CI browser smoke runs against production Next while local Playwright retains dev mode", () => {
  assert.match(
    config,
    /const localWebServerCommand = "npm run dev -- --hostname 127\.0\.0\.1 --port 3100";/,
  );
  assert.match(
    config,
    /const ciWebServerCommand =\s*"npm run build && npm run start -- --hostname 127\.0\.0\.1 --port 3100";/,
  );
  assert.match(
    config,
    /command: process\.env\.CI \? ciWebServerCommand : localWebServerCommand,/,
  );
});
