import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  beginDizyQuantEvidenceSample,
  buildDizyQuantEvidenceDataset,
  canonicalDizyQuantEvidenceDatasetJson,
  completeDizyQuantEvidenceSample,
  DizyQuantEvidenceRecorder,
  DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION,
  DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION,
  DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION,
  DIZYQUANT_MIDPOINT_OUTCOME_HORIZON_MS,
  DIZYQUANT_MIDPOINT_OUTCOME_MAX_LAG_MS,
  DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
  parseDizyQuantEvidenceDatasetJson,
  runRecordedDizyQuantEvidenceCampaign,
} from "../app/lib/dizyquant/evidence-recorder.ts";
import {
  buildDizyQuantResearchSnapshot,
  toDizyQuantReplaySnapshot,
} from "../app/lib/dizyquant/research.ts";

const predictor = ({
  time = 1_000_000,
  symbol = "BTC_USDT",
  metricId = "absorption-candidate-flag",
  value = 1,
  evidenceGrade = "continuous-stream-grade",
  coverage = { fromMs: time - 60_000, toMs: time },
  hasGaps = false,
  sequenceContinuous = true,
} = {}) => toDizyQuantReplaySnapshot(buildDizyQuantResearchSnapshot({
  symbol,
  sourceTimeMs: time,
  evaluatedAtMs: time,
  maxAgeMs: 15_000,
  evidenceGrade,
  sequenceContinuous: evidenceGrade === "snapshot-grade" ? null : sequenceContinuous,
  hasGaps,
  sourceKinds: evidenceGrade === "snapshot-grade"
    ? ["depth-snapshot", "replay"]
    : ["depth-stream", "retained-liquidity", "replay"],
  coverage,
  values: { [metricId]: value },
  limitations: ["Recorder fixture."],
}));

const begin = (overrides = {}) => beginDizyQuantEvidenceSample({
  sampleId: "sample-0001",
  regime: "range",
  baselineMidpoint: 100,
  snapshot: predictor(),
  ...overrides,
});

const complete = (pending = begin(), overrides = {}) => completeDizyQuantEvidenceSample(
  pending,
  {
    symbol: pending.snapshot.symbol,
    timestampMs: pending.outcomeDueAtMs,
    midpoint: 101,
    ...overrides,
  },
);

test("recorder fixes the reviewed 60-second midpoint outcome and explicit regime contracts", () => {
  const pending = begin();
  assert.equal(pending.schemaVersion, DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION);
  assert.equal(pending.formulaVersion, DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION);
  assert.equal(pending.regimeLabelVersion, DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION);
  assert.equal(pending.outcomeVersion, DIZYQUANT_MIDPOINT_OUTCOME_VERSION);
  assert.equal(
    pending.outcomeDueAtMs - pending.predictorTimeMs,
    DIZYQUANT_MIDPOINT_OUTCOME_HORIZON_MS,
  );
  assert.equal(
    pending.outcomeExpiresAtMs - pending.outcomeDueAtMs,
    DIZYQUANT_MIDPOINT_OUTCOME_MAX_LAG_MS,
  );
  assert.equal(pending.researchOnly, true);
  assert.equal(pending.decisionEligible, false);
  assert.equal(pending.signalEligible, false);
  assert.equal(pending.executionEligible, false);
  assert.equal(pending.promotionEligible, false);
  assert.ok(Object.isFrozen(pending));
  assert.ok(Object.isFrozen(pending.snapshot));
});

test("predictor coverage cannot extend beyond predictor time", () => {
  const snapshot = structuredClone(predictor());
  snapshot.coverage = { fromMs: snapshot.sourceTimeMs - 60_000, toMs: snapshot.sourceTimeMs + 1 };
  assert.throws(
    () => begin({ snapshot }),
    /coverage may not extend beyond predictor time/,
  );
});

