import assert from "node:assert/strict";
import test from "node:test";

import {
  MEXC_ACCOUNT_STATE_SCHEMA_VERSION,
  MexcAccountStateError,
  buildMexcAccountStateSnapshot,
  ingestMexcAccountState,
} from "../app/lib/mexc-account-state.ts";

function asset(overrides = {}) {
  return {
    currency: "USDT",
    positionMargin: "12.5000",
    frozenBalance: 0,
    availableBalance: "87.5",
    cashBalance: 100,
    equity: "103.2500",
    unrealized: "3.25",
    bonus: "0.000",
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
    holdVol: "1.000",
    frozenVol: 0,
    closeVol: "0",
    holdAvgPrice: 1217.3,
    openAvgPrice: "1217.300",
    closeAvgPrice: 0,
    liquidatePrice: "1211.200",
    oim: "0.129033800",
    im: 0.1290338,
    holdFee: "-0.0005000",
    realised: -0.0073,
    adlLevel: 2,
    leverage: 100,
    createTime: 1_609_991_676_000,
    updateTime: "1609991677000",
    autoAddIm: false,
    ...overrides,
  };
}

function reads(overrides = {}) {
  return [
    {
      endpoint: "all-assets",
      permission: "trade-read",
      requestTimeMs: 1_700_000_000_000,
      receivedAtMs: 1_700_000_000_010,
      data: null,
      ...overrides.assets,
    },
    {
      endpoint: "open-positions",
      permission: "trade-read",
      requestTimeMs: 1_700_000_000_001,
      receivedAtMs: 1_700_000_000_012,
      data: null,
      ...overrides.positions,
    },
  ];
}

test("account snapshot normalises documented asset and position fields", () => {
  const snapshot = buildMexcAccountStateSnapshot({
    assets: [asset(), asset({ currency: "BTC", equity: "1e-7" })],
    positions: [
      position(),
      position({
        positionId: "00042",
        symbol: "BTC_USDT",
        positionType: 2,
        openType: 2,
        state: 2,
        holdVol: "2.50",
        adlLevel: null,
        leverage: "25",
        autoAddIm: true,
      }),
    ],
    reads: reads(),
  });

  assert.equal(snapshot.schemaVersion, MEXC_ACCOUNT_STATE_SCHEMA_VERSION);
  assert.equal(snapshot.provider, "mexc-contract");
  assert.equal(snapshot.accountKind, "futures");
  assert.equal(snapshot.observedAtMs, 1_700_000_000_012);
  assert.deepEqual(snapshot.summary, {
    assetCount: 2,
    openPositionCount: 2,
    currencies: ["BTC", "USDT"],
    symbols: ["BTC_USDT", "ETH_USDT"],
  });

  assert.equal(snapshot.assets[0].currency, "BTC");
  assert.equal(snapshot.assets[0].equity, "0.0000001");
  assert.equal(snapshot.assets[1].positionMargin, "12.5");
  assert.equal(snapshot.assets[1].bonusBalance, "0");

  assert.equal(snapshot.positions[0].positionId, "42");
  assert.equal(snapshot.positions[0].side, "short");
  assert.equal(snapshot.positions[0].marginMode, "cross");
  assert.equal(snapshot.positions[0].state, "system-holding");
  assert.equal(snapshot.positions[0].holdVolume, "2.5");
  assert.equal(snapshot.positions[0].adlLevel, null);
  assert.equal(snapshot.positions[0].autoAddMargin, true);
  assert.equal(snapshot.positions[1].side, "long");
  assert.equal(snapshot.positions[1].marginMode, "isolated");
  assert.equal(snapshot.positions[1].holdAveragePrice, "1217.3");
  assert.equal(snapshot.positions[1].holdingFee, "-0.0005");
  assert.equal(snapshot.positions[1].realisedPnl, "-0.0073");
  assert.equal(snapshot.positions[1].updatedAtMs, 1_609_991_677_000);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.assets), true);
  assert.equal(Object.isFrozen(snapshot.positions), true);
});

