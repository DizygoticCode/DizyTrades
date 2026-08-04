import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleSource = await readFile(
  new URL("../app/lib/mexc-owner-order-preview.ts", import.meta.url),
  "utf8",
);
const pageSource = await readFile(
  new URL("../app/account/preview/page.tsx", import.meta.url),
  "utf8",
);
const layoutSource = await readFile(
  new URL("../app/account/layout.tsx", import.meta.url),
  "utf8",
);

test("hypothetical preview has no exchange write or credential surface", () => {
  const source = `${moduleSource}\n${pageSource}\n${layoutSource}`;
  assert.match(moduleSource, /executable:\s*false/);
  assert.match(moduleSource, /exchangeWriteCapability:\s*"none"/);
  assert.match(pageSource, /method="get"/);
  assert.match(pageSource, /EXCHANGE WRITE: NONE/);
  assert.doesNotMatch(source, /requestMexcPrivateRead/);
  assert.doesNotMatch(source, /requireMexcReadOnlyCredentials/);
  assert.doesNotMatch(source, /apiKey|apiSecret|signature|authorization/i);
  assert.doesNotMatch(source, /fetch\([^)]*private/i);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(source, /submitManualOrder|closeManual|reverseManual|flattenManual/i);
  assert.doesNotMatch(source, /LIVE_TRADING_ENABLED\s*=\s*true/);
});

test("preview is owner-gated and linked from the Account Companion only", () => {
  assert.match(pageSource, /user\.role\s*!==\s*"owner"/);
  assert.match(pageSource, /redirect\("\/terminal"\)/);
  assert.match(layoutSource, /href="\/account\/preview"/);
  assert.doesNotMatch(pageSource, /export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)/);
});
