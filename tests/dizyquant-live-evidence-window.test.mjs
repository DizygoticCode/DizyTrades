import assert from "node:assert/strict";
import test from "node:test";
import {
  DIZYQUANT_LIVE_EVIDENCE_MAX_ASOF_AGE_MS,
  DIZYQUANT_LIVE_EVIDENCE_MAX_DEPTH_OBSERVATIONS,
  DIZYQUANT_LIVE_EVIDENCE_RETENTION_MS,
  DizyQuantLiveEvidenceWindow,
} from "../app/lib/dizyquant/live-evidence-window.ts";

const FROM = 8_000_000;
const TO = FROM + 60_000;
const metric = (snapshot, id) => snapshot?.metrics.find((value) => value.id === id)?.value ?? null;

function book({ bidQty = 100, askQty = 100, bid = 99.9, ask = 100.1 } = {}) {
  return {
    valid: true,
    version: 1,
    bids: [
      { price: bid, orderCount: 1, contractQuantity: bidQty },
      { price: 99.8, orderCount: 1, contractQuantity: 50 },
    ],
    asks: [
      { price: ask, orderCount: 1, contractQuantity: askQty },
      { price: 100.2, orderCount: 1, contractQuantity: 50 },
    ],
  };
}

function trade(index, timestampMs, side = "buy", price = 100) {
  return {
    tradeId: `trade-${index}`,
    timestampMs,
    price,
    quantity: 2,
    notional: price * 2,
    side,
  };
}

function populatedWindow() {
  const source = new DizyQuantLiveEvidenceWindow({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: .1,
  });
  for (let boundary = FROM; boundary <= TO; boundary += 1_000) {
    const seconds = (boundary - FROM) / 1_000;
    const depth = seconds === 30
      ? book({ bidQty: 30 })
      : book();
    source.captureDepth({
      timestampMs: boundary - 250,
      book: depth,
      sequenceContinuous: true,
      hasGaps: false,
    });
  }
  source.captureTrade(trade(1, TO - 9_500, "buy"));
  source.captureTrade(trade(2, TO - 5_000, "sell"));
  return source;
}

test("separates ladder, trade-flow and depth-stream Replay evidence quality", () => {
  const source = populatedWindow();
  const result = source.build({
    windowToMs: TO,
    evaluatedAtMs: TO + 100,
    tradeSequenceContinuous: null,
    tradeHasGaps: false,
  });

  assert.equal(result.snapshots.ladder.evidenceGrade, "snapshot-grade");
  assert.equal(result.snapshots.ladder.availability, "fresh");
  assert.equal(result.snapshots.aggressiveFlow.evidenceGrade, "continuous-stream-grade");
  assert.equal(result.snapshots.aggressiveFlow.availability, "gapped");
  assert.equal(result.snapshots.liquidityMigration.evidenceGrade, "continuous-stream-grade");
  assert.equal(result.snapshots.liquidityMigration.availability, "fresh");
  assert.equal(result.snapshots.resilience, null);
  assert.equal(result.depthSequenceContinuous, true);
  assert.equal(result.tradeSequenceContinuous, null);
  assert.equal(result.researchOnly, true);
  assert.equal(result.signalEligible, false);
  assert.equal(result.executionEligible, false);
  assert.ok(result.limitations.some((value) => /formula family/i.test(value)));
});

test("proven public-trade continuity qualifies aggressive flow independently", () => {
  const source = populatedWindow();
  const result = source.build({
    windowToMs: TO,
    evaluatedAtMs: TO,
    tradeSequenceContinuous: true,
    tradeHasGaps: false,
  });
  assert.equal(result.snapshots.aggressiveFlow.availability, "fresh");
  assert.equal(metric(result.snapshots.aggressiveFlow, "aggressive-buy-trade-count-10s"), 1);
  assert.equal(metric(result.snapshots.aggressiveFlow, "aggressive-sell-trade-count-10s"), 1);
  assert.equal(metric(result.snapshots.aggressiveFlow, "aggressive-gross-notional-10s"), 400);
});

test("never uses a future book to fill a past research boundary", () => {
  const source = new DizyQuantLiveEvidenceWindow({ symbol: "BTC_USDT", contractSize: 1, priceStep: .1 });
  for (let boundary = FROM + 30_000; boundary <= TO; boundary += 1_000) {
    if (boundary === TO - 10_000) continue;
    source.captureDepth({
      timestampMs: boundary - 200,
      book: book(),
      sequenceContinuous: true,
      hasGaps: false,
    });
    if (boundary === TO - 11_000) {
      source.captureDepth({
        timestampMs: TO - 10_000 + 100,
        book: book({ bidQty: 999 }),
        sequenceContinuous: true,
        hasGaps: false,
      });
    }
  }
  const result = source.build({
    windowToMs: TO,
    evaluatedAtMs: TO,
    tradeSequenceContinuous: null,
    tradeHasGaps: false,
  });
  assert.equal(result.snapshots.liquidityMigration.availability, "gapped");
  assert.ok(result.sampledFrames.liquidityMigration < 31);
  assert.equal(result.depthHasGaps, true);
});

