import assert from "node:assert/strict";
import test from "node:test";

import {
  MEXC_OWNER_ACCOUNT_SNAPSHOT_POLICY_VERSION,
  refreshOwnerMexcAccountSnapshot,
} from "../app/lib/mexc-owner-account-snapshot.ts";
import { MexcReadOnlyCredentialActivationError } from "../app/lib/mexc-readonly-credential-activation.ts";

const readyEnvironment = Object.freeze({
  OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "true",
  OWNER_MEXC_READONLY_API_KEY: "owner-key-123",
  OWNER_MEXC_READONLY_API_SECRET: "owner-secret-123456789",
  OWNER_MEXC_READONLY_PERMISSION_ATTESTATION:
    "account-read+trade-read;no-write/v1",
  LIVE_TRADING_ENABLED: "false",
});

function connectionControl(overrides = {}) {
  return Object.freeze({
    schemaVersion: "mexc-owner-connection-control/1.0.0",
    state: "active",
    generation: 0,
    updatedAtMs: null,
    reason: "initial-active",
    integrity: "missing-default",
    localPrivateReadsBlocked: false,
    privateConfigurationPresent: true,
    credentialPairPresent: true,
    permissionAttestationPresent: true,
    companionEnabledFlag: "true",
    credentialRemovalConfirmed: false,
    message: null,
    digest: null,
    ...overrides,
  });
}

function asset(overrides = {}) {
  return {
    currency: "USDT",
    positionMargin: "12.5",
    frozenBalance: "0",
    availableBalance: "87.5",
    cashBalance: "100",
    equity: "103.25",
    unrealized: "3.25",
    bonus: "0",
    ...overrides,
  };
}

function position(overrides = {}) {
  return {
    positionId: "1394650",
    symbol: "ETH_USDT",
    positionType: 1,
    openType: 1,
    state: 1,
    holdVol: "1",
    frozenVol: "0",
    closeVol: "0",
    holdAvgPrice: "1217.3",
    openAvgPrice: "1217.3",
    closeAvgPrice: "0",
    liquidatePrice: "1211.2",
    oim: "0.1290338",
    im: "0.1290338",
    holdFee: "-0.0005",
    realised: "-0.0073",
    adlLevel: 2,
    leverage: 100,
    createTime: 1_609_991_676_000,
    updateTime: 1_609_991_677_000,
    autoAddIm: false,
    ...overrides,
  };
}

