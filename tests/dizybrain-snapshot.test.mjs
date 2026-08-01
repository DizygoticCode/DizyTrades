import assert from "node:assert/strict";
import test from "node:test";
import { createDizyBrainSnapshot } from "../app/lib/dizybrain-snapshot.ts";

const analysis = (overrides = {}) => ({
  bias: "Bullish",
  phase: "Markup",
  scoreLong: 4,
  scoreShort: 1,
  tradeSignals: [{ time: 100, label: "BUY", direction: "buy", status: "confirmed" }],
  ...overrides,
});
const input = (overrides = {}) => ({
  analysis: analysis(),
  strategy: { requireMinConfluence: true, minConfluence: 4 },
  risk: { riskPct: 1, leverage: 2 },
  latestClosedCandleTime: 100,
  ...overrides,
});

test("creates a typed engine snapshot with checklist and explanation metadata", () => {
  const snapshot = createDizyBrainSnapshot(input());
  assert.equal(snapshot.timestamp, "1970-01-01T00:01:40.000Z");
  assert.equal(snapshot.currentDirection, "BUY");
  assert.equal(snapshot.activeConfluence, 4);
  assert.equal(snapshot.explanation.source, "closed-candle-strategy-engine");
  assert.equal(snapshot.checklist.length, 5);
});

test("qualification uses the configured threshold and current confirmed signal", () => {
  assert.equal(createDizyBrainSnapshot(input()).qualified, true);
  assert.equal(createDizyBrainSnapshot(input({ strategy: { requireMinConfluence: true, minConfluence: 5 } })).qualified, false);
});

test("BUY and SELL direction stays consistent with its confirmed signal", () => {
  const buy = createDizyBrainSnapshot(input());
  const sell = createDizyBrainSnapshot(input({
    analysis: analysis({ bias: "Bearish", scoreLong: 1, scoreShort: 5, tradeSignals: [{ time: 100, label: "SELL" }] }),
  }));
  assert.deepEqual([buy.currentDirection, buy.confirmedSignal], ["BUY", "BUY"]);
  assert.deepEqual([sell.currentDirection, sell.confirmedSignal], ["SELL", "SELL"]);
  assert.equal(sell.qualified, true);
});

test("snapshot serialization is stable JSON data", () => {
  const snapshot = createDizyBrainSnapshot(input());
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test("historical signals never contaminate the current closed candle", () => {
  const snapshot = createDizyBrainSnapshot(input({
    analysis: analysis({ tradeSignals: [{ time: 99, label: "BUY" }] }),
  }));
  assert.equal(snapshot.confirmedSignal, null);
  assert.equal(snapshot.qualified, false);
  assert.doesNotMatch(snapshot.explanation.currentSetup, /historical/i);
});