test("rejects as-of depth older than the one-second evidence boundary", () => {
  const source = new DizyQuantLiveEvidenceWindow({ symbol: "BTC_USDT", contractSize: 1, priceStep: .1 });
  source.captureDepth({
    timestampMs: TO - DIZYQUANT_LIVE_EVIDENCE_MAX_ASOF_AGE_MS - 1,
    book: book(),
    sequenceContinuous: true,
    hasGaps: false,
  });
  const result = source.build({
    windowToMs: TO,
    evaluatedAtMs: TO,
    tradeSequenceContinuous: null,
    tradeHasGaps: false,
  });
  assert.equal(result.snapshots.ladder, null);
  assert.equal(result.snapshots.liquidityMigration.availability, "unavailable");
});

test("enumerates formula-valid shock timestamps without selecting one", () => {
  const source = populatedWindow();
  const candidates = source.eligibleShockTimestamps(TO);
  assert.ok(candidates.includes(FROM + 30_000));
  const withoutShock = source.build({
    windowToMs: TO,
    evaluatedAtMs: TO,
    tradeSequenceContinuous: null,
    tradeHasGaps: false,
  });
  assert.equal(withoutShock.shockTimestampMs, null);
  assert.equal(withoutShock.snapshots.resilience, null);
  assert.equal(metric(withoutShock.snapshots.liquidityMigration, "absorption-candidate-flag"), null);
});

test("explicit reviewed shock input produces separate resilience candidate evidence", () => {
  const source = populatedWindow();
  const result = source.build({
    windowToMs: TO,
    evaluatedAtMs: TO,
    tradeSequenceContinuous: null,
    tradeHasGaps: false,
    shockTimestampMs: FROM + 30_000,
  });
  assert.equal(result.shockTimestampMs, FROM + 30_000);
  assert.ok(result.snapshots.resilience);
  assert.equal(result.snapshots.resilience.evidenceGrade, "continuous-stream-grade");
  assert.equal(result.snapshots.resilience.availability, "fresh");
  assert.equal(metric(result.snapshots.resilience, "absorption-candidate-flag"), 1);
  assert.equal(metric(result.snapshots.resilience, "exhaustion-candidate-flag"), 0);
  assert.deepEqual(result.snapshots.resilience.coverage, { fromMs: FROM, toMs: TO });
  assert.ok(result.snapshots.resilience.limitations.some((value) => /explicit input/i.test(value)));
});

test("a depth sequence break resets the bounded raw window and trade tape", () => {
  const source = populatedWindow();
  assert.ok(source.diagnostics().depthObservationCount > 1);
  assert.ok(source.diagnostics().tradeCount > 0);
  source.captureDepth({
    timestampMs: TO + 1_000,
    book: book(),
    sequenceContinuous: false,
    hasGaps: false,
  });
  const diagnostics = source.diagnostics();
  assert.equal(diagnostics.depthObservationCount, 1);
  assert.equal(diagnostics.tradeCount, 0);
});

test("raw source retention stays bounded by age and depth-observation capacity", () => {
  const source = new DizyQuantLiveEvidenceWindow({ symbol: "BTC_USDT", contractSize: 1, priceStep: .1 });
  for (let index = 0; index < 900; index += 1) {
    source.captureDepth({
      timestampMs: FROM + index * 250,
      book: book(),
      sequenceContinuous: true,
      hasGaps: false,
    });
  }
  const diagnostics = source.diagnostics();
  assert.ok(diagnostics.depthObservationCount <= DIZYQUANT_LIVE_EVIDENCE_MAX_DEPTH_OBSERVATIONS);
  assert.ok(diagnostics.latestDepthTimeMs - diagnostics.earliestDepthTimeMs <= DIZYQUANT_LIVE_EVIDENCE_RETENTION_MS);
});

test("rejects price levels that cannot be represented by the reviewed price step", () => {
  const source = new DizyQuantLiveEvidenceWindow({ symbol: "BTC_USDT", contractSize: 1, priceStep: .1 });
  assert.throws(() => source.captureDepth({
    timestampMs: FROM,
    book: book({ bid: 99.91 }),
    sequenceContinuous: true,
    hasGaps: false,
  }), /price step/);
});
