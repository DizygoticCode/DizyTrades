import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  simulateConfirmedSignals,
  sizeSimulatedSignalPosition,
} from "../app/lib/backtest.ts";
import { DEFAULT_RISK } from "../app/lib/config.ts";
import { auditManualPaperAccounting } from "../app/lib/manual-paper-accounting-audit.ts";
import { parseMexcContractMetadata } from "../app/lib/mexc-contract-metadata.ts";

const contract = (symbol = "BTC_USDT") => parseMexcContractMetadata({
  success: true,
  data: [{
    symbol,
    displayNameEn: `${symbol} SWAP`,
    positionOpenType: 3,
    contractSize: 1,
    minLeverage: 1,
    maxLeverage: 50,
    priceUnit: 0.01,
    volUnit: 1,
    minVol: 1,
    maxVol: 2000,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
    maintenanceMarginRate: 0.01,
    initialMarginRate: 0.02,
    riskLimitType: "BY_VOLUME",
  }],
}, symbol);

async function isolated(name, operation) {
  const prior = process.env.DATA_DIR;
  const root = await mkdtemp(join(tmpdir(), name));
  process.env.DATA_DIR = root;
  try {
    return await operation();
  } finally {
    if (prior === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prior;
    await rm(root, { recursive: true, force: true });
  }
}

function candles(count = 40) {
  return Array.from({ length: count }, (_, index) => ({
    time: 1_700_000_000 + index * 900,
    open: 100,
    high: index === count - 1 ? 106 : 101,
    low: 99,
    close: index === count - 1 ? 105 : 100,
    volume: 1000,
  }));
}

test("signal sizing enforces both maximum notional and leverage capacity", () => {
  const notionalCapped = sizeSimulatedSignalPosition({
    equity: 1000,
    entry: 100,
    riskDistance: 10,
    risk: { ...DEFAULT_RISK, riskPct: 10, maxNotional: 500, leverage: 2 },
  });
  assert.equal(notionalCapped.riskCash, 50);
  assert.equal(notionalCapped.quantity, 5);
  assert.equal(notionalCapped.notional, 500);
  assert.equal(notionalCapped.initialMargin, 250);
  assert.equal(notionalCapped.capSource, "maximum-notional");

  const leverageCapped = sizeSimulatedSignalPosition({
    equity: 1000,
    entry: 100,
    riskDistance: 10,
    risk: { ...DEFAULT_RISK, riskPct: 50, maxNotional: 100_000, leverage: 2 },
  });
  assert.equal(leverageCapped.notional, 2000);
  assert.equal(leverageCapped.initialMargin, 1000);
  assert.equal(leverageCapped.riskCash, 200);
  assert.equal(leverageCapped.capSource, "leverage-capacity");
});

test("open marked positions do not become completed wins or profit factor", () => {
  const history = candles();
  const signalTime = history.at(-2).time;
  const analysis = {
    atr: [{ time: signalTime, value: 2 }],
    tradeSignals: [{ time: signalTime, direction: "buy" }],
  };
  const summary = simulateConfirmedSignals(history, analysis, {
    ...DEFAULT_RISK,
    riskPct: 1,
    maxNotional: 1000,
    leverage: 2,
  });
  assert.equal(summary.trades, 1);
  assert.equal(summary.completedTrades, 0);
  assert.equal(summary.openTrades, 1);
  assert.equal(summary.wins, 0);
  assert.equal(summary.winRatePct, 0);
  assert.equal(summary.profitFactor, null);
  assert.equal(summary.closedTrades[0].exitReason, "MARK");
  assert.ok(summary.closedTrades[0].notional <= 1000 + 1e-8);
  assert.ok(summary.closedTrades[0].initialMargin <= 1000 + 1e-8);
  assert.ok(Math.abs(summary.endingEquity - summary.initialEquity - summary.realisedPnl - summary.markedPnl) < 1e-8);
});

test("Manual Paper cash, fees and closes reconcile across partial and final exits", () => isolated("dizy-accounting-lifecycle-", async () => {
  const {
    closeManualPosition,
    partialCloseManualPosition,
    submitManualOrder,
  } = await import("../app/lib/manual-paper.ts");
  const { validateManualPaperBackup } = await import("../app/lib/manual-paper-backup.ts");
  const user = "accounting-lifecycle";
  let account = await submitManualOrder(user, {
    idempotencyKey: "accounting-open-0001",
    symbol: "BTC_USDT",
    side: "long",
    sizeMode: "fixed-notional",
    amount: 1000,
    leverage: 10,
    marginMode: "isolated",
  }, 100, "fair", contract());
  assert.deepEqual(auditManualPaperAccounting(account).violations, []);

  account = await partialCloseManualPosition(
    user,
    "BTC_USDT",
    "accounting-partial-01",
    110,
    { percentage: 40 },
  );
  assert.deepEqual(auditManualPaperAccounting(account).violations, []);

  account = await closeManualPosition(user, "BTC_USDT", "accounting-close-0001", 105);
  const audit = auditManualPaperAccounting(account);
  assert.equal(audit.coverage, "complete-history");
  assert.deepEqual(audit.violations, []);
  assert.ok(Math.abs(audit.cashDifference) < 1e-8);
  assert.ok(Math.abs(audit.feeDifference) < 1e-8);
  assert.ok(Math.abs(audit.realisedDifference) < 1e-8);
  assert.doesNotThrow(() => validateManualPaperBackup(account, user));

  for (const [field, message] of [
    ["cashBalance", /cash balance/i],
    ["fees", /cumulative fees/i],
    ["realisedPnl", /cash balance|realised P\/L/i],
  ]) {
    const tampered = structuredClone(account);
    tampered[field] += 1;
    assert.throws(() => validateManualPaperBackup(tampered, user), message);
  }
}));

test("Manual Paper funding and reverse accounting remain reconciled", () => isolated("dizy-accounting-funding-reverse-", async () => {
  const {
    reverseManualPosition,
    submitManualOrder,
    syncManualFunding,
  } = await import("../app/lib/manual-paper.ts");
  const user = "accounting-funding-reverse";
  let account = await submitManualOrder(user, {
    idempotencyKey: "accounting-funding-open",
    symbol: "BTC_USDT",
    side: "long",
    sizeMode: "fixed-notional",
    amount: 1000,
    leverage: 10,
    marginMode: "cross",
  }, 100, "fair", contract());
  const position = account.positions.BTC_USDT;
  account = await syncManualFunding(user, "BTC_USDT", 100, "fair", undefined, [{
    symbol: "BTC_USDT",
    fundingRate: -0.001,
    settleTime: Date.parse(position.openedAt) + 1,
    source: "mexc-public-funding-history",
  }]);
  assert.deepEqual(auditManualPaperAccounting(account).violations, []);
  account = await reverseManualPosition(user, "BTC_USDT", "accounting-reverse-01", 102);
  const audit = auditManualPaperAccounting(account);
  assert.deepEqual(audit.violations, []);
  assert.equal(audit.activePositionCount, 1);
  assert.ok(Math.abs(audit.cashDifference) < 1e-8);
}));

test("Manual Paper owner IDs are rejected rather than rewritten into aliases", () => isolated("dizy-accounting-owner-", async () => {
  const { readManualAccount, resetManualAccount } = await import("../app/lib/manual-paper.ts");
  await assert.rejects(() => readManualAccount("owner!!"), /Invalid Manual Paper owner identifier/);
  await assert.rejects(() => resetManualAccount("../owner", "RESET MANUAL PAPER"), /Invalid Manual Paper owner identifier/);
}));
