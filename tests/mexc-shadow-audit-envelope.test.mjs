import assert from "node:assert/strict";
import test from "node:test";

import {
  createMexcAccountNotConfiguredState,
} from "../app/lib/mexc-account-state-availability.ts";
import {
  appendMexcShadowAuditEvent,
  verifyMexcShadowAuditChain,
} from "../app/lib/mexc-shadow-audit.ts";

function event() {
  return appendMexcShadowAuditEvent({
    previous: null,
    scopeId: "owner:rob",
    occurredAtMs: 1_000_001,
    source: {
      sourceType: "account-state",
      state: createMexcAccountNotConfiguredState(1_000_000),
    },
  });
}

test("valid event contains exactly the approved top-level envelope", () => {
  const value = event();
  assert.deepEqual(Object.keys(value).sort(), [
    "eventHash",
    "eventId",
    "occurredAtMs",
    "payload",
    "previousHash",
    "schemaVersion",
    "scopeDigest",
    "sequence",
  ]);
  assert.equal(verifyMexcShadowAuditChain([value]).valid, true);
});

test("verifier rejects unhashed top-level passengers", () => {
  const value = event();
  for (const passenger of [
    { apiKey: "forbidden" },
    { balance: "1000" },
    { rawProviderMessage: "private detail" },
  ]) {
    const verification = verifyMexcShadowAuditChain([
      { ...value, ...passenger },
    ]);
    assert.equal(verification.valid, false);
    assert.ok(
      verification.errors.some((error) => /envelope fields are invalid/i.test(error)),
    );
  }
});
