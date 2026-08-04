import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMexcAccountSnapshot,
} from "../app/lib/mexc-account-state-availability.ts";
import {
  buildMexcAccountStateSnapshot,
} from "../app/lib/mexc-account-state.ts";
import {
  MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION,
  reconcileOwnerMexcAccountWithDizyPaper,
} from "../app/lib/mexc-owner-account-reconciliation.ts";
import { newManualAccount } from "../app/lib/manual-paper.ts";

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

function exchangeState({ nowMs = 1_000_100, receivedAtMs = 1_000_000 } = {}) {
  const assets = [exchangeAsset()];
  const positions = [exchangePosition()];
  const snapshot = buildMexcAccountStateSnapshot({
    assets,
    positions,
    reads: [
      {
        endpoint: "all-assets",
        permission: "trade-read",
        requestTimeMs: receivedAtMs - 10,
        receivedAtMs: receivedAtMs - 1,
        data: assets,
      },
      {
        endpoint: "open-positions",
        permission: "trade-read",
        requestTimeMs: receivedAtMs - 9,
        receivedAtMs,
        data: positions,
      },
    ],
  });
  return evaluateMexcAccountSnapshot(snapshot, { nowMs, maxAgeMs: 10_000 });
}

function companion(state) {
  return {
    policyVersion: "test-companion",
    accountScope: "owner",
    account: { state },
    risk: { status: "not-applicable" },
  };
}

function paperAccount() {
  return {
    ...newManualAccount(),
    positions: {
      BTC_USDT: {
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
        riskPriceSource: "fair",
        lastRiskPrice: 109,
        openedAt: new Date(900_000).toISOString(),
      },
    },
    updatedAt: new Date(1_000_000).toISOString(),
  };
}

function auditEntry(kind = "account-reconciliation") {
  return Object.freeze({
    schemaVersion: "mexc-owner-shadow-audit/1.0.0",
    sequence: 1,
    eventId: "event0001",
    ownerDigest: "a".repeat(64),
    recordedAtMs: 1_000_200,
    kind,
    sourcePolicyVersion: MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION,
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

test("owner coordinator reconciles fresh MEXC state with the stored DizyPaper account", async () => {
  const previousMarks = [];
  const result = await reconcileOwnerMexcAccountWithDizyPaper(
    {
      userId: "rob",
      companion: companion(exchangeState()),
    },
    {
      readPaperAccount: async (userId) => {
        assert.equal(userId, "rob");
        return paperAccount();
      },
      loadPublicMark: async (symbol, previous) => {
        previousMarks.push([symbol, previous]);
        return { price: 110, source: "fair" };
      },
      appendAudit: appendAudit((userId, input) => {
        assert.equal(userId, "rob");
        assert.equal(input.kind, "account-reconciliation");
        assert.equal(input.payload.accountSnapshot.assets[0].currency, "USDT");
        assert.equal(input.payload.reconciliation.summary.aligned, 1);
        assert.doesNotMatch(JSON.stringify(input), /apiKey|apiSecret|signature|authorization/i);
      }),
    },
  );

  assert.equal(result.policyVersion, MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION);
  assert.equal(result.status, "fresh");
  assert.equal(result.displayEligible, true);
  assert.equal(result.decisionEligible, false);
  assert.equal(result.report.summary.aligned, 1);
  assert.equal(result.report.account.equity.withinTolerance, true);
  assert.deepEqual(previousMarks, [["BTC_USDT", 109]]);
  assert.deepEqual(result.marks, [
    {
      symbol: "BTC_USDT",
      status: "fresh",
      price: 110,
      source: "fair",
      message: null,
    },
  ]);
  assert.equal(result.paperAccount.openPositionCount, 1);
  assert.equal(result.audit.kind, "account-reconciliation");
  assert.equal(Object.isFrozen(result), true);
});

test("missing public marks remain explicit without blocking audited position reconciliation", async () => {
  const result = await reconcileOwnerMexcAccountWithDizyPaper(
    {
      userId: "rob",
      companion: companion(exchangeState()),
    },
    {
      readPaperAccount: async () => paperAccount(),
      loadPublicMark: async () => {
        throw new Error("ticker temporarily unavailable");
      },
      appendAudit: appendAudit(),
    },
  );

  assert.equal(result.status, "fresh");
  assert.equal(result.report.positions[0].status, "aligned");
  assert.equal(result.report.account.marksComplete, false);
  assert.equal(result.report.account.equity.comparable, false);
  assert.equal(result.marks[0].status, "unavailable");
  assert.match(result.marks[0].message, /ticker temporarily unavailable/i);
  assert.equal(result.audit.sequence, 1);
});

test("non-fresh MEXC state blocks before paper storage, marks or audit are touched", async () => {
  let paperReads = 0;
  let markReads = 0;
  let auditWrites = 0;
  const stale = exchangeState({ nowMs: 2_000_000, receivedAtMs: 1_000_000 });
  assert.equal(stale.status, "stale");

  const result = await reconcileOwnerMexcAccountWithDizyPaper(
    { userId: "rob", companion: companion(stale) },
    {
      readPaperAccount: async () => {
        paperReads += 1;
        return paperAccount();
      },
      loadPublicMark: async () => {
        markReads += 1;
        return { price: 110, source: "fair" };
      },
      appendAudit: async () => {
        auditWrites += 1;
        return auditEntry();
      },
    },
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "account-state-not-fresh");
  assert.equal(paperReads, 0);
  assert.equal(markReads, 0);
  assert.equal(auditWrites, 0);
});

test("paper-account, reconciliation and audit failures are safe and credential-free", async () => {
  const unavailable = await reconcileOwnerMexcAccountWithDizyPaper(
    { userId: "rob", companion: companion(exchangeState()) },
    {
      readPaperAccount: async () => {
        throw new Error("paper file unavailable");
      },
      appendAudit: appendAudit(),
    },
  );
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.failure.reason, "paper-account-unavailable");

  const invalid = paperAccount();
  invalid.cashBalance = 9_000;
  const failed = await reconcileOwnerMexcAccountWithDizyPaper(
    { userId: "rob", companion: companion(exchangeState()) },
    {
      readPaperAccount: async () => invalid,
      loadPublicMark: async () => ({ price: 110, source: "fair" }),
      appendAudit: appendAudit(),
    },
  );
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.failure.reason, "reconciliation-failed");

  const auditFailed = await reconcileOwnerMexcAccountWithDizyPaper(
    { userId: "rob", companion: companion(exchangeState()) },
    {
      readPaperAccount: async () => paperAccount(),
      loadPublicMark: async () => ({ price: 110, source: "fair" }),
      appendAudit: async () => {
        throw new Error("audit disk unavailable");
      },
    },
  );
  assert.equal(auditFailed.status, "unavailable");
  assert.equal(auditFailed.failure.reason, "audit-persistence-failed");

  const serialised = JSON.stringify([unavailable, failed, auditFailed]);
  assert.doesNotMatch(serialised, /apiKey|apiSecret|signature|authorization|credential/i);
  assert.doesNotMatch(serialised, /submit|cancel|execute|changeLeverage/i);
});
