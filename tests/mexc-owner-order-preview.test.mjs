import assert from "node:assert/strict";
import test from "node:test";

import {
  MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION,
  previewOwnerMexcOrder,
} from "../app/lib/mexc-owner-order-preview.ts";
import { newManualAccount } from "../app/lib/manual-paper.ts";

function snapshot(overrides = {}) {
  return {
    schemaVersion: "test-account-state",
    provider: "mexc-contract",
    accountKind: "futures",
    observedAtMs: 1_000_000,
    assets: [
      {
        currency: "USDT",
        positionMargin: "250",
        frozenBalance: "0",
        availableBalance: "9750",
        cashBalance: "10000",
        equity: "10000",
        unrealizedPnl: "0",
        bonusBalance: null,
      },
    ],
    positions: [],
    summary: {
      assetCount: 1,
      openPositionCount: 0,
      currencies: ["USDT"],
      symbols: [],
    },
    provenance: { reads: [] },
    ...overrides,
  };
}

function companion(state = { status: "fresh", snapshot: snapshot(), ageMs: 100 }) {
  return {
    policyVersion: "test-companion",
    accountScope: "owner",
    account: { state },
    risk: { status: "not-applicable" },
  };
}

function contract(overrides = {}) {
  return {
    symbol: "BTC_USDT",
    displayName: "BTC USDT",
    contractSize: 0.001,
    minLeverage: 1,
    maxLeverage: 100,
    priceUnit: 0.1,
    volUnit: 1,
    minVol: 1,
    maxVol: 1_000_000,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
    maintenanceMarginRate: 0.005,
    initialMarginRate: 0.01,
    positionOpenType: 3,
    riskLimitType: "BY_VOLUME",
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    symbol: "BTC_USDT",
    side: "long",
    sizeMode: "fixed-margin",
    amount: 100,
    leverage: 5,
    marginMode: "isolated",
    stopLoss: 90,
    takeProfit: 120,
    ...overrides,
  };
}

function auditEntry(kind = "hypothetical-order-preview") {
  return Object.freeze({
    schemaVersion: "mexc-owner-shadow-audit/1.0.0",
    sequence: 1,
    eventId: "event0001",
    ownerDigest: "a".repeat(64),
    recordedAtMs: 1_000_100,
    kind,
    sourcePolicyVersion: MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION,
    previousDigest: null,
    payload: Object.freeze({ stored: true }),
    digest: "b".repeat(64),
  });
}

function appendAudit(assertion = () => {}) {
  return async (userId, input) => {
    assertion(userId, input);
    return auditEntry(input.kind);
  };
}

function dependencies(overrides = {}) {
  return {
    readPaperAccount: async () => newManualAccount(),
    loadPublicMark: async () => ({ price: 100, source: "fair" }),
    loadContract: async () => contract(),
    appendAudit: appendAudit(),
    ...overrides,
  };
}

test("owner preview projects and audits a new DizyPaper position beside fresh MEXC state", async () => {
  const result = await previewOwnerMexcOrder(
    {
      userId: "rob",
      companion: companion(),
      request: request(),
    },
    {
      readPaperAccount: async (userId) => {
        assert.equal(userId, "rob");
        return newManualAccount();
      },
      loadPublicMark: async (symbol) => {
        assert.equal(symbol, "BTC_USDT");
        return { price: 100, source: "fair" };
      },
      loadContract: async (symbol) => {
        assert.equal(symbol, "BTC_USDT");
        return contract();
      },
      appendAudit: appendAudit((userId, input) => {
        assert.equal(userId, "rob");
        assert.equal(input.kind, "hypothetical-order-preview");
        assert.equal(input.payload.request.symbol, "BTC_USDT");
        assert.equal(input.payload.projectedPaper.positionMargin, 100);
        assert.equal(input.payload.executable, false);
        assert.equal(input.payload.exchangeWriteCapability, "none");
        assert.doesNotMatch(JSON.stringify(input), /apiKey|apiSecret|signature|authorization/i);
      }),
    },
  );

  assert.equal(result.policyVersion, MEXC_OWNER_ORDER_PREVIEW_POLICY_VERSION);
  assert.equal(result.status, "fresh");
  assert.equal(result.executable, false);
  assert.equal(result.exchangeWriteCapability, "none");
  assert.equal(result.decisionEligible, false);
  assert.equal(result.market.notional, 500);
  assert.equal(result.market.contractVolume, 5000);
  assert.equal(result.projectedPaper.positionMargin, 100);
  assert.equal(result.projectedPaper.entryFee, 0.3);
  assert.equal(result.projectedPaper.cashBalance, 9999.7);
  assert.equal(result.projectedPaper.availableMargin, 9899.7);
  assert.equal(result.projectedPaper.openPositionCount, 1);
  assert.equal(result.exchangeObserved.equity, "10000");
  assert.equal(result.audit.kind, "hypothetical-order-preview");
  assert.equal(Object.isFrozen(result), true);
});