function providerSuccess(data) {
  return new Response(JSON.stringify({ success: true, code: 0, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function successfulFetch(calls) {
  return async (url, init) => {
    const parsed = new URL(url);
    calls.push({ parsed, init });
    if (parsed.pathname === "/api/v1/private/account/assets") {
      return providerSuccess([asset()]);
    }
    if (parsed.pathname === "/api/v1/private/position/open_positions") {
      return providerSuccess([position()]);
    }
    throw new Error(`unexpected path: ${parsed.pathname}`);
  };
}

test("disabled owner connection returns not-configured without a private request", async () => {
  let fetchCalls = 0;
  const output = await refreshOwnerMexcAccountSnapshot(
    { environment: {} },
    {
      now: () => 1_700_000_000_000,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("must not fetch");
      },
    },
  );

  assert.equal(output.policyVersion, MEXC_OWNER_ACCOUNT_SNAPSHOT_POLICY_VERSION);
  assert.equal(output.accountScope, "owner");
  assert.equal(output.connectionControl.state, "active");
  assert.equal(output.activation.state, "disabled");
  assert.equal(output.state.status, "unavailable");
  assert.equal(output.state.failure.reason, "not-configured");
  assert.equal(fetchCalls, 0);
});

test("ready owner connection reads only balances and open positions", async () => {
  const calls = [];
  const output = await refreshOwnerMexcAccountSnapshot(
    { environment: readyEnvironment },
    {
      now: () => 1_700_000_000_000,
      fetch: successfulFetch(calls),
    },
  );

  assert.equal(output.connectionControl.localPrivateReadsBlocked, false);
  assert.equal(output.activation.readyForPrivateReads, true);
  assert.equal(output.state.status, "fresh");
  assert.equal(output.state.decisionEligible, true);
  assert.equal(output.state.snapshot.summary.assetCount, 1);
  assert.equal(output.state.snapshot.summary.openPositionCount, 1);
  assert.equal(output.state.snapshot.assets[0].availableBalance, "87.5");
  assert.equal(output.state.snapshot.positions[0].symbol, "ETH_USDT");
  assert.deepEqual(
    calls.map(({ parsed }) => parsed.pathname).sort(),
    [
      "/api/v1/private/account/assets",
      "/api/v1/private/position/open_positions",
    ],
  );
  for (const { parsed, init } of calls) {
    assert.equal(parsed.origin, "https://contract.mexc.com");
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.ApiKey, readyEnvironment.OWNER_MEXC_READONLY_API_KEY);
    assert.match(init.headers.Signature, /^[a-f0-9]{64}$/);
    assert.equal(init.headers["Recv-Window"], "10");
  }

  const serialised = JSON.stringify(output);
  assert.doesNotMatch(serialised, /owner-key-123|owner-secret-123456789/);
  assert.doesNotMatch(serialised, /ApiKey|Signature|signed headers/i);
});

test("local shutdown seal blocks before credentials are required or provider fetch is called", async () => {
  let fetchCalls = 0;
  let controlReads = 0;
  const sealed = connectionControl({
    state: "sealed",
    generation: 3,
    updatedAtMs: 1_699_999_999_000,
    reason: "owner-emergency-shutdown",
    integrity: "verified",
    localPrivateReadsBlocked: true,
    digest: "a".repeat(64),
  });
  const output = await refreshOwnerMexcAccountSnapshot(
    { environment: readyEnvironment },
    {
      now: () => 1_700_000_000_000,
      readConnectionControl: async (environment) => {
        controlReads += 1;
        assert.equal(environment.OWNER_MEXC_READONLY_API_KEY, "owner-key-123");
        return sealed;
      },
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("must not fetch");
      },
    },
  );

  assert.equal(controlReads, 1);
  assert.equal(fetchCalls, 0);
  assert.equal(output.connectionControl, sealed);
  assert.equal(output.activation.state, "disabled");
  assert.equal(output.activation.configured, false);
  assert.equal(output.activation.readyForPrivateReads, false);
  assert.equal(output.state.status, "unavailable");
  assert.equal(output.state.failure.reason, "not-configured");
  assert.doesNotMatch(JSON.stringify(output), /owner-key-123|owner-secret-123456789/);
});

test("provider permission failure becomes safe unavailable account state", async () => {
  const output = await refreshOwnerMexcAccountSnapshot(
    { environment: readyEnvironment },
    {
      now: () => 1_700_000_000_000,
      fetch: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname === "/api/v1/private/position/open_positions") {
          return new Response(
            JSON.stringify({
              success: false,
              code: 703,
              message: "Trade read permission required",
            }),
            { status: 200 },
          );
        }
        return providerSuccess([asset()]);
      },
    },
  );

  assert.equal(output.state.status, "unavailable");
  assert.equal(output.state.failure.reason, "trade-read-permission");
  assert.equal(output.state.failure.action, "reconfigure");
  assert.equal(output.state.failure.providerCode, 703);
  assert.doesNotMatch(JSON.stringify(output), /owner-key-123|owner-secret-123456789/);
});

test("failed refresh retains the previous snapshot as explicitly stale", async () => {
  let clock = 1_700_000_000_000;
  const first = await refreshOwnerMexcAccountSnapshot(
    { environment: readyEnvironment },
    { now: () => clock, fetch: successfulFetch([]) },
  );
  assert.equal(first.state.status, "fresh");

  clock += 1_000;
  const second = await refreshOwnerMexcAccountSnapshot(
    { environment: readyEnvironment, previous: first.state },
    {
      now: () => clock,
      fetch: async () => {
        throw new DOMException("timed out", "AbortError");
      },
    },
  );

  assert.equal(second.state.status, "stale");
  assert.equal(second.state.decisionEligible, false);
  assert.equal(second.state.staleReason, "refresh-failed");
  assert.equal(second.state.failure.reason, "timeout");
  assert.equal(second.state.snapshot, first.state.snapshot);
});

test("malformed owner configuration fails closed before any provider request", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      refreshOwnerMexcAccountSnapshot(
        {
          environment: {
            ...readyEnvironment,
            OWNER_MEXC_READONLY_API_SECRET: "",
          },
        },
        {
          now: () => 1_700_000_000_000,
          fetch: async () => {
            fetchCalls += 1;
            throw new Error("must not fetch");
          },
        },
      ),
    (error) =>
      error instanceof MexcReadOnlyCredentialActivationError &&
      error.kind === "incomplete-credentials",
  );
  assert.equal(fetchCalls, 0);
});
