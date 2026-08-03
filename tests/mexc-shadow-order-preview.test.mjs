import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMexcAccountSnapshot } from "../app/lib/mexc-account-state-availability.ts";
import { buildMexcAccountStateSnapshot } from "../app/lib/mexc-account-state.ts";
import {
  MEXC_SHADOW_ORDER_PREVIEW_METHOD,
  previewMexcShadowOrder,
} from "../app/lib/mexc-shadow-order-preview.ts";

function contract(overrides = {}) {
  return {
    symbol: "BTC_USDT",
    displayName: "BTC_USDT SWAP",
    contractSize: 0.001,
    minLeverage: 1,
    maxLeverage: 100,
    priceUnit: 0.1,
    volUnit: 1,
    minVol: 1,
    maxVol: 1000,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
    maintenanceMarginRate: 0.005,
    initialMarginRate: 0.01,
    positionOpenType: 3,
    riskLimitType: "BY_VOLUME",
    ...overrides,
  };
}

function position(overrides = {}) {
  return {
    positionId: "1",
    symbol: "BTC_USDT",
    positionType: 1,
    openType: 1,
    state: 1,
    holdVol: 20,
    frozenVol: 0,
    closeVol: 0,
    holdAvgPrice: 9_500,
    openAvgPrice: 9_500,
    closeAvgPrice: 0,
    liquidatePrice: 8_000,
    oim: 20,
    im: 20,
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

function accountState({ available = 1000, positions = [] } = {}) {
  const assets = [{
    currency: "USDT",
    positionMargin: 0,
    frozenBalance: 0,
    availableBalance: available,
    cashBalance: available,
    equity: available,
    unrealized: 0,
    bonus: 0,
  }];
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

function intent(overrides = {}) {
  return {
    symbol: "BTC_USDT",
    side: "long",
    marginMode: "isolated",
    leverage: 10,
    contractVolume: 10,
    executionPrice: 10_000,
    liquidityRole: "taker",
    ...overrides,
  };
}

test("calculable preview exposes estimates but no executable capability", () => {
  const preview = previewMexcShadowOrder({
    accountState: accountState(),
    contract: contract(),
    intent: intent(),
  });

  assert.equal(preview.calculationMethod, MEXC_SHADOW_ORDER_PREVIEW_METHOD);
  assert.equal(preview.hypotheticalOnly, true);
  assert.equal(preview.executable, false);
  assert.equal(preview.status, "calculable");
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.estimates.baseQuantity, 0.01);
  assert.equal(preview.estimates.notional, 100);
  assert.equal(preview.estimates.effectiveInitialMarginRate, 0.1);
  assert.equal(preview.estimates.initialMargin, 10);
  assert.equal(preview.estimates.feeRate, 0.0006);
  assert.ok(Math.abs(preview.estimates.fee - 0.06) < 1e-12);
  assert.ok(Math.abs(preview.estimates.cashRequirement - 10.06) < 1e-12);
  assert.equal(preview.accountContext.availableBalance, "1000");
  assert.equal(preview.accountContext.availableBalanceSufficient, true);
  assert.deepEqual(preview.unchecked, [
    "user-risk-tier",
    "position-mode",
    "pending-orders",
    "live-order-book",
    "actual-fill",
    "funding-between-preview-and-fill",
    "contract-api-availability",
  ]);
  const serialised = JSON.stringify(preview);
  assert.doesNotMatch(serialised, /apiKey|apiSecret|signature|httpMethod|requestBody|endpointPath/i);
  assert.equal(Object.isFrozen(preview), true);
});

test("price, volume, leverage and margin support blockers are explicit", () => {
  const preview = previewMexcShadowOrder({
    accountState: accountState(),
    contract: contract({ positionOpenType: 2 }),
    intent: intent({
      executionPrice: 10_000.05,
      contractVolume: 0.5,
      leverage: 101,
      marginMode: "isolated",
    }),
  });

  assert.equal(preview.status, "blocked");
  assert.ok(preview.blockers.includes("price-step"));
  assert.ok(preview.blockers.includes("volume-step"));
  assert.ok(preview.blockers.includes("volume-range"));
  assert.ok(preview.blockers.includes("leverage-range"));
  assert.ok(preview.blockers.includes("margin-mode-unsupported"));
});

test("insufficient balance blocks the preview without inventing account capacity", () => {
  const preview = previewMexcShadowOrder({
    accountState: accountState({ available: 5 }),
    contract: contract(),
    intent: intent(),
  });

  assert.equal(preview.status, "blocked");
  assert.equal(preview.accountContext.availableBalanceSufficient, false);
  assert.ok(preview.blockers.includes("insufficient-available-balance"));
  assert.equal(preview.estimates.cashRequirement > 5, true);
});

test("missing settlement asset blocks account comparison", () => {
  const state = accountState();
  const preview = previewMexcShadowOrder({
    accountState: state,
    contract: contract(),
    intent: intent({ settlementCurrency: "BTC" }),
  });

  assert.equal(preview.status, "blocked");
  assert.equal(preview.accountContext.availableBalance, null);
  assert.equal(preview.accountContext.availableBalanceSufficient, null);
  assert.ok(preview.blockers.includes("settlement-asset-unavailable"));
});

test("projected same-side volume and opposite-side uncertainty remain visible", () => {
  const preview = previewMexcShadowOrder({
    accountState: accountState({
      positions: [
        position({ positionId: "1", positionType: 1, holdVol: 995 }),
        position({ positionId: "2", positionType: 2, holdVol: 5 }),
      ],
    }),
    contract: contract({ maxVol: 1000 }),
    intent: intent({ contractVolume: 10 }),
  });

  assert.equal(preview.accountContext.sameSidePositionCount, 1);
  assert.equal(preview.accountContext.oppositeSidePositionCount, 1);
  assert.equal(preview.accountContext.existingSameSideContractVolume, "995");
  assert.equal(preview.accountContext.projectedSameSideContractVolume, 1005);
  assert.ok(preview.blockers.includes("contract-volume-limit"));
  assert.ok(preview.warnings.some((warning) => /position mode is not available/i.test(warning)));
});

test("maker economics are labelled illustrative", () => {
  const preview = previewMexcShadowOrder({
    accountState: accountState(),
    contract: contract(),
    intent: intent({ liquidityRole: "maker" }),
  });

  assert.equal(preview.estimates.feeRate, 0.0002);
  assert.ok(preview.warnings.some((warning) => /Maker fee is illustrative/i.test(warning)));
});

test("stale account state is rejected before preview", () => {
  const fresh = accountState();
  const stale = evaluateMexcAccountSnapshot(fresh.snapshot, {
    nowMs: 2_000_000,
    maxAgeMs: 10_000,
  });
  assert.equal(stale.status, "stale");
  assert.throws(
    () =>
      previewMexcShadowOrder({
        accountState: stale,
        contract: contract(),
        intent: intent(),
      }),
    /Fresh MEXC account state is required/i,
  );
});

test("symbol mismatch and malformed settlement identity fail closed", () => {
  const mismatch = previewMexcShadowOrder({
    accountState: accountState(),
    contract: contract(),
    intent: intent({ symbol: "ETH_USDT" }),
  });
  assert.ok(mismatch.blockers.includes("symbol-mismatch"));

  assert.throws(
    () =>
      previewMexcShadowOrder({
        accountState: accountState(),
        contract: contract(),
        intent: intent({ settlementCurrency: "../../USDT" }),
      }),
    /Settlement currency is invalid/i,
  );
});