test("non-fresh private state blocks before paper, public market or audit reads", async () => {
  let reads = 0;
  const result = await previewOwnerMexcOrder(
    {
      userId: "rob",
      companion: companion({ status: "stale", snapshot: snapshot(), ageMs: 60_000 }),
      request: request(),
    },
    {
      readPaperAccount: async () => {
        reads += 1;
        return newManualAccount();
      },
      loadPublicMark: async () => {
        reads += 1;
        return { price: 100, source: "fair" };
      },
      loadContract: async () => {
        reads += 1;
        return contract();
      },
      appendAudit: async () => {
        reads += 1;
        return auditEntry();
      },
    },
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "account-state-not-fresh");
  assert.equal(result.audit, null);
  assert.equal(reads, 0);
});

test("existing DizyPaper symbols are blocked rather than modelling an ambiguous add or reversal", async () => {
  const paper = newManualAccount();
  paper.positions.BTC_USDT = {
    tradeId: "paper-1",
    marketKey: "mexc:futures:BTC_USDT",
    marketType: "futures",
    symbol: "BTC_USDT",
    side: "long",
    quantity: 1,
    entryPrice: 100,
    leverage: 5,
    margin: 20,
    marginMode: "isolated",
    stopLoss: null,
    takeProfit: null,
    estimatedLiquidation: 80,
    entryFee: 0.06,
    riskPriceSource: "fair",
    lastRiskPrice: 100,
    openedAt: new Date(900_000).toISOString(),
  };

  const result = await previewOwnerMexcOrder(
    { userId: "rob", companion: companion(), request: request() },
    dependencies({ readPaperAccount: async () => paper }),
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "existing-paper-position");
  assert.equal(result.audit, null);
  assert.match(result.failure.message, /add, reduce and reversal/i);
});

test("invalid sizing, exits and insufficient paper equity fail closed", async () => {
  const badStop = await previewOwnerMexcOrder(
    { userId: "rob", companion: companion(), request: request({ stopLoss: 101 }) },
    dependencies(),
  );
  assert.equal(badStop.status, "unavailable");
  assert.equal(badStop.reason, "invalid-request");

  const excessive = await previewOwnerMexcOrder(
    { userId: "rob", companion: companion(), request: request({ amount: 20_000 }) },
    dependencies(),
  );
  assert.equal(excessive.status, "unavailable");
  assert.match(excessive.failure.message, /equity|margin/i);

  const serialised = JSON.stringify([badStop, excessive]);
  assert.doesNotMatch(serialised, /apiKey|apiSecret|signature|authorization|credential/i);
  assert.doesNotMatch(serialised, /requestMexcPrivateRead|submitManualOrder|cancel/i);
});

test("audit persistence failure blocks an otherwise valid preview", async () => {
  const result = await previewOwnerMexcOrder(
    { userId: "rob", companion: companion(), request: request() },
    dependencies({
      appendAudit: async () => {
        throw new Error("audit disk unavailable");
      },
    }),
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "audit-persistence-failed");
  assert.equal(result.audit, null);
  assert.match(result.failure.message, /audit disk unavailable/i);
});
