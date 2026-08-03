import assert from "node:assert/strict";
import test from "node:test";

import {
  MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION,
  MexcAccountDecisionStateError,
  classifyMexcAccountFailure,
  createMexcAccountNotConfiguredState,
  evaluateMexcAccountSnapshot,
  requireFreshMexcAccountSnapshot,
  transitionMexcAccountAvailability,
} from "../app/lib/mexc-account-state-availability.ts";
import {
  MexcAccountStateError,
  buildMexcAccountStateSnapshot,
} from "../app/lib/mexc-account-state.ts";
import {
  MexcPrivateReadOnlyError,
} from "../app/lib/mexc-private-readonly.ts";

function snapshot(observedAtMs) {
  return buildMexcAccountStateSnapshot({
    assets: [],
    positions: [],
    reads: [
      {
        endpoint: "all-assets",
        permission: "trade-read",
        requestTimeMs: observedAtMs - 2,
        receivedAtMs: observedAtMs - 1,
        data: [],
      },
      {
        endpoint: "open-positions",
        permission: "trade-read",
        requestTimeMs: observedAtMs - 1,
        receivedAtMs: observedAtMs,
        data: [],
      },
    ],
  });
}

test("snapshot is fresh through the exact age boundary and stale after it", () => {
  const account = snapshot(1_000_000);
  const fresh = evaluateMexcAccountSnapshot(account, {
    nowMs: 1_010_000,
    maxAgeMs: 10_000,
  });
  assert.equal(fresh.policyVersion, MEXC_ACCOUNT_AVAILABILITY_POLICY_VERSION);
  assert.equal(fresh.status, "fresh");
  assert.equal(fresh.decisionEligible, true);
  assert.equal(fresh.ageMs, 10_000);
  assert.equal(fresh.snapshot, account);
  assert.equal(fresh.failure, null);

  const stale = evaluateMexcAccountSnapshot(account, {
    nowMs: 1_010_001,
    maxAgeMs: 10_000,
  });
  assert.equal(stale.status, "stale");
  assert.equal(stale.decisionEligible, false);
  assert.equal(stale.staleReason, "age-limit");
  assert.equal(stale.staleSinceMs, 1_010_001);
  assert.equal(stale.snapshot, account);
});

test("small future skew is tolerated but untrusted future state is unavailable", () => {
  const tolerated = evaluateMexcAccountSnapshot(snapshot(1_002_000), {
    nowMs: 1_000_000,
    maxAgeMs: 10_000,
    maxFutureSkewMs: 2_000,
  });
  assert.equal(tolerated.status, "fresh");
  assert.equal(tolerated.ageMs, 0);

  const rejected = evaluateMexcAccountSnapshot(snapshot(1_002_001), {
    nowMs: 1_000_000,
    maxAgeMs: 10_000,
    maxFutureSkewMs: 2_000,
  });
  assert.equal(rejected.status, "unavailable");
  assert.equal(rejected.failure.reason, "clock-skew");
  assert.equal(rejected.failure.action, "code-review");
  assert.equal(rejected.snapshot, null);
});

test("failed refresh immediately makes retained state stale and decision-ineligible", () => {
  const account = snapshot(2_000_000);
  const previous = evaluateMexcAccountSnapshot(account, {
    nowMs: 2_001_000,
    maxAgeMs: 10_000,
  });
  const stale = transitionMexcAccountAvailability({
    previous,
    outcome: {
      ok: false,
      error: new MexcPrivateReadOnlyError(
        "timeout",
        "provider detail must not escape",
      ),
    },
    policy: { nowMs: 2_002_000, maxAgeMs: 10_000 },
  });

  assert.equal(stale.status, "stale");
  assert.equal(stale.staleReason, "refresh-failed");
  assert.equal(stale.staleSinceMs, 2_002_000);
  assert.equal(stale.snapshot, account);
  assert.equal(stale.decisionEligible, false);
  assert.equal(stale.failure.reason, "timeout");
  assert.equal(stale.failure.action, "retry");
  assert.equal(stale.failure.message.includes("provider detail"), false);
});

test("a repeated refresh failure preserves the original stale transition time", () => {
  const account = snapshot(3_000_000);
  const fresh = evaluateMexcAccountSnapshot(account, {
    nowMs: 3_001_000,
    maxAgeMs: 10_000,
  });
  const firstFailure = transitionMexcAccountAvailability({
    previous: fresh,
    outcome: {
      ok: false,
      error: new MexcPrivateReadOnlyError("rate-limit", "limited", 510),
    },
    policy: { nowMs: 3_002_000, maxAgeMs: 10_000 },
  });
  const secondFailure = transitionMexcAccountAvailability({
    previous: firstFailure,
    outcome: {
      ok: false,
      error: new MexcPrivateReadOnlyError("provider", "down", 500),
    },
    policy: { nowMs: 3_005_000, maxAgeMs: 10_000 },
  });

  assert.equal(secondFailure.status, "stale");
  assert.equal(secondFailure.staleSinceMs, 3_002_000);
  assert.equal(secondFailure.ageMs, 5_000);
  assert.equal(secondFailure.failure.reason, "provider");
  assert.equal(secondFailure.failure.providerCode, 500);
});