test("future outcome cannot be completed early or after the bounded lag", () => {
  const pending = begin();
  assert.throws(
    () => complete(pending, { timestampMs: pending.outcomeDueAtMs - 1 }),
    /before the future horizon/,
  );
  assert.throws(
    () => complete(pending, { timestampMs: pending.outcomeExpiresAtMs + 1 }),
    /outside the bounded horizon lag/,
  );
  const latest = complete(pending, {
    timestampMs: pending.outcomeExpiresAtMs,
    midpoint: 99,
  });
  assert.equal(latest.outcomeBps, -100);
});

test("completed outcome is derived only from retained baseline and future midpoint", () => {
  const pending = begin({ baselineMidpoint: 25_000 });
  const record = complete(pending, { midpoint: 25_050 });
  assert.equal(record.outcomeBps, 20);
  assert.equal(record.predictorTimeMs, pending.snapshot.sourceTimeMs);
  assert.equal(record.outcomeTimeMs, pending.snapshot.sourceTimeMs + 60_000);
  assert.equal(record.snapshot, pending.snapshot);
  assert.equal(record.researchOnly, true);
  assert.equal(record.signalEligible, false);
  assert.equal(record.executionEligible, false);
  assert.equal(record.promotionEligible, false);
  assert.ok(Object.isFrozen(record));
});

test("beginning a sample snapshots mutable Replay input rather than retaining caller mutations", () => {
  const mutable = structuredClone(predictor());
  const mutableMetric = mutable.metrics.find(
    (metric) => metric.id === "absorption-candidate-flag",
  );
  assert.ok(mutableMetric, "fixture metric must exist in the Replay snapshot");
  const pending = begin({ snapshot: mutable });
  mutableMetric.value = 0;
  mutable.limitations[0] = "mutated";
  const capturedMetric = pending.snapshot.metrics.find(
    (metric) => metric.id === "absorption-candidate-flag",
  );
  assert.equal(capturedMetric?.value, 1);
  assert.equal(pending.snapshot.limitations[0], "Recorder fixture.");
});

test("in-memory recorder ignores early observations, completes first eligible midpoint and expires late samples", () => {
  const recorder = new DizyQuantEvidenceRecorder();
  const first = recorder.begin({
    sampleId: "first",
    regime: "range",
    baselineMidpoint: 100,
    snapshot: predictor({ time: 1_000_000 }),
  });
  const second = recorder.begin({
    sampleId: "second",
    regime: "directional",
    baselineMidpoint: 200,
    snapshot: predictor({ time: 1_010_000 }),
  });
  const early = recorder.observe({
    symbol: "BTC_USDT",
    timestampMs: first.outcomeDueAtMs - 1,
    midpoint: 101,
  });
  assert.equal(early.completed.length, 0);
  assert.equal(recorder.stats().pendingCount, 2);

  const firstOutcome = recorder.observe({
    symbol: "BTC_USDT",
    timestampMs: first.outcomeDueAtMs + 1_000,
    midpoint: 101,
  });
  assert.equal(firstOutcome.completed.length, 1);
  assert.equal(firstOutcome.completed[0].sampleId, "first");

  const tooLate = recorder.observe({
    symbol: "BTC_USDT",
    timestampMs: second.outcomeExpiresAtMs + 1,
    midpoint: 201,
  });
  assert.deepEqual(tooLate.expiredSampleIds, ["second"]);
  assert.deepEqual(recorder.stats(), {
    pendingCount: 0,
    completedCount: 1,
    expiredCount: 1,
    maximumSamples: 10_000,
  });
});

test("recorder isolates symbols and rejects duplicate sample identity", () => {
  const recorder = new DizyQuantEvidenceRecorder();
  const pending = recorder.begin({
    sampleId: "btc-one",
    regime: "range",
    baselineMidpoint: 100,
    snapshot: predictor({ symbol: "BTC_USDT" }),
  });
  assert.throws(
    () => recorder.begin({
      sampleId: "btc-one",
      regime: "range",
      baselineMidpoint: 100,
      snapshot: predictor({ time: 2_000_000 }),
    }),
    /Duplicate/,
  );
  const unrelated = recorder.observe({
    symbol: "ETH_USDT",
    timestampMs: pending.outcomeExpiresAtMs + 10_000,
    midpoint: 200,
  });
  assert.equal(unrelated.completed.length, 0);
  assert.equal(unrelated.expiredSampleIds.length, 0);
  assert.equal(recorder.stats().pendingCount, 1);
});

