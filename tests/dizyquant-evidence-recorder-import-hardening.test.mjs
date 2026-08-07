import assert from "node:assert/strict";
import test from "node:test";

import {
  beginDizyQuantEvidenceSample,
  buildDizyQuantEvidenceDataset,
  completeDizyQuantEvidenceSample,
  parseDizyQuantEvidenceDatasetJson,
} from "../app/lib/dizyquant/evidence-recorder.ts";
import {
  buildDizyQuantResearchSnapshot,
  toDizyQuantReplaySnapshot,
} from "../app/lib/dizyquant/research.ts";

function record() {
  const time = 1_000_000;
  const snapshot = toDizyQuantReplaySnapshot(buildDizyQuantResearchSnapshot({
    symbol: "BTC_USDT",
    sourceTimeMs: time,
    evaluatedAtMs: time,
    maxAgeMs: 15_000,
    evidenceGrade: "continuous-stream-grade",
    sequenceContinuous: true,
    hasGaps: false,
    sourceKinds: ["depth-stream", "retained-liquidity", "replay"],
    coverage: { fromMs: time - 60_000, toMs: time },
    values: { "absorption-candidate-flag": 1 },
    limitations: ["Import-hardening fixture."],
  }));
  const pending = beginDizyQuantEvidenceSample({
    sampleId: "sample-0001",
    regime: "volatility-shock",
    baselineMidpoint: 100,
    snapshot,
  });
  return completeDizyQuantEvidenceSample(pending, {
    symbol: "BTC_USDT",
    timestampMs: pending.outcomeDueAtMs,
    midpoint: 101,
  });
}

function tamper(mutator) {
  const dataset = structuredClone(buildDizyQuantEvidenceDataset([record()]));
  mutator(dataset);
  return JSON.stringify(dataset);
}

test("import rejects predictor and due timestamps that disagree with immutable Replay time", () => {
  assert.throws(
    () => parseDizyQuantEvidenceDatasetJson(tamper((dataset) => {
      dataset.records[0].predictorTimeMs += 1;
    })),
    /predictor timestamps/,
  );
  assert.throws(
    () => parseDizyQuantEvidenceDatasetJson(tamper((dataset) => {
      dataset.records[0].outcomeDueAtMs += 1;
    })),
    /predictor timestamps/,
  );
});

test("import rejects unknown source kinds and tampered metric registry metadata", () => {
  assert.throws(
    () => parseDizyQuantEvidenceDatasetJson(tamper((dataset) => {
      dataset.records[0].snapshot.sourceKinds[0] = "private-feed";
    })),
    /Replay predictor snapshot/,
  );
  assert.throws(
    () => parseDizyQuantEvidenceDatasetJson(tamper((dataset) => {
      dataset.records[0].snapshot.metrics[0].unit = "milliseconds";
    })),
    /Replay predictor metric/,
  );
  assert.throws(
    () => parseDizyQuantEvidenceDatasetJson(tamper((dataset) => {
      dataset.records[0].snapshot.metrics[0].promotionStatus = "validated";
    })),
    /Replay predictor metric/,
  );
});
