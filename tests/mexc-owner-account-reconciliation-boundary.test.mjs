import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("owner reconciliation remains server-only, observational and non-executable", async () => {
  const source = await readFile(
    "app/lib/mexc-owner-account-reconciliation.ts",
    "utf8",
  );

  assert.match(source, /^import "server-only";/);
  assert.match(source, /readManualAccount/);
  assert.match(source, /latestPublicRiskPrice/);
  assert.match(source, /reconcileMexcAccountWithDizyPaper/);
  assert.match(source, /decisionEligible: false/);
  assert.doesNotMatch(source, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(source, /placeOrder|submitOrder|cancelOrder|changeLeverage|transfer|withdraw/i);
  assert.doesNotMatch(
    source,
    /OWNER_MEXC_READONLY_API_KEY|OWNER_MEXC_READONLY_API_SECRET|createHmac|\bApiKey\b|\bSignature\b/,
  );
});

test("DizyAccount authorises the owner before refreshing or reconciling", async () => {
  const source = await readFile("app/account/page.tsx", "utf8");

  assert.doesNotMatch(source, /^\s*["']use client["'];/m);
  assert.match(source, /const user = await requireUser\(\)/);
  assert.match(source, /if \(user\.role !== "owner"\) redirect\("\/terminal"\)/);
  assert.match(source, /await refreshOwnerMexcAccountCompanion\(\)/);
  assert.match(source, /await reconcileOwnerMexcAccountWithDizyPaper\(/);
  assert.ok(
    source.indexOf('user.role !== "owner"') <
      source.indexOf("refreshOwnerMexcAccountCompanion()"),
  );
  assert.ok(
    source.indexOf('user.role !== "owner"') <
      source.indexOf("reconcileOwnerMexcAccountWithDizyPaper({"),
  );
  assert.match(source, /Neither account was changed/);
  assert.match(source, /never mutates MEXC or DizyPaper/);
  assert.doesNotMatch(
    source,
    /OWNER_MEXC_READONLY_API_KEY|OWNER_MEXC_READONLY_API_SECRET|createHmac|\bApiKey\b|\bSignature\b/,
  );
});
