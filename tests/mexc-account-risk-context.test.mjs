import assert from "node:assert/strict";
import test from "node:test";

import { buildMexcAccountStateSnapshot } from "../app/lib/mexc-account-state.ts";
import {
  MEXC_ACCOUNT_RISK_CONTEXT_SCHEMA_VERSION,
  MexcAccountRiskContextError,
  buildMexcAccountRiskContext,
} from "../app/lib/mexc-account-risk-context.ts";

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

function position(overrides = {}) {
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
    ...overrides,
  };
}

function account(positions = [position()]) {
  return buildMexcAccountStateSnapshot({
    assets: [asset()],
    positions,
    reads: [
      {
        endpoint: "all-assets",
        permission: "trade-read",
        requestTimeMs: 1_700_000_000_000,
        receivedAtMs: 1_700_000_000_010,
        data: null,
      },
      {
        endpoint: "open-positions",
        permission: "trade-read",
        requestTimeMs: 1_700_000_000_001,
        receivedAtMs: 1_700_000_000_012,
        data: null,
      },
    ],
  });
}

function read(data) {
  return {
    endpoint: "risk-limits",
    permission: "trade-read",
    requestTimeMs: 1_700_000_000_020,
    receivedAtMs: 1_700_000_000_030,
    data,
  };
}

function limit(overrides = {}) {
  return {
    level: 1,
    maxVol: "150000.000",
    maxLeverage: 125,
    mmr: "0.0040",
    imr: "8e-3",
    symbol: "BTC_USDT",
    positionType: 1,
    ...overrides,
  };
}

test("risk context maps provider limits to current positions", () => {
  const snapshot = buildMexcAccountRiskContext({
    accountSnapshot: account([
      position(),
      position({
        positionId: "42",
        symbol: "ETH_USDT",
        positionType: 2,
        state: 2,
        holdVol: "200",
        leverage: 50,
        adlLevel: 5,
      }),
    ]),
    read: read({
      BTC_USDT: [limit()],
      ETH_USDT: [
        limit({
          symbol: "ETH_USDT",
          positionType: 2,
          maxVol: "100",
          maxLeverage: 25,
          mmr: "0.01",
          imr: "0.02",
        }),
      ],
    }),
  });

  assert.equal(snapshot.schemaVersion, MEXC_ACCOUNT_RISK_CONTEXT_SCHEMA_VERSION);
  assert.equal(snapshot.provider, "mexc-contract");
  assert.equal(snapshot.observedAtMs, 1_700_000_000_030);
  assert.deepEqual(snapshot.summary, {
    openPositionCount: 2,
    coveredPositionCount: 2,
    missingRiskContextCount: 0,
    attentionPositionCount: 1,
    highAdlPositionCount: 1,
  });

  const btc = snapshot.positions.find((item) => item.symbol === "BTC_USDT");
  assert.equal(btc.riskLimit.maxVolume, "150000");
  assert.equal(btc.riskLimit.maintenanceMarginRate, "0.004");
  assert.equal(btc.riskLimit.initialMarginRate, "0.008");
  assert.equal(btc.leverageWithinProviderLimit, true);
  assert.equal(btc.volumeWithinProviderLimit, true);
  assert.deepEqual(btc.attentionReasons, []);

  const eth = snapshot.positions.find((item) => item.symbol === "ETH_USDT");
  assert.equal(eth.riskLimit.side, "short");
  assert.equal(eth.leverageWithinProviderLimit, false);
  assert.equal(eth.volumeWithinProviderLimit, false);
  assert.deepEqual(eth.attentionReasons, [
    "leverage-exceeds-provider-limit",
    "volume-exceeds-provider-limit",
    "high-adl-level",
    "system-holding",
  ]);
  assert.deepEqual(snapshot.interpretation, {
    informationalOnly: true,
    liquidationOracle: false,
    executionPermission: false,
  });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.positions));
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /apiKey|apiSecret|signature|authorization/i,
  );
});

test("missing provider risk context is explicit rather than invented", () => {
  const snapshot = buildMexcAccountRiskContext({
    accountSnapshot: account(),
    read: read({ ETH_USDT: [limit({ symbol: "ETH_USDT" })] }),
  });

  assert.equal(snapshot.summary.coveredPositionCount, 0);
  assert.equal(snapshot.summary.missingRiskContextCount, 1);
  assert.equal(snapshot.positions[0].riskLimit, null);
  assert.equal(snapshot.positions[0].leverageWithinProviderLimit, null);
  assert.equal(snapshot.positions[0].volumeWithinProviderLimit, null);
  assert.deepEqual(snapshot.positions[0].attentionReasons, [
    "missing-risk-context",
  ]);
});

test("risk context rejects wrong provenance and malformed provider values", () => {
  assert.throws(
    () =>
      buildMexcAccountRiskContext({
        accountSnapshot: account(),
        read: { ...read({}), endpoint: "all-assets" },
      }),
    (error) =>
      error instanceof MexcAccountRiskContextError &&
      error.kind === "invalid-read-result",
  );

  for (const malformed of [
    { BTC_USDT: [limit({ symbol: "ETH_USDT" })] },
    { BTC_USDT: [limit({ maxVol: "-1" })] },
    { BTC_USDT: [limit({ maxLeverage: 0 })] },
    { BTC_USDT: [limit(), limit()] },
  ]) {
    assert.throws(
      () =>
        buildMexcAccountRiskContext({
          accountSnapshot: account(),
          read: read(malformed),
        }),
      MexcAccountRiskContextError,
    );
  }
});

test("risk context allows a valid empty account without fabricating exposure", () => {
  const snapshot = buildMexcAccountRiskContext({
    accountSnapshot: account([]),
    read: read({}),
  });

  assert.deepEqual(snapshot.positions, []);
  assert.deepEqual(snapshot.summary, {
    openPositionCount: 0,
    coveredPositionCount: 0,
    missingRiskContextCount: 0,
    attentionPositionCount: 0,
    highAdlPositionCount: 0,
  });
});
