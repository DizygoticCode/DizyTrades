import test from "node:test";
import assert from "node:assert/strict";

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
  makerFeeRate: 0.0002,
  takerFeeRate: 0.0006,
  maintenanceMarginRate: 0.004,
  initialMarginRate: 0.008,
  positionOpenType: 3,
  riskLimitType: "BY_VOLUME",
};
const depth = (bids, asks) => {
  const receivedAt = Date.now();
  return {
    snapshot: {
      symbol: "BTC_USDT",
      version: 91,
      engineTimeMs: receivedAt,
      bids,
      asks,
    },
    receivedAt,
    diagnostic: {
      snapshotAgeMs: 0,
      consecutiveFailures: 0,
      lastError: null,
      sourceMode: "REST FALLBACK",
      snapshotComplete: true,
    },
  };
};

test("backup restore rejects exit evidence that no longer reconciles to the original position", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { submitManualOrder, closeManualPosition } = await import(
    "../app/lib/manual-paper.ts"
  );
  const { validateManualPaperBackup } = await import(
    "../app/lib/manual-paper-backup.ts"
  );
  const previous = process.env.DATA_DIR;
  const root = await mkdtemp(join(tmpdir(), "dizy-paper-exit-evidence-"));
  process.env.DATA_DIR = root;
  try {
    let account = await submitManualOrder(
      "exit-evidence-owner",
      {
        idempotencyKey: "exit-evidence-open-01",
        symbol: "BTC_USDT",
        side: "long",
        sizeMode: "fixed-notional",
        amount: 500,
        leverage: 10,
      },
      100,
      "fair",
      contract,
      undefined,
      depth(
        [{ price: 99.9, orderCount: 1, contractQuantity: 20_000 }],
        [{ price: 100.1, orderCount: 1, contractQuantity: 20_000 }],
      ),
    );
    account = await closeManualPosition(
      "exit-evidence-owner",
      "BTC_USDT",
      "exit-evidence-close1",
      100,
      depth(
        [{ price: 99.9, orderCount: 1, contractQuantity: 2_000 }],
        [{ price: 100.1, orderCount: 1, contractQuantity: 20_000 }],
      ),
      contract,
    );
    const tampered = structuredClone(account);
    tampered.fills.at(-1).exitDepthFill.remainingPositionContractVolume += 1;
    assert.throws(
      () => validateManualPaperBackup(tampered, "exit-evidence-owner"),
      /position volume does not reconcile/,
    );
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
