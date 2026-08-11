import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildDizyQuantCampaignStudyExport,
  canonicalDizyQuantCampaignStudyExportJson,
  parseDizyQuantCampaignStudyExport,
} from "../app/lib/dizyquant/campaign-study-export.ts";
import {
  canonicalDizyQuantCampaignClosureJson,
  closeDizyQuantCampaign,
} from "../app/lib/dizyquant/campaign-closure.ts";
import {
  DIZYQUANT_INITIAL_EVIDENCE_REGIMES,
  DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS,
  DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
} from "../app/lib/dizyquant/evidence-campaign.ts";
import {
  DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID,
  DIZYQUANT_REPRESENTATIVE_METRIC_ID,
  emptyDizyQuantCampaignRecorderRunnerState,
} from "../app/lib/dizyquant/campaign-recorder-runner.ts";
import { DIZYQUANT_MIDPOINT_OUTCOME_VERSION } from "../app/lib/dizyquant/evidence-recorder.ts";

const rejectionCounts = () => ({
  "unselected-symbol": 0,
  "unselected-regime": 0,
  "evidence-grade-mismatch": 0,
  "gapped-evidence": 0,
  "unavailable-evidence": 0,
  "continuous-coverage-missing": 0,
  "metric-unavailable": 0,
});

function readyStudyExport() {
  let timestampMs = 1_800_000_000_000;
  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const observations = [];
  const cells = [];
  for (const symbol of DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS) {
    for (const regime of DIZYQUANT_INITIAL_EVIDENCE_REGIMES) {
      const firstIndex = observations.length;
      for (let index = 0; index < DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL; index += 1) {
        timestampMs += 540_000;
        const predictor = random() * 2 - 1;
        const noise = (random() * 2 - 1) * 0.18;
        observations.push({
          observationId: `synthetic:${symbol}:${regime}:${index}`,
          timestampMs,
          symbol,
          regime,
          metricId: DIZYQUANT_REPRESENTATIVE_METRIC_ID,
          predictor,
          outcome: predictor * 12 + noise,
        });
      }
      const values = observations.slice(firstIndex);
      cells.push({
        symbol,
        regime,
        submittedCount: DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
        qualifiedCount: DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
        rejectedCount: 0,
        minimumRequired: DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
        coverageReady: true,
        coverage: {
          fromMs: values[0].timestampMs,
          toMs: values.at(-1).timestampMs,
        },
      });
    }
  }
  return {
    schemaVersion: 1,
    formulaVersion: "dizyquant-campaign-study-export/1.0.0",
    campaignId: DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID,
    metricId: DIZYQUANT_REPRESENTATIVE_METRIC_ID,
    outcomeVersion: DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
    status: "coverage-ready",
    representativeCoverage: true,
    selectedSymbols: [...DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS],
    selectedRegimes: [...DIZYQUANT_INITIAL_EVIDENCE_REGIMES],
    minimumSamplesPerCell: DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
    submittedCount: observations.length,
    qualifiedCount: observations.length,
    rejectedCount: 0,
    rejectionCounts: rejectionCounts(),
    cells,
    observations,
    researchOnly: true,
    decisionEligible: false,
    signalEligible: false,
    executionEligible: false,
    promotionEligible: false,
  };
}

test("compact campaign export excludes raw recorder state and blocks closure before representative coverage", () => {
  const study = buildDizyQuantCampaignStudyExport(emptyDizyQuantCampaignRecorderRunnerState());
  assert.equal(study.status, "collecting");
  assert.equal(study.representativeCoverage, false);
  assert.equal(study.observations.length, 0);
  const encoded = canonicalDizyQuantCampaignStudyExportJson(study);
  assert.doesNotMatch(encoded, /"pending"|"provenance"|"snapshot"|"credential"|"secret"/i);

  const closure = closeDizyQuantCampaign(study);
  assert.equal(closure.status, "awaiting-coverage");
  assert.equal(closure.recommendation, "insufficient-evidence");
  assert.equal(closure.overall, null);
  assert.equal(closure.cells.length, 0);
  assert.equal(closure.sensitivity.length, 0);
  assert.equal(closure.promotionEligible, false);
  assert.equal(closure.signalEligible, false);
  assert.equal(closure.executionEligible, false);
});

test("coverage-ready export runs overall, all nine cell studies and bounded holdout sensitivity", () => {
  const study = parseDizyQuantCampaignStudyExport(readyStudyExport());
  const closure = closeDizyQuantCampaign(study);
  assert.equal(closure.status, "closed");
  assert.equal(closure.representativeCoverage, true);
  assert.equal(closure.observationCount, 450);
  assert.ok(closure.overall);
  assert.equal(closure.cells.length, 9);
  assert.deepEqual(closure.sensitivity.map((entry) => entry.holdoutFraction), [0.2, 0.3, 0.4]);
  for (const cell of closure.cells) {
    assert.equal(cell.observationCount, 50);
    assert.equal(cell.lab.promotionEligible, false);
    if (cell.confusion) assert.equal(cell.confusion.total, cell.lab.holdoutCount);
  }
  for (const entry of closure.sensitivity) {
    assert.equal(entry.lab.promotionEligible, false);
    if (entry.confusion) assert.equal(entry.confusion.total, entry.lab.holdoutCount);
  }
  assert.ok([
    "retain-experimental",
    "reject-current-formula",
    "revise-current-formula",
    "insufficient-evidence",
  ].includes(closure.recommendation));
  assert.equal(closure.promotionEligible, false);
  assert.equal(closure.decisionEligible, false);
  assert.equal(closure.signalEligible, false);
  assert.equal(closure.executionEligible, false);
  assert.equal(
    canonicalDizyQuantCampaignClosureJson(closure),
    canonicalDizyQuantCampaignClosureJson(closeDizyQuantCampaign(study)),
  );
});

test("study export parser fails closed when campaign counts or cell coverage are tampered", () => {
  const study = readyStudyExport();
  assert.throws(
    () => parseDizyQuantCampaignStudyExport({ ...study, qualifiedCount: 449 }),
    /count/i,
  );
  assert.throws(
    () => parseDizyQuantCampaignStudyExport({
      ...study,
      cells: study.cells.map((cell, index) =>
        index === 0 ? { ...cell, coverageReady: false } : cell),
    }),
    /cell/i,
  );
  assert.throws(
    () => parseDizyQuantCampaignStudyExport({
      ...study,
      observations: study.observations.map((entry, index) =>
        index === 10 ? { ...entry, metricId: "spread-bps" } : entry),
    }),
    /observation/i,
  );
});

test("production export stays owner-only and never runs the Replay lab on Render", async () => {
  const route = await readFile(
    new URL("../app/api/dizyquant/evidence/export/route.ts", import.meta.url),
    "utf8",
  );
  const script = await readFile(
    new URL("../scripts/dizyquant-campaign-close.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireApiUser/);
  assert.match(route, /user\.role !== "owner"/);
  assert.match(route, /readDizyQuantCampaignRecorderState/);
  assert.match(route, /buildDizyQuantCampaignStudyExport/);
  assert.match(route, /content-disposition/i);
  assert.doesNotMatch(route, /runDizyQuantReplayLab|closeDizyQuantCampaign/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(script, /closeDizyQuantCampaign/);
  assert.match(script, /awaiting-coverage/);
});
