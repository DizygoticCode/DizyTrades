import assert from "node:assert/strict";
import test from "node:test";

import {
  MEXC_OWNER_ACCOUNT_COMPANION_POLICY_VERSION,
  refreshOwnerMexcAccountCompanion,
} from "../app/lib/mexc-owner-account-companion.ts";

const environment = Object.freeze({
  OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "true",
  OWNER_MEXC_READONLY_API_KEY: "owner-key-123",
  OWNER_MEXC_READONLY_API_SECRET: "owner-secret-123456789",
  OWNER_MEXC_READONLY_PERMISSION_ATTESTATION:
    "account-read+trade-read;no-write/v1",
  LIVE_TRADING_ENABLED: "false",
});

function asset() {
  return {
    currency: "USDT",
    positionMargin: "12.5",
    frozenBalance: "0",
    availableBalance: "87.5",
    cashBalance: "100",
    equity: "103.25",
    unrealized: "3.25",
    bonus: "0",
  };
}

function position() {
  return {
    positionId: "1394650",
    symbol: "BTC_USDT",
    positionType: 1,
    openType: 1,
    state: 1,
    holdVol: "12.5",
    frozenVol: "0",
    closeVol: "0",
    holdAvgPrice: "60000",
    openAvgPrice: "60000",
    closeAvgPrice: "0",
    liquidatePrice: "50000",
    oim: "100",
    im: "100",
    holdFee: "0",
    realised: "0",
    adlLevel: 2,
    leverage: 20,
    createTime: 1_700_000_000_000,
    updateTime: 1_700_000_000_100,
    autoAddIm: false,
  };
}

function response(data, options = {}) {
  return new Response(
    JSON.stringify({
      success: options.success ?? true,
      code: options.code ?? 0,
      message: options.message,
      data,
    }),
    { status: options.status ?? 200 },
  );
}

function providerFetch(calls, positions = [position()]) {
  return async (url, init) => {
    const parsed = new URL(url);
    calls.push({ parsed, init });
    if (parsed.pathname === "/api/v1/private/account/assets") {
      return response([asset()]);
    }
    if (parsed.pathname === "/api/v1/private/position/open_positions") {
      return response(positions);
    }
    if (parsed.pathname === "/api/v1/private/account/risk_limit") {
      return response({
        BTC_USDT: [
          {
            level: 1,
            maxVol: "150000",
            maxLeverage: 125,
            mmr: "0.004",
            imr: "0.008",
            symbol: "BTC_USDT",
            positionType: 1,
          },
        ],
      });
    }
    throw new Error(`unexpected provider path: ${parsed.pathname}`);
  };
}

test("owner companion refreshes account then provider risk context", async () => {
  const calls = [];
  const output = await refreshOwnerMexcAccountCompanion(
    { environment },
    { now: () => 1_700_000_001_000, fetch: providerFetch(calls) },
  );

  assert.equal(output.policyVersion, MEXC_OWNER_ACCOUNT_COMPANION_POLICY_VERSION);
  assert.equal(output.account.state.status, "fresh");
  assert.equal(output.risk.status, "fresh");
  assert.equal(output.risk.informationalOnly, true);
  assert.equal(output.risk.snapshot.summary.coveredPositionCount, 1);
  assert.equal(output.risk.snapshot.positions[0].riskLimit.maxLeverage, 125);
  assert.deepEqual(
    calls.map(({ parsed }) => parsed.pathname).sort(),
    [
      "/api/v1/private/account/assets",
      "/api/v1/private/account/risk_limit",
      "/api/v1/private/position/open_positions",
    ],
  );
  for (const { init } of calls) {
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
  }
  assert.doesNotMatch(
    JSON.stringify(output),
    /owner-key-123|owner-secret-123456789|ApiKey|Signature/,
  );
});

test("no open positions skips the provider risk-limit request", async () => {
  const calls = [];
  const output = await refreshOwnerMexcAccountCompanion(
    { environment },
    { now: () => 1_700_000_001_000, fetch: providerFetch(calls, []) },
  );

  assert.equal(output.account.state.status, "fresh");
  assert.equal(output.risk.status, "not-applicable");
  assert.equal(output.risk.reason, "no-open-positions");
  assert.equal(
    calls.some(({ parsed }) => parsed.pathname.endsWith("/risk_limit")),
    false,
  );
});

test("risk-limit failure does not discard a valid account snapshot", async () => {
  const output = await refreshOwnerMexcAccountCompanion(
    { environment },
    {
      now: () => 1_700_000_001_000,
      fetch: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname === "/api/v1/private/account/assets") {
          return response([asset()]);
        }
        if (parsed.pathname === "/api/v1/private/position/open_positions") {
          return response([position()]);
        }
        return response(null, {
          success: false,
          code: 703,
          message: "Trade read permission required",
        });
      },
    },
  );

  assert.equal(output.account.state.status, "fresh");
  assert.equal(output.account.state.snapshot.positions.length, 1);
  assert.equal(output.risk.status, "unavailable");
  assert.equal(output.risk.failure.reason, "trade-read-permission");
  assert.equal(output.risk.failure.providerCode, 703);
});

test("unavailable account state blocks risk context and makes no extra request", async () => {
  let calls = 0;
  const output = await refreshOwnerMexcAccountCompanion(
    { environment: {} },
    {
      now: () => 1_700_000_001_000,
      fetch: async () => {
        calls += 1;
        throw new Error("must not fetch");
      },
    },
  );

  assert.equal(output.account.state.status, "unavailable");
  assert.equal(output.risk.status, "blocked");
  assert.equal(output.risk.reason, "account-state-not-fresh");
  assert.equal(calls, 0);
});
