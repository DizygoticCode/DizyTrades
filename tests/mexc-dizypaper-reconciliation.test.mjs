import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMexcAccountSnapshot,
} from "../app/lib/mexc-account-state-availability.ts";
import {
  buildMexcAccountStateSnapshot,
} from "../app/lib/mexc-account-state.ts";
import {
  MEXC_DIZYPAPER_RECONCILIATION_METHOD,
  MexcDizyPaperReconciliationError,
  reconcileMexcAccountWithDizyPaper,
} from "../app/lib/mexc-dizypaper-reconciliation.ts";
import {
  newManualAccount,
} from "../app/lib/manual-paper.ts";

function exchangeAsset(overrides = {}) {
  return {
    currency: "USDT",
    positionMargin: 100,
    frozenBalance: 0,
    availableBalance: 10_000,
    cashBalance: 10_000,
    equity: 10_000.1,
    unrealized: 0.1,
    bonus: 0,
    ...overrides,
  };
}

function exchangePosition(overrides = {}) {
  return {
    positionId: "1001",
    symbol: "BTC_USDT",
    positionType: 1,
    openType: 1,
    state: 1,
    holdVol: 10,
    frozenVol: 0,
    closeVol: 0,
    holdAvgPrice: 100,
    openAvgPrice: 100,
    closeAvgPrice: 0,
    liquidatePrice: 90,
    oim: 100,
    im: 100,
    holdFee: 0,
    realised: 0,
    adlLevel: 1,
    leverage: 10,
    createTime: 900_000,
    updateTime: 999_000,
    autoAddIm: false,
    ...overrides,
  };
}

function freshExchange({ assets = [exchangeAsset()], positions = [exchangePosition()] } = {}) {
  const snapshot = buildMexcAccountStateSnapshot({
    assets,
    positions,
    reads: [
      {
        endpoint: "all-assets",
        permission: "trade-read",
        requestTimeMs: 999_990,
        receivedAtMs: 999_999,
        data: assets,
      },
      {
        endpoint: "open-positions",
        permission: "trade-read",
        requestTimeMs: 999_991,
        receivedAtMs: 1_000_000,
        data: positions,
      },
    ],
  });
  return evaluateMexcAccountSnapshot(snapshot, {
    nowMs: 1_000_100,
    maxAgeMs: 10_000,
  });
}

function paperPosition(overrides = {}) {
  return {
    tradeId: "paper-1",
    marketKey: "mexc:futures:BTC_USDT",
    marketType: "futures",
    symbol: "BTC_USDT",
    side: "long",
    quantity: 0.01,
    contractVolume: 10,
    contractSize: 0.001,
    entryPrice: 100,
    leverage: 10,
    margin: 100,
    marginMode: "isolated",
    stopLoss: null,
    takeProfit: null,
    estimatedLiquidation: 90,
    entryFee: 0,
    riskPriceSource: "last",
    lastRiskPrice: 100,
    openedAt: new Date(900_000).toISOString(),
    ...overrides,
  };
}

function paperAccount(positions = { BTC_USDT: paperPosition() }) {
  return {
    ...newManualAccount(),
    positions,
    updatedAt: new Date(1_000_000).toISOString(),
  };
}

test("fresh aligned exchange and DizyPaper state reconcile deterministically", () => {
  const result = reconcileMexcAccountWithDizyPaper({
    exchangeState: freshExchange(),
    paperAccount: paperAccount(),
    marks: { BTC_USDT: 110 },
  });

  assert.equal(result.calculationMethod, MEXC_DIZYPAPER_RECONCILIATION_METHOD);
  assert.equal(result.exchangeObservedAtMs, 1_000_000);
  assert.equal(result.settlementCurrency, "USDT");
  assert.equal(result.account.exchangeAssetPresent, true);
  assert.equal(result.account.marksComplete, true);
  assert.equal(result.account.availableCash.withinTolerance, true);
  assert.equal(result.account.equity.withinTolerance, true);
  assert.equal(result.account.positionMargin.withinTolerance, true);
  assert.equal(result.account.unrealizedPnl.withinTolerance, true);
  assert.equal(result.positions.length, 1);
  assert.equal(result.positions[0].status, "aligned");
  assert.equal(result.positions[0].marginModeMatches, true);
  assert.equal(result.positions[0].leverageMatches, true);
  assert.equal(result.positions[0].contractVolume.withinTolerance, true);
  assert.equal(result.positions[0].entryPrice.withinTolerance, true);
  assert.equal(result.positions[0].margin.withinTolerance, true);
  assert.equal(result.positions[0].liquidationPrice.withinTolerance, true);
  assert.deepEqual(result.summary, {
    aligned: 1,
    different: 0,
    incomparable: 0,
    exchangeOnly: 0,
    paperOnly: 0,
    ambiguousExchange: 0,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.positions), true);
});

test("base quantity is never substituted for missing contract volume", () => {
  const account = paperAccount({
    BTC_USDT: paperPosition({ contractVolume: undefined }),
  });
  const result = reconcileMexcAccountWithDizyPaper({
    exchangeState: freshExchange(),
    paperAccount: account,
    marks: { BTC_USDT: 110 },
  });

  assert.equal(result.positions[0].status, "incomparable");
  assert.equal(result.positions[0].contractVolume.comparable, false);
  assert.equal(result.positions[0].contractVolume.paperValue, null);
  assert.match(result.positions[0].warnings[0], /base quantity is not substituted/i);
  assert.equal(result.summary.incomparable, 1);
});

