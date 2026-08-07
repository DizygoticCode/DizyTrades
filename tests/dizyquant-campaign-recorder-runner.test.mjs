import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DizyQuantCampaignDepthRuntime } from "../app/lib/dizyquant/campaign-depth-runtime.ts";
import {
  DIZYQUANT_CAMPAIGN_PREDICTOR_OFFSET_MS,
  DIZYQUANT_CAMPAIGN_SYMBOL_RESIDENCY_MS,
  DIZYQUANT_REPRESENTATIVE_METRIC_ID,
  DizyQuantCampaignRecorderRunner,
  dizyQuantCampaignResidencyAt,
  dizyQuantCampaignSampleId,
  parseDizyQuantCampaignRecorderRunnerState,
} from "../app/lib/dizyquant/campaign-recorder-runner.ts";
import {
  readDizyQuantCampaignRecorderState,
  writeDizyQuantCampaignRecorderState,
} from "../app/lib/dizyquant/campaign-recorder-store.ts";
import {
  DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
  DIZYQUANT_CAMPAIGN_REGIME_RUNTIME_VERSION,
} from "../app/lib/dizyquant/campaign-runtime-contract.ts";
import { DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS } from "../app/lib/dizyquant/evidence-campaign.ts";

const normalLevels = () => ({
  bids: [
    { price: 99.9, orderCount: 1, contractQuantity: 10 },
    { price: 99.8, orderCount: 1, contractQuantity: 8 },
    { price: 99.7, orderCount: 1, contractQuantity: 6 },
  ],
  asks: [
    { price: 100.1, orderCount: 1, contractQuantity: 9 },
    { price: 100.2, orderCount: 1, contractQuantity: 7 },
    { price: 100.3, orderCount: 1, contractQuantity: 5 },
  ],
});

function envelopeAt(symbol, timestampMs, version, shock = false) {
  const depth = normalLevels();
  return {
    snapshot: {
      symbol,
      version,
      engineTimeMs: timestampMs,
      bids: shock
        ? depth.bids.map((level) => ({ ...level, contractQuantity: level.contractQuantity * 0.4 }))
        : depth.bids,
      asks: depth.asks,
    },
    receivedAt: timestampMs + 50,
    diagnostic: {
      snapshotAgeMs: 50,
      consecutiveFailures: 0,
      lastError: null,
      sourceMode: "FULL DEPTH WS",
      versionGaps: 0,
      sequenceKnown: true,
      sequenceContinuous: true,
      snapshotComplete: true,
      recovering: false,
      sourceTimestampKnown: true,
    },
  };
}

function realPublication({ shock = false } = {}) {
  const residency = dizyQuantCampaignResidencyAt(180_000 * 100 + 1);
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: residency.symbol,
    contractSize: 1,
    priceStep: 0.1,
  });
  const start = residency.predictorBoundaryMs - 70_500;
  const end = residency.predictorBoundaryMs + 500;
  const shockSourceTime = residency.predictorBoundaryMs - 30_500;
  const publications = [];
  let version = 1;
  for (let timestampMs = start; timestampMs <= end; timestampMs += 1_000) {
    const publication = runtime.push(
      envelopeAt(residency.symbol, timestampMs, version++, shock && timestampMs === shockSourceTime),
    );
    if (publication) publications.push(publication);
  }
  const target = publications.find(
    (publication) => publication.boundaryTimeMs === residency.predictorBoundaryMs,
  );
  assert.ok(target, "real runtime must publish the residency target boundary");
  return { residency, publications, target };
}

test("campaign residency is a deterministic three-symbol round robin with one target boundary", () => {
  const first = dizyQuantCampaignResidencyAt(180_000 * 300 + 1);
  const second = dizyQuantCampaignResidencyAt(first.toMs + 1);
  const third = dizyQuantCampaignResidencyAt(second.toMs + 1);
  const fourth = dizyQuantCampaignResidencyAt(third.toMs + 1);
  assert.deepEqual(
    [first.symbol, second.symbol, third.symbol],
    [...DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS],
  );
  assert.equal(fourth.symbol, first.symbol);
  assert.equal(first.toMs - first.fromMs, DIZYQUANT_CAMPAIGN_SYMBOL_RESIDENCY_MS);
  assert.equal(
    first.predictorBoundaryMs - first.fromMs,
    DIZYQUANT_CAMPAIGN_PREDICTOR_OFFSET_MS,
  );
  assert.equal(first.predictorBoundaryMs % 5_000, 0);
});

