import assert from "node:assert/strict";
import test from "node:test";
import {
  DIZYQUANT_CAMPAIGN_REGIME_FORMULA_VERSION,
  DIZYQUANT_DIRECTIONAL_MIN_EFFICIENCY,
  DIZYQUANT_DIRECTIONAL_MIN_NET_BPS,
  DIZYQUANT_DIRECTIONAL_MIN_SIGN_CONSISTENCY,
  classifyDizyQuantCampaignRegime,
} from "../app/lib/dizyquant/campaign-regime.ts";

const BASE = 40_000_000;
const PRICE_STEP = 0.01;
const CONTRACT_SIZE = 1;

function frame(index, options = {}) {
  const midpoint = options.midpoint ?? 100;
  const bidFactor = options.bidFactor ?? 1;
  const askFactor = options.askFactor ?? 1;
  const spreadTicks = options.spreadTicks ?? 1;
  const levels = [];
  for (let distance = spreadTicks; distance <= 35; distance += 1) {
    const bidPrice = midpoint - distance * PRICE_STEP;
    const askPrice = midpoint + distance * PRICE_STEP;
    levels.push({
      priceTick: Math.round(bidPrice / PRICE_STEP),
      bidContracts: 10 * bidFactor,
      askContracts: 0,
    });
    levels.push({
      priceTick: Math.round(askPrice / PRICE_STEP),
      bidContracts: 0,
      askContracts: 10 * askFactor,
    });
  }
  levels.sort((left, right) => left.priceTick - right.priceTick);
  return Object.freeze({
    timestampMs: BASE + index * 1_000,
    midpoint,
    levels: Object.freeze(levels.map((value) => Object.freeze(value))),
  });
}

function classify(frames, overrides = {}) {
  return classifyDizyQuantCampaignRegime({
    frames,
    priceStep: PRICE_STEP,
    contractSize: CONTRACT_SIZE,
    sequenceContinuous: true,
    hasGaps: false,
    ...overrides,
  });
}

test("flat and oscillating midpoint geometry classifies as range", () => {
  const frames = Array.from({ length: 61 }, (_, index) =>
    frame(index, { midpoint: 100 + (index % 2 === 0 ? 0 : 0.01) }),
  );
  const result = classify(frames);
  assert.equal(result.formulaVersion, DIZYQUANT_CAMPAIGN_REGIME_FORMULA_VERSION);
  assert.equal(result.available, true);
  assert.equal(result.regime, "range");
  assert.equal(result.shock, null);
  assert.ok(result.directionalEfficiency < DIZYQUANT_DIRECTIONAL_MIN_EFFICIENCY);
  assert.equal(result.decisionEligible, false);
  assert.equal(result.signalEligible, false);
  assert.equal(result.executionEligible, false);
});

test("persistent one-minute midpoint displacement classifies as directional", () => {
  const frames = Array.from({ length: 61 }, (_, index) =>
    frame(index, { midpoint: 100 + index * 0.01 }),
  );
  const result = classify(frames);
  assert.equal(result.available, true);
  assert.equal(result.regime, "directional");
  assert.equal(result.direction, "up");
  assert.equal(result.shock, null);
  assert.ok(Math.abs(result.netMoveBps) >= DIZYQUANT_DIRECTIONAL_MIN_NET_BPS);
  assert.ok(result.directionalEfficiency >= DIZYQUANT_DIRECTIONAL_MIN_EFFICIENCY);
  assert.ok(result.signConsistency >= DIZYQUANT_DIRECTIONAL_MIN_SIGN_CONSISTENCY);
});

test("versioned nearby-depth shock takes precedence over midpoint path classification", () => {
  const frames = Array.from({ length: 61 }, (_, index) =>
    index === 20 ? frame(index, { bidFactor: 0.5 }) : frame(index),
  );
  const result = classify(frames);
  assert.equal(result.available, true);
  assert.equal(result.regime, "volatility-shock");
  assert.ok(result.shock);
  assert.equal(result.shock.timestampMs, BASE + 20_000);
  assert.deepEqual(result.shock.components, ["bid-depth"]);
  assert.ok(result.shock.bidDepthLossPct >= 40);
});

test("shock selection chooses the most severe eligible interior frame deterministically", () => {
  const frames = Array.from({ length: 61 }, (_, index) => {
    if (index === 20) return frame(index, { bidFactor: 0.6 });
    if (index === 30) return frame(index, { bidFactor: 0.35 });
    return frame(index);
  });
  const result = classify(frames);
  assert.equal(result.regime, "volatility-shock");
  assert.equal(result.shock.timestampMs, BASE + 30_000);
  assert.equal(result.shock.componentCount, 1);
  assert.ok(result.shock.severityScore > 1);
});

test("a closing-frame disturbance is not nominated as a shock because it has no post-shock predictor evidence", () => {
  const frames = Array.from({ length: 61 }, (_, index) =>
    index === 60 ? frame(index, { bidFactor: 0.2 }) : frame(index),
  );
  const result = classify(frames);
  assert.equal(result.available, true);
  assert.equal(result.regime, "range");
  assert.equal(result.shock, null);
});

test("unproven continuity and malformed event grids fail closed", () => {
  const frames = Array.from({ length: 61 }, (_, index) => frame(index));
  const gapped = classify(frames, { sequenceContinuous: null, hasGaps: true });
  assert.equal(gapped.available, false);
  assert.equal(gapped.regime, null);
  const malformed = classify(frames.slice(0, 60));
  assert.equal(malformed.available, false);
  assert.equal(malformed.regime, null);
});

test("shock severity tie resolves to the earliest event-time candidate", () => {
  const frames = Array.from({ length: 61 }, (_, index) =>
    index === 20 || index === 30 ? frame(index, { askFactor: 0.5 }) : frame(index),
  );
  const result = classify(frames);
  assert.equal(result.regime, "volatility-shock");
  assert.equal(result.shock.timestampMs, BASE + 20_000);
});
