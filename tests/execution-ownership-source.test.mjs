import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const text = (path) => readFileSync(path, "utf8");

test("production ownership gate is ahead of reconciliation and preserves kill-switch precedence", () => {
  const composition = text("app/lib/execution/internal/composition.ts");
  assert.ok(composition.indexOf("executionKillSwitchReason") < composition.indexOf("await proveOwnership"));
  assert.ok(composition.indexOf("await proveOwnership") < composition.indexOf("await reconcile"));
  const boundary = text("app/lib/execution/internal/boundary-service.ts");
  assert.ok(boundary.indexOf("executionOwnershipStore") < boundary.indexOf("executionReconciliationStore"));
  assert.match(boundary, /killReason \?\?=/);
});

test("ownership proof requires independent owner binding before Radar is consulted", () => {
  const ceremony = text("app/lib/execution/internal/ownership-ceremony.ts");
  assert.match(ceremony, /ownershipBindingMatches\(binding, identity\)/);
  assert.ok(ceremony.indexOf("ownershipBindingMatches(binding, identity)") < ceremony.indexOf("await readback(identity)"));
  const binding = text("app/lib/execution/internal/ownership-binding.ts");
  assert.match(binding, /EXECUTION_OWNERSHIP_USER_ID = "rob"/);
  assert.match(binding, /OWNER_MEXC_EXECUTION_ACCOUNT_ID/);
  assert.match(binding, /OWNER_MEXC_EXECUTION_ACCOUNT_BINDING_ATTESTATION/);
  assert.match(binding, /OWNER_MEXC_EXECUTION_CREDENTIAL_GENERATION/);
  assert.doesNotMatch(binding, /API_KEY|API_SECRET|decrypt|credentialFingerprint/);
});

test("ownership ceremony is server-only and has no public route or credential custody wiring", () => {
  for (const path of ["app/lib/execution/internal/ownership-binding.ts", "app/lib/execution/internal/ownership-store.ts", "app/lib/execution/internal/ownership-ceremony.ts"]) {
    const source = text(path);
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(source, /credential-custody|apiSecret|apiKey|decrypt|CREDENTIAL_CUSTODY|LIVE_TRADING_ENABLED/);
  }
  assert.doesNotMatch(text("app/lib/execution/internal/ownership-ceremony.ts"), /fetch\(|POST|PUT|PATCH|DELETE/);
});

test("MEXC Radar remains fixed-path GET-only and no executable adapter is introduced", () => {
  const readback = text("app/lib/mexc-provider-readback.ts");
  assert.match(readback, /method:\s*"GET"/);
  assert.doesNotMatch(readback, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(text("app/lib/execution/internal/adapter.ts"), /executed:\s*true/);
  assert.doesNotMatch(text("app/lib/execution/types.ts"), /executed:\s*true/);
});

test("ownership persistence contains only bounded identity, binding digest, state and timestamps", () => {
  const store = text("app/lib/execution/internal/ownership-store.ts");
  assert.match(store, /execution-ownership\.sqlite/);
  assert.match(store, /PRAGMA synchronous=FULL/);
  assert.match(store, /binding_digest/);
  assert.match(store, /proof_observed_at/);
  assert.match(store, /proof-recorded/);
  assert.doesNotMatch(store, /api.?key|api.?secret|credential|callerAssertion|sessionToken/i);
});

test("production activation and revocation require the single-use authenticated caller verifier", () => {
  const ceremony = text("app/lib/execution/internal/ownership-ceremony.ts");
  assert.match(ceremony, /verifyProductionExecutionCaller/);
  assert.match(ceremony, /activateProductionExecutionAccountOwnership/);
  assert.match(ceremony, /revokeProductionExecutionAccountOwnership/);
  assert.doesNotMatch(ceremony, /export\s+(async\s+)?function\s+clear/i);
});
