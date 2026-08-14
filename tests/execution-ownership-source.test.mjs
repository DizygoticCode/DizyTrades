import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ownership slice remains server-only, read-only and non-executing", () => {
  const ownership=readFileSync("app/lib/execution/internal/ownership-store.ts","utf8");
  const composition=readFileSync("app/lib/execution/internal/composition.ts","utf8");
  assert.match(ownership,/^import "server-only";/);
  assert.doesNotMatch(ownership,/apiKey|apiSecret|callerAssertion|sessionToken|executed:\s*true/);
  assert.doesNotMatch(ownership, new RegExp("method:\\s*[\\\"'](?:POST|PUT|PATCH|DELETE)"));
  assert.ok(composition.indexOf("executionOwnershipStore: ownershipStore")>=0);
  assert.match(ownership,/MEXC_PROVIDER_READBACK_MAX_AGE_MS/);
});
