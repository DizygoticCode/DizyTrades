import test from "node:test";
import assert from "node:assert/strict";
import {
  legacyMarketTakerFeeSnapshot,
  mexcPublicMarketTakerFeeSnapshot,
  paperExecutionFee,
} from "../app/lib/manual-paper-fees.ts";

const contract = {
  symbol: "BTC_USDT",
  displayName: "BTCUSDT SWAP",
  contractSize: 0.001,
  minLeverage: 1,
  maxLeverage: 125,
  priceUnit: 0.1,
  volUnit: 1,
  minVol: 1,
  maxVol: 1_000_000,
  makerFeeRate: 0.0001,
  takerFeeRate: 0.0011,
  maintenanceMarginRate: 0.004,
  initialMarginRate: 0.008,
  positionOpenType: 3,
  riskLimitType: "BY_VOLUME",
};

test("public MEXC fee snapshots model immediate executions as taker fills", () => {
  const snapshot = mexcPublicMarketTakerFeeSnapshot(contract);
  assert.deepEqual(snapshot, {
    executionType: "market",
    liquidityRole: "taker",
    feeRate: 0.0011,
    feeSource: "mexc-public-contract",
    makerFeeRate: 0.0001,
    takerFeeRate: 0.0011,
  });
  assert.deepEqual(paperExecutionFee(1_000, snapshot, 0.001), {
    tradingFee: 1.1,
    liquidationPenalty: 1,
    totalFee: 2.1,
  });
});

test("legacy fee fallback remains explicit and separately labelled", () => {
  assert.deepEqual(legacyMarketTakerFeeSnapshot(0.06, 0.02), {
    executionType: "market",
    liquidityRole: "taker",
    feeRate: 0.0006,
    feeSource: "legacy-settings-fallback",
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0006,
  });
});

test("Manual Paper persists public fee provenance through open, partial close, reversal and backup", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const {
    closeManualPosition,
    partialCloseManualPosition,
    reverseManualPosition,
    submitManualOrder,
    updateManualSettings,
  } = await import("../app/lib/manual-paper.ts");
  const { validateManualPaperBackup } = await import(
    "../app/lib/manual-paper-backup.ts"
  );
  const previous = process.env.DATA_DIR;
  const root = await mkdtemp(join(tmpdir(), "dizy-paper-fees-"));
  process.env.DATA_DIR = root;
  try {
    let account = await submitManualOrder(
      "fee-owner",
      {
        idempotencyKey: "fee-open-public-0001",
        symbol: "BTC_USDT",
        side: "long",
        sizeMode: "fixed-notional",
        amount: 100,
        leverage: 10,
      },
      100,
      "fair",
      contract,
    );
    const entry = account.fills.at(-1);
    assert.equal(entry.executionType, "market");
    assert.equal(entry.liquidityRole, "taker");
    assert.equal(entry.feeSource, "mexc-public-contract");
    assert.equal(entry.feeRate, contract.takerFeeRate);
    assert.equal(entry.makerFeeRate, contract.makerFeeRate);
    assert.ok(Math.abs(entry.tradingFee - entry.notional * contract.takerFeeRate) < 1e-12);
    assert.equal(entry.liquidationPenalty, 0);
    assert.equal(account.positions.BTC_USDT.feeSource, "mexc-public-contract");

    await updateManualSettings("fee-owner", {
      commissionPct: 0.5,
      makerCommissionPct: 0.4,
    });
    account = await partialCloseManualPosition(
      "fee-owner",
      "BTC_USDT",
      "fee-partial-close-001",
      101,
      { percentage: 25 },
    );
    const partial = account.fills.at(-1);
    assert.equal(partial.feeSource, "mexc-public-contract");
    assert.equal(partial.feeRate, contract.takerFeeRate);
    assert.ok(Math.abs(partial.tradingFee - partial.notional * contract.takerFeeRate) < 1e-12);

    account = await reverseManualPosition(
      "fee-owner",
      "BTC_USDT",
      "fee-reverse-public-01",
      102,
    );
    const reverseFills = account.fills.slice(-2);
    assert.deepEqual(
      reverseFills.map((fill) => [fill.liquidityRole, fill.feeSource, fill.feeRate]),
      [
        ["taker", "mexc-public-contract", contract.takerFeeRate],
        ["taker", "mexc-public-contract", contract.takerFeeRate],
      ],
    );
    assert.equal(account.positions.BTC_USDT.feeSource, "mexc-public-contract");

    account = await closeManualPosition(
      "fee-owner",
      "BTC_USDT",
      "fee-final-close-0001",
      103,
    );
    const finalClose = account.fills.at(-1);
    assert.equal(finalClose.feeSource, "mexc-public-contract");
    assert.equal(finalClose.feeRate, contract.takerFeeRate);

    const restored = validateManualPaperBackup(account, "fee-owner");
    assert.equal(restored.fills.at(-1).feeSource, "mexc-public-contract");
    assert.equal(restored.fills.at(-1).tradingFee, finalClose.tradingFee);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
