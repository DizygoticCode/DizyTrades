import assert from "node:assert/strict";
import test from "node:test";
import {
  clearDizyQuantOrderFlowRuntime,
  DIZYQUANT_ORDER_FLOW_RUNTIME_MAX_MARKETS,
  dizyQuantOrderFlowRuntimeDiagnostics,
  observeDizyQuantOrderFlowRuntime,
  readDizyQuantOrderFlowRuntimeEvidence,
  subscribeDizyQuantOrderFlowRuntime,
} from "../app/lib/dizyquant/order-flow-runtime.ts";
import { adaptLiveOrderFlow } from "../app/lib/order-flow/intelligence-adapter.ts";

const BASE = 20_000_000;

const book = (shift = 0) => ({
  valid: true,
  version: 1,
  bids: [
    { price: 99.9 + shift, orderCount: 1, contractQuantity: 10 },
    { price: 99.8 + shift, orderCount: 1, contractQuantity: 6 },
  ],
  asks: [
    { price: 100.1 + shift, orderCount: 1, contractQuantity: 9 },
    { price: 100.2 + shift, orderCount: 1, contractQuantity: 5 },
  ],
});

function runtimeInput({
  index = 0,
  marketKey = "mexc:futures:BTC_USDT",
  symbol = "BTC_USDT",
  versionGaps = 0,
  sequenceContinuous = true,
  sourceTimestampKnown = true,
  recovering = false,
  sourceMode = "FULL DEPTH WS",
  recentTrades,
} = {}) {
  const timestampMs = BASE + index * 1_000;
  return {
    envelope: {
      snapshot: {
        symbol,
        version: index + 1,
        engineTimeMs: timestampMs,
        bids: book().bids,
        asks: book().asks,
      },
      receivedAt: timestampMs + 50,
      diagnostic: {
        snapshotAgeMs: 50,
        consecutiveFailures: 0,
        lastError: null,
        sourceMode,
        versionGaps,
        sequenceKnown: true,
        sequenceContinuous,
        snapshotComplete: true,
        recovering,
        sourceTimestampKnown,
      },
    },
    book: book(index % 2 ? 0 : 0),
    marketKey,
    marketType: "futures",
    contractSize: 1,
    tickSize: 0.1,
    recentTrades: recentTrades ?? [
      {
        id: `trade-${index}`,
        timeMs: timestampMs - 250,
        price: 100,
        quantity: 1 + (index % 3),
        side: index % 2 ? "buy-aggressor" : "sell-aggressor",
      },
    ],
  };
}

test("proven depth accumulates fresh Replay-grade liquidity evidence while trade continuity stays unproven", () => {
  clearDizyQuantOrderFlowRuntime();
  let notifications = 0;
  const unsubscribe = subscribeDizyQuantOrderFlowRuntime(() => { notifications += 1; });
  for (let index = 0; index <= 70; index += 1) {
    observeDizyQuantOrderFlowRuntime(runtimeInput({ index }));
  }
  unsubscribe();
  const latest = readDizyQuantOrderFlowRuntimeEvidence("mexc:futures:BTC_USDT");
  assert.ok(latest);
  assert.equal(latest.researchOnly, true);
  assert.equal(latest.signalEligible, false);
  assert.equal(latest.executionEligible, false);
  assert.equal(latest.evidence.snapshots.liquidityMigration.availability, "fresh");
  assert.equal(latest.evidence.snapshots.liquidityMigration.sequenceContinuous, true);
  assert.equal(latest.evidence.snapshots.liquidityMigration.hasGaps, false);
  assert.equal(latest.evidence.snapshots.resilience, null);
  assert.equal(latest.evidence.tradeSequenceContinuous, null);
  assert.notEqual(latest.evidence.snapshots.aggressiveFlow.availability, "fresh");
  assert.ok(notifications > 0);
});

test("a depth version gap resets the prior research window instead of carrying continuity across recovery", () => {
  clearDizyQuantOrderFlowRuntime();
  for (let index = 0; index <= 35; index += 1) {
    observeDizyQuantOrderFlowRuntime(runtimeInput({ index }));
  }
  const before = readDizyQuantOrderFlowRuntimeEvidence("mexc:futures:BTC_USDT");
  assert.equal(before?.evidence.snapshots.liquidityMigration.availability, "fresh");
  const after = observeDizyQuantOrderFlowRuntime(runtimeInput({ index: 36, versionGaps: 1 }));
  assert.ok(after);
  assert.notEqual(after.evidence.snapshots.liquidityMigration.availability, "fresh");
  assert.equal(after.evidence.depthHasGaps, true);
});

test("recovering retained books and unproven exchange timestamps never become research publications", () => {
  clearDizyQuantOrderFlowRuntime();
  for (let index = 0; index <= 35; index += 1) {
    observeDizyQuantOrderFlowRuntime(runtimeInput({ index }));
  }
  assert.ok(readDizyQuantOrderFlowRuntimeEvidence("mexc:futures:BTC_USDT"));
  const recovering = observeDizyQuantOrderFlowRuntime(runtimeInput({
    index: 36,
    recovering: true,
    sourceMode: "RECONNECTING — LAST BOOK RETAINED",
    sequenceContinuous: null,
  }));
  assert.equal(recovering, null);
  assert.equal(readDizyQuantOrderFlowRuntimeEvidence("mexc:futures:BTC_USDT"), null);

  clearDizyQuantOrderFlowRuntime();
  const unknownTimestamp = observeDizyQuantOrderFlowRuntime(runtimeInput({
    sourceTimestampKnown: false,
  }));
  assert.equal(unknownTimestamp, null);
  assert.equal(dizyQuantOrderFlowRuntimeDiagnostics().length, 0);
});

test("runtime market state remains bounded", () => {
  clearDizyQuantOrderFlowRuntime();
  for (let index = 0; index < DIZYQUANT_ORDER_FLOW_RUNTIME_MAX_MARKETS + 2; index += 1) {
    observeDizyQuantOrderFlowRuntime(runtimeInput({
      index,
      marketKey: `mexc:futures:TEST${index}_USDT`,
      symbol: `TEST${index}_USDT`,
    }));
  }
  const diagnostics = dizyQuantOrderFlowRuntimeDiagnostics();
  assert.equal(diagnostics.length, DIZYQUANT_ORDER_FLOW_RUNTIME_MAX_MARKETS);
  assert.ok(diagnostics.every((value) => value.researchOnly));
});

test("typed DizyFlow adapter taps research in the browser without changing its normalized return", () => {
  clearDizyQuantOrderFlowRuntime();
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    const input = runtimeInput({ index: 5 });
    const adapted = adaptLiveOrderFlow(input);
    assert.equal(adapted.marketKey, input.marketKey);
    assert.equal(adapted.symbol, input.envelope.snapshot.symbol);
    assert.equal(adapted.marketType, "futures");
    assert.equal(adapted.exchange, "mexc");
    assert.equal(adapted.tickSize, 0.1);
    assert.equal(adapted.feed.sequenceContinuous, true);
    assert.ok(readDizyQuantOrderFlowRuntimeEvidence(input.marketKey));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    clearDizyQuantOrderFlowRuntime();
  }
});
