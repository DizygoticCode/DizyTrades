import assert from "node:assert/strict";
import test from "node:test";
import { livePaperSnapshot } from "../app/lib/paper-performance.ts";

test("live mark updates preserve realised and marked PnL decomposition", () => {
  const open = {
    id: "open-long",
    direction: "long",
    signalTime: 1,
    entryTime: 2,
    exitTime: 3,
    entry: 100,
    exit: 102,
    stop: 98,
    target: 104,
    positionSize: 10,
    riskCash: 20,
    notional: 1000,
    initialMargin: 500,
    pnl: 15,
    pnlPct: 1.5,
    result: "win",
    exitReason: "MARK",
    remainingQuantity: 5,
    realisedPnl: 5,
  };
  const confirmed = {
    initialEquity: 1000,
    endingEquity: 1015,
    returnPct: 1.5,
    maxDrawdownPct: 0,
    trades: 1,
    completedTrades: 0,
    openTrades: 1,
    realisedPnl: 5,
    markedPnl: 10,
    wins: 0,
    winRatePct: 0,
    profitFactor: null,
    closedTrades: [open],
  };

  const snapshot = livePaperSnapshot(confirmed, 104, true);
  assert.equal(snapshot.liveMtm, true);
  assert.equal(snapshot.realisedPnl, 5);
  assert.equal(snapshot.openTrade.pnl, 25);
  assert.equal(snapshot.endingEquity, 1025);
  assert.equal(snapshot.pnl, 25);
  assert.equal(snapshot.markedPnl, 20);
  assert.ok(Math.abs(snapshot.endingEquity - snapshot.initialEquity - snapshot.realisedPnl - snapshot.markedPnl) < 1e-8);
});

test("disabled live marking preserves the confirmed decomposition", () => {
  const confirmed = {
    initialEquity: 1000,
    endingEquity: 1005,
    returnPct: 0.5,
    maxDrawdownPct: 0,
    trades: 0,
    completedTrades: 0,
    openTrades: 0,
    realisedPnl: 5,
    markedPnl: 0,
    wins: 0,
    winRatePct: 0,
    profitFactor: null,
    closedTrades: [],
  };
  const snapshot = livePaperSnapshot(confirmed, 110, false);
  assert.equal(snapshot.liveMtm, false);
  assert.equal(snapshot.realisedPnl, 5);
  assert.equal(snapshot.markedPnl, 0);
  assert.equal(snapshot.pnl, 5);
});