test("position differences remain field-specific instead of auto-correcting", () => {
  const account = paperAccount({
    BTC_USDT: paperPosition({
      contractVolume: 9,
      entryPrice: 101,
      leverage: 5,
      margin: 90,
      marginMode: "cross",
      estimatedLiquidation: 80,
    }),
  });
  const result = reconcileMexcAccountWithDizyPaper({
    exchangeState: freshExchange(),
    paperAccount: account,
    marks: { BTC_USDT: 110 },
  });
  const position = result.positions[0];

  assert.equal(position.status, "different");
  assert.equal(position.marginModeMatches, false);
  assert.equal(position.leverageMatches, false);
  assert.equal(position.contractVolume.withinTolerance, false);
  assert.equal(position.entryPrice.withinTolerance, false);
  assert.equal(position.margin.withinTolerance, false);
  assert.equal(position.liquidationPrice.withinTolerance, false);
  assert.equal(account.positions.BTC_USDT.leverage, 5);
  assert.equal(result.summary.different, 1);
});

test("exchange-only, paper-only and ambiguous exchange identities are explicit", () => {
  const exchangeOnly = exchangePosition({
    positionId: "2001",
    symbol: "ETH_USDT",
    positionType: 2,
  });
  const ambiguous = exchangePosition({ positionId: "1002" });
  const account = paperAccount({
    BTC_USDT: paperPosition(),
    SOL_USDT: paperPosition({
      tradeId: "paper-2",
      marketKey: "mexc:futures:SOL_USDT",
      symbol: "SOL_USDT",
      side: "short",
    }),
  });
  const result = reconcileMexcAccountWithDizyPaper({
    exchangeState: freshExchange({
      positions: [exchangePosition(), ambiguous, exchangeOnly],
    }),
    paperAccount: account,
    marks: { BTC_USDT: 110, SOL_USDT: 100 },
  });

  assert.deepEqual(
    result.positions.map((position) => [position.key, position.status]),
    [
      ["BTC_USDT:long", "ambiguous-exchange"],
      ["ETH_USDT:short", "exchange-only"],
      ["SOL_USDT:short", "paper-only"],
    ],
  );
  assert.equal(result.summary.ambiguousExchange, 1);
  assert.equal(result.summary.exchangeOnly, 1);
  assert.equal(result.summary.paperOnly, 1);
});

test("missing settlement asset or marks creates unavailable comparisons, not invented values", () => {
  const result = reconcileMexcAccountWithDizyPaper({
    exchangeState: freshExchange({
      assets: [exchangeAsset({ currency: "BTC" })],
    }),
    paperAccount: paperAccount(),
    marks: {},
  });

  assert.equal(result.account.exchangeAssetPresent, false);
  assert.equal(result.account.marksComplete, false);
  assert.equal(result.account.availableCash.comparable, false);
  assert.equal(result.account.equity.comparable, false);
  assert.equal(result.account.unrealizedPnl.comparable, false);
  assert.ok(result.warnings.some((warning) => /did not return a USDT/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /marks are incomplete/i.test(warning)));
});

test("stale exchange state is rejected before reconciliation", () => {
  const staleSnapshot = buildMexcAccountStateSnapshot({
    assets: [exchangeAsset()],
    positions: [exchangePosition()],
    reads: [
      {
        endpoint: "all-assets",
        permission: "trade-read",
        requestTimeMs: 900_000,
        receivedAtMs: 900_001,
        data: [],
      },
      {
        endpoint: "open-positions",
        permission: "trade-read",
        requestTimeMs: 900_001,
        receivedAtMs: 900_002,
        data: [],
      },
    ],
  });
  const stale = evaluateMexcAccountSnapshot(staleSnapshot, {
    nowMs: 1_000_000,
    maxAgeMs: 10_000,
  });

  assert.equal(stale.status, "stale");
  assert.throws(
    () =>
      reconcileMexcAccountWithDizyPaper({
        exchangeState: stale,
        paperAccount: paperAccount(),
        marks: { BTC_USDT: 110 },
      }),
    /Fresh MEXC account state is required/i,
  );
});

test("invalid DizyPaper accounting and permissive tolerances fail closed", () => {
  const invalidAccount = {
    ...paperAccount(),
    cashBalance: 9_000,
  };
  assert.throws(
    () =>
      reconcileMexcAccountWithDizyPaper({
        exchangeState: freshExchange(),
        paperAccount: invalidAccount,
        marks: { BTC_USDT: 110 },
      }),
    (error) =>
      error instanceof MexcDizyPaperReconciliationError &&
      error.kind === "invalid-paper-account",
  );

  assert.throws(
    () =>
      reconcileMexcAccountWithDizyPaper({
        exchangeState: freshExchange(),
        paperAccount: paperAccount(),
        marks: { BTC_USDT: 110 },
        tolerance: { relative: 0.2 },
      }),
    /excessively permissive/i,
  );
});

test("reconciliation output contains observations but no credential or mutation surface", () => {
  const result = reconcileMexcAccountWithDizyPaper({
    exchangeState: freshExchange(),
    paperAccount: paperAccount(),
    marks: { BTC_USDT: 110 },
  });
  const serialised = JSON.stringify(result);
  assert.doesNotMatch(serialised, /apiKey|apiSecret|signature|credential/i);
  assert.doesNotMatch(serialised, /submit|cancel|changeLeverage|execute/i);
  assert.ok(result.warnings.some((warning) => /not automatic corrections/i.test(warning)));
});