test("failed refresh without retained data is unavailable", () => {
  const unavailable = transitionMexcAccountAvailability({
    previous: null,
    outcome: {
      ok: false,
      error: new MexcPrivateReadOnlyError(
        "authentication",
        "bad key value must not escape",
        401,
      ),
    },
    policy: { nowMs: 4_000_000, maxAgeMs: 10_000 },
  });

  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.decisionEligible, false);
  assert.equal(unavailable.snapshot, null);
  assert.equal(unavailable.failure.reason, "authentication");
  assert.equal(unavailable.failure.action, "reconfigure");
  assert.equal(unavailable.failure.providerCode, 401);
  assert.equal(unavailable.failure.message.includes("bad key"), false);
});

test("provider and schema failures retain distinct recovery actions", () => {
  const cases = [
    ["account-read-permission-required", 701, "account-read-permission", "reconfigure"],
    ["trade-read-permission-required", 703, "trade-read-permission", "reconfigure"],
    ["write-permission-required", 704, "write-permission-rejected", "security-review"],
    ["ip-whitelist", 406, "ip-whitelist", "reconfigure"],
    ["rate-limit", 510, "rate-limit", "retry"],
    ["stale-request", 513, "stale-request", "retry"],
    ["invalid-response", null, "invalid-response", "code-review"],
  ];
  for (const [kind, code, reason, action] of cases) {
    const failure = classifyMexcAccountFailure(
      new MexcPrivateReadOnlyError(kind, "untrusted provider message", code),
      5_000_000,
    );
    assert.equal(failure.reason, reason);
    assert.equal(failure.action, action);
    assert.equal(failure.providerCode, code);
    assert.equal(failure.message.includes("untrusted"), false);
  }

  const schemaFailure = classifyMexcAccountFailure(
    new MexcAccountStateError("invalid-position", "raw schema detail"),
    5_000_001,
  );
  assert.equal(schemaFailure.reason, "schema");
  assert.equal(schemaFailure.action, "code-review");
  assert.equal(schemaFailure.providerCode, null);
  assert.equal(schemaFailure.message.includes("raw schema"), false);
});

test("not-configured is explicit and a successful refresh recovers to fresh", () => {
  const initial = createMexcAccountNotConfiguredState(6_000_000);
  assert.equal(initial.status, "unavailable");
  assert.equal(initial.failure.reason, "not-configured");
  assert.equal(initial.failure.action, "reconfigure");

  const recovered = transitionMexcAccountAvailability({
    previous: initial,
    outcome: { ok: true, snapshot: snapshot(6_001_000) },
    policy: { nowMs: 6_002_000, maxAgeMs: 10_000 },
  });
  assert.equal(recovered.status, "fresh");
  assert.equal(recovered.decisionEligible, true);
  assert.equal(recovered.failure, null);
});

test("decision helper returns only fresh snapshots", () => {
  const account = snapshot(7_000_000);
  const fresh = evaluateMexcAccountSnapshot(account, {
    nowMs: 7_001_000,
    maxAgeMs: 10_000,
  });
  assert.equal(requireFreshMexcAccountSnapshot(fresh), account);

  const stale = evaluateMexcAccountSnapshot(account, {
    nowMs: 7_020_000,
    maxAgeMs: 10_000,
  });
  assert.throws(
    () => requireFreshMexcAccountSnapshot(stale),
    (error) =>
      error instanceof MexcAccountDecisionStateError &&
      error.status === "stale" &&
      error.reason === "stale",
  );

  const unavailable = createMexcAccountNotConfiguredState(7_020_001);
  assert.throws(
    () => requireFreshMexcAccountSnapshot(unavailable),
    (error) =>
      error instanceof MexcAccountDecisionStateError &&
      error.status === "unavailable" &&
      error.reason === "not-configured",
  );
});

test("freshness policy rejects unsafe or excessively permissive timing", () => {
  const account = snapshot(8_000_000);
  assert.throws(
    () =>
      evaluateMexcAccountSnapshot(account, {
        nowMs: 0,
        maxAgeMs: 10_000,
      }),
    /nowMs must be a positive safe integer/i,
  );
  assert.throws(
    () =>
      evaluateMexcAccountSnapshot(account, {
        nowMs: 8_001_000,
        maxAgeMs: 300_001,
      }),
    /five minutes/i,
  );
  assert.throws(
    () =>
      evaluateMexcAccountSnapshot(account, {
        nowMs: 8_001_000,
        maxAgeMs: 10_000,
        maxFutureSkewMs: 30_001,
      }),
    /thirty seconds/i,
  );
});