test("mocked ingestion requests only assets and open positions", async () => {
  const calls = [];
  const snapshot = await ingestMexcAccountState(async (request) => {
    calls.push(request);
    if (request.endpoint === "all-assets") {
      return {
        endpoint: "all-assets",
        permission: "trade-read",
        requestTimeMs: 1_700_000_000_000,
        receivedAtMs: 1_700_000_000_010,
        data: [asset()],
      };
    }
    return {
      endpoint: "open-positions",
      permission: "trade-read",
      requestTimeMs: 1_700_000_000_001,
      receivedAtMs: 1_700_000_000_012,
      data: [position()],
    };
  });

  assert.deepEqual(calls, [
    { endpoint: "all-assets" },
    { endpoint: "open-positions" },
  ]);
  assert.equal(snapshot.assets.length, 1);
  assert.equal(snapshot.positions.length, 1);
  const serialised = JSON.stringify(snapshot);
  assert.doesNotMatch(serialised, /apiKey|apiSecret|signature|credential/i);
  assert.deepEqual(
    snapshot.provenance.reads.map((read) => read.endpoint),
    ["all-assets", "open-positions"],
  );
});

test("snapshot rejects duplicate provider identities", () => {
  assert.throws(
    () =>
      buildMexcAccountStateSnapshot({
        assets: [asset(), asset({ currency: "usdt" })],
        positions: [],
        reads: reads(),
      }),
    (error) =>
      error instanceof MexcAccountStateError &&
      error.kind === "duplicate-identity" &&
      /USDT/.test(error.message),
  );

  assert.throws(
    () =>
      buildMexcAccountStateSnapshot({
        assets: [],
        positions: [position(), position({ symbol: "BTC_USDT" })],
        reads: reads(),
      }),
    (error) =>
      error instanceof MexcAccountStateError &&
      error.kind === "duplicate-identity" &&
      /1394650/.test(error.message),
  );
});

test("snapshot rejects unsafe identities, enums, decimals and timestamps", () => {
  assert.throws(
    () =>
      buildMexcAccountStateSnapshot({
        assets: [],
        positions: [position({ positionId: Number.MAX_SAFE_INTEGER + 1 })],
        reads: reads(),
      }),
    /safe non-negative integer/i,
  );
  assert.throws(
    () =>
      buildMexcAccountStateSnapshot({
        assets: [],
        positions: [position({ state: 3 })],
        reads: reads(),
      }),
    /supported MEXC enum/i,
  );
  assert.throws(
    () =>
      buildMexcAccountStateSnapshot({
        assets: [asset({ equity: "NaN" })],
        positions: [],
        reads: reads(),
      }),
    /valid decimal/i,
  );
  assert.throws(
    () =>
      buildMexcAccountStateSnapshot({
        assets: [],
        positions: [
          position({
            createTime: 1_700_000_000_100,
            updateTime: 1_700_000_000_000,
          }),
        ],
        reads: reads(),
      }),
    /earlier than createTime/i,
  );
});

test("ingestion rejects endpoint mixups and never returns a partial snapshot", async () => {
  await assert.rejects(
    () =>
      ingestMexcAccountState(async (request) => ({
        endpoint:
          request.endpoint === "all-assets" ? "open-positions" : "all-assets",
        permission: "trade-read",
        requestTimeMs: 1_700_000_000_000,
        receivedAtMs: 1_700_000_000_001,
        data: [],
      })),
    (error) =>
      error instanceof MexcAccountStateError &&
      error.kind === "invalid-read-result",
  );

  let completedReads = 0;
  await assert.rejects(
    () =>
      ingestMexcAccountState(async (request) => {
        if (request.endpoint === "open-positions") {
          throw new Error("mock provider unavailable");
        }
        completedReads += 1;
        return {
          endpoint: "all-assets",
          permission: "trade-read",
          requestTimeMs: 1_700_000_000_000,
          receivedAtMs: 1_700_000_000_001,
          data: [asset()],
        };
      }),
    /mock provider unavailable/,
  );
  assert.equal(completedReads, 1);
});