test("dataset export is canonical, importable and preserves only completed compact evidence", () => {
  const first = complete(begin({ sampleId: "b", snapshot: predictor({ time: 2_000_000 }) }));
  const second = complete(begin({ sampleId: "a", snapshot: predictor({ time: 1_000_000 }) }));
  const forward = canonicalDizyQuantEvidenceDatasetJson([first, second]);
  const reverse = canonicalDizyQuantEvidenceDatasetJson([second, first]);
  assert.equal(forward, reverse);
  const parsed = parseDizyQuantEvidenceDatasetJson(forward);
  assert.deepEqual(parsed.records.map((record) => record.sampleId), ["a", "b"]);
  assert.equal(parsed.records.length, 2);
  assert.equal(Object.hasOwn(parsed.records[0], "rawBook"), false);
  assert.equal(Object.hasOwn(parsed.records[0], "trades"), false);
  assert.equal(Object.hasOwn(parsed.records[0], "heatmap"), false);
  const restored = DizyQuantEvidenceRecorder.fromJson(forward);
  assert.equal(restored.exportJson(), forward);
});

test("recorded evidence runs directly through the existing campaign evaluator", () => {
  const records = [
    complete(begin({ sampleId: "btc-range", regime: "range", snapshot: predictor({ time: 1_000_000 }) })),
    complete(begin({ sampleId: "btc-directional", regime: "directional", snapshot: predictor({ time: 2_000_000 }) })),
  ];
  const result = runRecordedDizyQuantEvidenceCampaign(records, {
    campaignId: "absorption-recorder-v1",
    metricId: "absorption-candidate-flag",
    metricVersion: 1,
    evidenceGrade: "continuous-stream-grade",
    outcomeVersion: DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
    selectedSymbols: ["BTC_USDT"],
    selectedRegimes: ["range", "directional"],
    minimumSamplesPerCell: 1,
  });
  assert.equal(result.status, "coverage-ready");
  assert.equal(result.qualifiedCount, 2);
  assert.equal(result.observations.length, 2);
  assert.equal(result.decisionEligible, false);
  assert.equal(result.signalEligible, false);
  assert.equal(result.executionEligible, false);
  assert.equal(result.promotionEligible, false);
});

test("dataset validation rejects tampering and mismatched midpoint arithmetic", () => {
  const record = complete();
  const dataset = buildDizyQuantEvidenceDataset([record]);
  const tampered = structuredClone(dataset);
  tampered.records[0].outcomeBps += 1;
  assert.throws(
    () => parseDizyQuantEvidenceDatasetJson(JSON.stringify(tampered)),
    /outcome does not match/,
  );
  const wrongVersion = structuredClone(dataset);
  wrongVersion.outcomeVersion = "something-else";
  assert.throws(
    () => parseDizyQuantEvidenceDatasetJson(JSON.stringify(wrongVersion)),
    /dataset contract/,
  );
});

test("recorder source remains pure and does not acquire persistence, account, signal or execution coupling", async () => {
  const source = await readFile(
    new URL("../app/lib/dizyquant/evidence-recorder.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /localStorage|sessionStorage|node:fs|fetch\(|EventSource|WebSocket/);
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:paper|account|journal|dizybrain|signals|execution)[^"']*["']/i);
  assert.match(source, /decisionEligible:\s*false/);
  assert.match(source, /signalEligible:\s*false/);
  assert.match(source, /executionEligible:\s*false/);
  assert.match(source, /promotionEligible:\s*false/);
});