test("runner opens exactly one representative target sample and completes only at the future horizon", () => {
  const { residency, publications, target } = realPublication();
  assert.equal(target.regime, "range");
  const earlier = publications.find(
    (publication) => publication.boundaryTimeMs < residency.predictorBoundaryMs,
  );
  assert.ok(earlier);

  const runner = new DizyQuantCampaignRecorderRunner();
  assert.equal(runner.consumePublication(earlier).changed, false);
  const opened = runner.consumePublication(target);
  const representativeId = dizyQuantCampaignSampleId(
    "representative",
    residency.symbol,
    residency.predictorBoundaryMs,
  );
  assert.deepEqual(opened.openedSampleIds, [representativeId]);
  assert.equal(runner.consumePublication(target).changed, false);

  let state = runner.state();
  assert.equal(state.pending.length, 1);
  assert.equal(state.completed.length, 0);
  assert.equal(state.provenance.length, 1);
  assert.equal(state.provenance[0].kind, "representative");
  assert.equal(state.provenance[0].publicationRuntimeVersion, DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION);
  assert.equal(state.provenance[0].regimeFormulaVersion, DIZYQUANT_CAMPAIGN_REGIME_RUNTIME_VERSION);
  assert.equal(state.provenance[0].boundaryTimeMs, residency.predictorBoundaryMs);
  assert.equal(state.provenance[0].publicationSourceTimeMs, target.sourceTimeMs);
  assert.equal(state.provenance[0].predictorSourceTimeMs, target.sourceTimeMs);
  assert.equal(
    state.pending[0].snapshot.metrics.find((metric) => metric.id === DIZYQUANT_REPRESENTATIVE_METRIC_ID)?.value,
    4.761904761904762,
  );

  const predictorTimeMs = state.pending[0].predictorTimeMs;
  const early = runner.observeOutcome({
    symbol: residency.symbol,
    timestampMs: predictorTimeMs + 59_999,
    midpoint: 101,
  });
  assert.equal(early.changed, false);
  assert.equal(runner.state().pending.length, 1);

  const completed = runner.observeOutcome({
    symbol: residency.symbol,
    timestampMs: predictorTimeMs + 60_000,
    midpoint: 101,
  });
  assert.deepEqual(completed.completedSampleIds, [representativeId]);
  state = runner.state();
  assert.equal(state.pending.length, 0);
  assert.equal(state.completed.length, 1);
  assert.equal(state.provenance.length, 1);
  assert.equal(state.completed[0].outcomeTimeMs, predictorTimeMs + 60_000);
  assert.ok(state.completed[0].outcomeBps > 99 && state.completed[0].outcomeBps < 101);
  assert.equal(runner.stats().campaignQualifiedCount, 1);

  const restored = new DizyQuantCampaignRecorderRunner(state);
  assert.deepEqual(restored.state(), state);
  assert.equal(restored.consumePublication(target).changed, false);
});

test("a real volatility-shock target stores separate shock provenance without double-counting the representative metric", () => {
  const { residency, target } = realPublication({ shock: true });
  assert.equal(target.regime, "volatility-shock");
  assert.ok(target.selectedShockTimestampMs);
  assert.ok(target.evidence.snapshots.resilience);

  const runner = new DizyQuantCampaignRecorderRunner();
  const opened = runner.consumePublication(target);
  assert.equal(opened.openedSampleIds.length, 2);
  const state = runner.state();
  assert.equal(state.pending.length, 2);
  const representative = state.provenance.find((value) => value.kind === "representative");
  const shock = state.provenance.find((value) => value.kind === "shock");
  assert.ok(representative);
  assert.ok(shock);
  assert.equal(representative.predictorSourceTimeMs, target.sourceTimeMs);
  assert.equal(shock.predictorSourceTimeMs, target.boundaryTimeMs);
  assert.equal(shock.selectedShockTimestampMs, target.selectedShockTimestampMs);
  assert.equal(shock.regime, "volatility-shock");

  const completion = runner.observeOutcome({
    symbol: residency.symbol,
    timestampMs: target.boundaryTimeMs + 60_000,
    midpoint: 100.5,
  });
  assert.equal(completion.completedSampleIds.length, 2);
  assert.equal(runner.state().completed.length, 2);
  assert.equal(runner.stats().campaignQualifiedCount, 1);
});

test("runner state rejects missing or tampered sample methodology provenance", () => {
  const { target } = realPublication();
  const runner = new DizyQuantCampaignRecorderRunner();
  runner.consumePublication(target);
  const state = runner.state();
  assert.throws(
    () => parseDizyQuantCampaignRecorderRunnerState({ ...state, provenance: [] }),
    /provenance coverage/,
  );
  assert.throws(
    () =>
      parseDizyQuantCampaignRecorderRunnerState({
        ...state,
        provenance: [{ ...state.provenance[0], regimeFormulaVersion: "made-up-regime/9" }],
      }),
    /provenance/,
  );
});

test("campaign recorder state round-trips through bounded atomic DATA_DIR storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "dizyquant-campaign-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  try {
    const { target } = realPublication();
    const runner = new DizyQuantCampaignRecorderRunner();
    runner.consumePublication(target);
    await writeDizyQuantCampaignRecorderState(runner.state());
    const restored = await readDizyQuantCampaignRecorderState();
    assert.deepEqual(restored, runner.state());
    const raw = await readFile(join(root, "dizyquant", "campaign", "representative-v1.json"), "utf8");
    assert.match(raw, /dizyquant-campaign-recorder-runner\/1\.0\.0/);
    assert.doesNotMatch(raw, /credential|apiKey|secret/i);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
