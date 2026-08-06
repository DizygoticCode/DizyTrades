import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const roadmap = await readFile(new URL("../ROADMAP.md", import.meta.url), "utf8");
const review = await readFile(
  new URL("../docs/MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW.md", import.meta.url),
  "utf8",
);
const shutdownRunbook = await readFile(
  new URL("../docs/MEXC_OWNER_CONNECTION_SHUTDOWN.md", import.meta.url),
  "utf8",
);

test("Account Companion roadmap closes only with all reviewed evidence present", () => {
  const section = roadmap.match(
    /### 5\. Read-only MEXC Account Companion and shadow reconciliation — complete([\s\S]*?)(?=\n### \d+\.|\n## Active programme)/,
  )?.[1];
  assert.ok(section, "completed Account Companion section must exist before the next programme boundary");
  const completed = section.match(/^- \[x\]/gm) ?? [];
  const incomplete = section.match(/^- \[ \]/gm) ?? [];
  assert.equal(completed.length, 9);
  assert.equal(incomplete.length, 0);
  assert.doesNotMatch(section, /Advanced pending-order simulation/, "the next programme must not leak into this audit");
  assert.match(section, /MEXC_OWNER_READONLY_CREDENTIAL_ACTIVATION\.md/);
  assert.match(section, /MEXC_OWNER_CONNECTION_SHUTDOWN\.md/);
  assert.match(section, /MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW\.md/);
  assert.match(section, /did not create an order route/);
  assert.match(section, /LIVE_TRADING_ENABLED=false/);
});

test("review records an explicit read-only decision and residual limitations", () => {
  assert.match(review, /Accepted as a read-only owner Account Companion/);
  assert.match(review, /does \*\*not\*\* approve exchange execution/);
  assert.match(review, /Provider permission introspection is not available/);
  assert.match(review, /CI does not prove a deployed authenticated provider response/);
  assert.match(review, /tamper-evident, not externally anchored/);
  assert.match(review, /Server environment variables remain present in process memory/);
  assert.match(review, /The local seal does not revoke the provider key/);
  assert.match(review, /Rejection triggers/);
});

test("shutdown runbook distinguishes local seal, Render removal and provider revocation", () => {
  assert.match(shutdownRunbook, /Local emergency seal/);
  assert.match(shutdownRunbook, /Physical Render credential removal/);
  assert.match(shutdownRunbook, /Provider-side revocation/);
  assert.match(shutdownRunbook, /fails closed as sealed/);
  assert.match(shutdownRunbook, /does not contain API keys, secrets/);
});
