import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDizyQuantEvidenceCampaign,
  canonicalDizyQuantEvidenceCampaignJson,
  createInitialDizyQuantEvidenceCampaignConfig,
  DIZYQUANT_EVIDENCE_CAMPAIGN_FORMULA_VERSION,
  DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES,
  DIZYQUANT_EVIDENCE_CAMPAIGN_SCHEMA_VERSION,
  DIZYQUANT_INITIAL_EVIDENCE_REGIMES,
  DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS,
  DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
} from "../app/lib/dizyquant/evidence-campaign.ts";
import { runDizyQuantReplayLab } from "../app/lib/dizyquant/lab.ts";
import {
  buildDizyQuantResearchSnapshot,
  toDizyQuantReplaySnapshot,
} from "../app/lib/dizyquant/research.ts";

const replaySnapshot = ({
  time,
  symbol = "BTC_USDT",
  metricId = "absorption-candidate-flag",
  value = 1,
  evidenceGrade = "continuous-stream-grade",
  sequenceContinuous = true,
  hasGaps = false,
  coverage = { fromMs: time - 60_000, toMs: time },
}) => toDizyQuantReplaySnapshot(buildDizyQuantResearchSnapshot({
  symbol,
  sourceTimeMs: time,
  evaluatedAtMs: time,
  maxAgeMs: 15_000,
  evidenceGrade,
  sequenceContinuous,
  hasGaps,
  sourceKinds: evidenceGrade === "continuous-stream-grade"
    ? ["depth-stream", "retained-liquidity", "replay"]
    : ["depth-snapshot", "replay"],
  coverage,
  values: { [metricId]: value },
  limitations: ["Deterministic campaign fixture."],
}));

const sample = ({
  index,
  time = 1_000_000 + index * 1_000,
  symbol = "BTC_USDT",
  regime = "range",
  value = 1,
  outcome = value ? 1 : -1,
  snapshot,
}) => ({
  sampleId: `sample-${String(index).padStart(4, "0")}`,
  regime,
  outcome,
  snapshot: snapshot ?? replaySnapshot({ time, symbol, value }),
});

const config = (overrides = {}) => ({
  campaignId: "absorption-candidate-representative-v1",
  metricId: "absorption-candidate-flag",
  metricVersion: 1,
  evidenceGrade: "continuous-stream-grade",
  outcomeVersion: "midpoint-response-60s-bps/1.0.0",
  selectedSymbols: ["BTC_USDT"],
  selectedRegimes: ["range"],
  minimumSamplesPerCell: 1,
  ...overrides,
});

test("initial campaign config fixes a bounded symbol and regime matrix", () => {
  const result = createInitialDizyQuantEvidenceCampaignConfig(
    "absorption-candidate-representative-v1",
    "absorption-candidate-flag",
    "midpoint-response-60s-bps/1.0.0",
  );
  assert.deepEqual(result.selectedSymbols, DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS);
  assert.deepEqual(result.selectedRegimes, DIZYQUANT_INITIAL_EVIDENCE_REGIMES);
  assert.equal(result.minimumSamplesPerCell, DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL);
  assert.equal(result.evidenceGrade, "continuous-stream-grade");
  assert.equal(result.metricVersion, 1);
  assert.ok(Object.isFrozen(result));
});

test("campaign reaches coverage-ready only when every selected symbol-regime cell qualifies", () => {
  const inputs = [
    sample({ index: 0, symbol: "BTC_USDT", regime: "range" }),
    sample({ index: 1, symbol: "BTC_USDT", regime: "directional" }),
    sample({ index: 2, symbol: "ETH_USDT", regime: "range" }),
    sample({ index: 3, symbol: "ETH_USDT", regime: "directional" }),
  ];
  const result = buildDizyQuantEvidenceCampaign(inputs, config({
    selectedSymbols: ["BTC_USDT", "ETH_USDT"],
    selectedRegimes: ["range", "directional"],
  }));
  assert.equal(result.schemaVersion, DIZYQUANT_EVIDENCE_CAMPAIGN_SCHEMA_VERSION);
  assert.equal(result.formulaVersion, DIZYQUANT_EVIDENCE_CAMPAIGN_FORMULA_VERSION);
  assert.equal(result.status, "coverage-ready");
  assert.equal(result.representativeCoverage, true);
  assert.equal(result.submittedCount, 4);
  assert.equal(result.qualifiedCount, 4);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.cells.length, 4);
  assert.ok(result.cells.every((cell) => cell.coverageReady));
  assert.equal(result.signalEligible, false);
  assert.equal(result.executionEligible, false);
  assert.equal(result.promotionEligible, false);
  assert.equal(result.decisionEligible, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.cells));
  assert.ok(Object.isFrozen(result.qualifiedSamples));
});

test("continuous campaign rejects gapped, unavailable and coverage-incomplete evidence without coercing it", () => {
  const inputs = [
    sample({ index: 0 }),
    sample({
      index: 1,
      snapshot: replaySnapshot({ time: 1_001_000, hasGaps: true }),
    }),
    sample({
      index: 2,
      snapshot: replaySnapshot({ time: 1_002_000, value: null }),
    }),
    sample({
      index: 3,
      snapshot: replaySnapshot({ time: 1_003_000, coverage: { fromMs: null, toMs: null } }),
    }),
    sample({
      index: 4,
      snapshot: replaySnapshot({
        time: 1_004_000,
        evidenceGrade: "snapshot-grade",
        coverage: { fromMs: null, toMs: null },
      }),
    }),
    sample({ index: 5, symbol: "ETH_USDT" }),
    sample({ index: 6, regime: "directional" }),
  ];
  const result = buildDizyQuantEvidenceCampaign(inputs, config({ minimumSamplesPerCell: 2 }));
  assert.equal(result.status, "collecting");
  assert.equal(result.representativeCoverage, false);
  assert.equal(result.qualifiedCount, 1);
  assert.equal(result.rejectedCount, 6);
  assert.deepEqual(result.rejectionCounts, {
    "unselected-symbol": 1,
    "unselected-regime": 1,
    "evidence-grade-mismatch": 1,
    "gapped-evidence": 1,
    "unavailable-evidence": 1,
    "continuous-coverage-missing": 1,
    "metric-unavailable": 0,
  });
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].observationId, "sample-0000");
  assert.ok(result.rejectedSamples.every((entry) => !Object.hasOwn(entry, "predictor")));
});

test("snapshot-grade campaigns do not invent a continuity requirement", () => {
  const snapshot = replaySnapshot({
    time: 1_000_000,
    metricId: "spread-bps",
    value: 2.5,
    evidenceGrade: "snapshot-grade",
    sequenceContinuous: null,
    coverage: { fromMs: null, toMs: null },
  });
  const result = buildDizyQuantEvidenceCampaign([
    sample({ index: 0, outcome: -.5, snapshot }),
  ], {
    campaignId: "spread-snapshot-v1",
    metricId: "spread-bps",
    metricVersion: 1,
    evidenceGrade: "snapshot-grade",
    outcomeVersion: "midpoint-response-60s-bps/1.0.0",
    selectedSymbols: ["BTC_USDT"],
    selectedRegimes: ["range"],
    minimumSamplesPerCell: 1,
  });
  assert.equal(result.status, "coverage-ready");
  assert.equal(result.qualifiedCount, 1);
  assert.equal(result.qualifiedSamples[0].sequenceContinuous, null);
});

test("qualified campaign observations feed the existing deterministic Replay lab", () => {
  const inputs = Array.from({ length: 80 }, (_, index) => {
    const value = index % 2;
    return sample({ index, value, outcome: value ? 1 : -1 });
  });
  const campaign = buildDizyQuantEvidenceCampaign(inputs, config({ minimumSamplesPerCell: 50 }));
  const lab = runDizyQuantReplayLab(campaign.observations, {
    metricId: "absorption-candidate-flag",
    nullRotations: 16,
    walkForwardFolds: 4,
  });
  assert.equal(campaign.status, "coverage-ready");
  assert.equal(campaign.observations.length, 80);
  assert.equal(lab.valid, true);
  assert.equal(lab.status, "ready");
  assert.equal(lab.promotionEligible, false);
});

test("campaign output and canonical serialisation are deterministic and input remains unchanged", () => {
  const inputs = [sample({ index: 0 }), sample({ index: 1, value: 0 })];
  const before = structuredClone(inputs);
  const first = buildDizyQuantEvidenceCampaign(inputs, config());
  const second = buildDizyQuantEvidenceCampaign(structuredClone(inputs), config());
  assert.deepEqual(first, second);
  assert.equal(
    canonicalDizyQuantEvidenceCampaignJson(first),
    canonicalDizyQuantEvidenceCampaignJson(second),
  );
  assert.deepEqual(inputs, before);
});

test("malformed, duplicate, unordered, unsafe and oversized campaign inputs fail closed", () => {
  const first = sample({ index: 0 });
  const second = sample({ index: 1 });
  assert.throws(
    () => buildDizyQuantEvidenceCampaign([first, { ...second, sampleId: first.sampleId }], config()),
    /Duplicate/,
  );
  assert.throws(
    () => buildDizyQuantEvidenceCampaign([second, first], config()),
    /strictly ordered/,
  );
  assert.throws(
    () => buildDizyQuantEvidenceCampaign([{ ...first, outcome: Number.NaN }], config()),
    /outcome/,
  );
  assert.throws(
    () => buildDizyQuantEvidenceCampaign(
      Array(DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES + 1).fill(first),
      config(),
    ),
    /bounded sample limit/,
  );
  assert.throws(
    () => buildDizyQuantEvidenceCampaign([first], config({ evidenceGrade: "snapshot-grade" })),
    /metric contract/,
  );
  assert.throws(
    () => buildDizyQuantEvidenceCampaign([first], config({ selectedSymbols: ["BTC_USDT", "BTC_USDT"] })),
    /symbols/,
  );
});
