import {
  parseDizyQuantCampaignStudyExport,
  type DizyQuantCampaignStudyExport,
} from "./campaign-study-export.ts";
import {
  runDizyQuantReplayLab,
  type DizyQuantReplayLabResult,
  type DizyQuantStudyObservation,
} from "./lab.ts";

export const DIZYQUANT_CAMPAIGN_CLOSURE_SCHEMA_VERSION = 1 as const;
export const DIZYQUANT_CAMPAIGN_CLOSURE_FORMULA_VERSION =
  "dizyquant-campaign-closure/1.0.0" as const;

export type DizyQuantCampaignClosureStatus = "awaiting-coverage" | "closed";
export type DizyQuantCampaignClosureRecommendation =
  | "retain-experimental"
  | "reject-current-formula"
  | "revise-current-formula"
  | "insufficient-evidence";

export type DizyQuantConfusionMatrix = Readonly<{
  truePositive: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
  total: number;
  falsePositivePct: number | null;
  falseNegativePct: number | null;
}>;

export type DizyQuantCampaignCellStudy = Readonly<{
  symbol: string;
  regime: string;
  observationCount: number;
  lab: DizyQuantReplayLabResult;
  confusion: DizyQuantConfusionMatrix | null;
}>;

export type DizyQuantCampaignSensitivityStudy = Readonly<{
  holdoutFraction: number;
  lab: DizyQuantReplayLabResult;
  confusion: DizyQuantConfusionMatrix | null;
}>;

export type DizyQuantCampaignDecisionSummary = Readonly<{
  retainExperimental: number;
  rejectCurrentFormula: number;
  insufficientEvidence: number;
}>;

export type DizyQuantCampaignClosureResult = Readonly<{
  schemaVersion: typeof DIZYQUANT_CAMPAIGN_CLOSURE_SCHEMA_VERSION;
  formulaVersion: typeof DIZYQUANT_CAMPAIGN_CLOSURE_FORMULA_VERSION;
  campaignId: string;
  metricId: string;
  status: DizyQuantCampaignClosureStatus;
  recommendation: DizyQuantCampaignClosureRecommendation;
  representativeCoverage: boolean;
  observationCount: number;
  overall: DizyQuantReplayLabResult | null;
  overallConfusion: DizyQuantConfusionMatrix | null;
  cells: readonly DizyQuantCampaignCellStudy[];
  sensitivity: readonly DizyQuantCampaignSensitivityStudy[];
  cellDecisionSummary: DizyQuantCampaignDecisionSummary;
  sensitivityDecisionSummary: DizyQuantCampaignDecisionSummary;
  limitations: readonly string[];
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

const actualDirection = (outcome: number): -1 | 1 => outcome >= 0 ? 1 : -1;

function confusionFor(
  lab: DizyQuantReplayLabResult,
  observations: readonly DizyQuantStudyObservation[],
): DizyQuantConfusionMatrix | null {
  if (!lab.model || !lab.holdout || lab.holdoutCount <= 0 || lab.trainingCount < 0) return null;
  const holdout = observations.slice(lab.trainingCount);
  if (holdout.length !== lab.holdoutCount) return null;
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const item of holdout) {
    const bucket: -1 | 1 = item.predictor >= lab.model.threshold ? 1 : -1;
    const predicted = (bucket * lab.model.direction) as -1 | 1;
    const actual = actualDirection(item.outcome);
    if (predicted === 1 && actual === 1) truePositive += 1;
    else if (predicted === -1 && actual === -1) trueNegative += 1;
    else if (predicted === 1) falsePositive += 1;
    else falseNegative += 1;
  }
  const actualNegative = trueNegative + falsePositive;
  const actualPositive = truePositive + falseNegative;
  return Object.freeze({
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    total: holdout.length,
    falsePositivePct: actualNegative ? falsePositive / actualNegative * 100 : null,
    falseNegativePct: actualPositive ? falseNegative / actualPositive * 100 : null,
  });
}

function decisionSummary(labs: readonly DizyQuantReplayLabResult[]): DizyQuantCampaignDecisionSummary {
  return Object.freeze({
    retainExperimental: labs.filter((lab) => lab.decision === "retain-experimental").length,
    rejectCurrentFormula: labs.filter((lab) => lab.decision === "reject-current-formula").length,
    insufficientEvidence: labs.filter((lab) => lab.decision === "insufficient-evidence").length,
  });
}

function recommendationFor(
  overall: DizyQuantReplayLabResult,
  cells: readonly DizyQuantCampaignCellStudy[],
  sensitivity: readonly DizyQuantCampaignSensitivityStudy[],
): DizyQuantCampaignClosureRecommendation {
  const cellLabs = cells.map((entry) => entry.lab);
  const sensitivityLabs = sensitivity.map((entry) => entry.lab);
  if (
    overall.decision === "insufficient-evidence" ||
    cellLabs.some((lab) => lab.decision === "insufficient-evidence") ||
    sensitivityLabs.some((lab) => lab.decision === "insufficient-evidence")
  ) {
    return "insufficient-evidence";
  }
  if (
    overall.decision === "retain-experimental" &&
    cellLabs.every((lab) => lab.decision === "retain-experimental") &&
    sensitivityLabs.every((lab) => lab.decision === "retain-experimental")
  ) {
    return "retain-experimental";
  }
  if (
    overall.decision === "reject-current-formula" &&
    cellLabs.every((lab) => lab.decision === "reject-current-formula") &&
    sensitivityLabs.every((lab) => lab.decision === "reject-current-formula")
  ) {
    return "reject-current-formula";
  }
  return "revise-current-formula";
}

export function closeDizyQuantCampaign(
  input: DizyQuantCampaignStudyExport | unknown,
): DizyQuantCampaignClosureResult {
  const study = parseDizyQuantCampaignStudyExport(input);
  const emptySummary = decisionSummary([]);
  const base = {
    schemaVersion: DIZYQUANT_CAMPAIGN_CLOSURE_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_CAMPAIGN_CLOSURE_FORMULA_VERSION,
    campaignId: study.campaignId,
    metricId: study.metricId,
    representativeCoverage: study.representativeCoverage,
    observationCount: study.observations.length,
    researchOnly: true as const,
    decisionEligible: false as const,
    signalEligible: false as const,
    executionEligible: false as const,
    promotionEligible: false as const,
  };
  if (!study.representativeCoverage) {
    return Object.freeze({
      ...base,
      status: "awaiting-coverage" as const,
      recommendation: "insufficient-evidence" as const,
      overall: null,
      overallConfusion: null,
      cells: Object.freeze([] as DizyQuantCampaignCellStudy[]),
      sensitivity: Object.freeze([] as DizyQuantCampaignSensitivityStudy[]),
      cellDecisionSummary: emptySummary,
      sensitivityDecisionSummary: emptySummary,
      limitations: Object.freeze([
        "The representative 3×3 campaign matrix is not coverage-ready, so no Replay model fitting or research recommendation was run.",
        "Coverage-ready is a prerequisite for review, not evidence of predictiveness or promotion eligibility.",
        "No campaign closure can automatically influence DizySignals or execution.",
      ]),
    });
  }

  const overall = runDizyQuantReplayLab(study.observations, { metricId: study.metricId });
  const overallConfusion = confusionFor(overall, study.observations);
  const cells = study.cells.map((cell) => {
    const observations = study.observations.filter(
      (entry) => entry.symbol === cell.symbol && entry.regime === cell.regime,
    );
    const lab = runDizyQuantReplayLab(observations, { metricId: study.metricId });
    return Object.freeze({
      symbol: cell.symbol,
      regime: cell.regime,
      observationCount: observations.length,
      lab,
      confusion: confusionFor(lab, observations),
    });
  });
  const sensitivity = [0.2, 0.3, 0.4].map((holdoutFraction) => {
    const lab = runDizyQuantReplayLab(study.observations, {
      metricId: study.metricId,
      holdoutFraction,
      minTrain: 30,
      minHoldout: 10,
    });
    return Object.freeze({
      holdoutFraction,
      lab,
      confusion: confusionFor(lab, study.observations),
    });
  });
  const recommendation = recommendationFor(overall, cells, sensitivity);
  return Object.freeze({
    ...base,
    status: "closed" as const,
    recommendation,
    overall,
    overallConfusion,
    cells: Object.freeze(cells),
    sensitivity: Object.freeze(sensitivity),
    cellDecisionSummary: decisionSummary(cells.map((entry) => entry.lab)),
    sensitivityDecisionSummary: decisionSummary(sensitivity.map((entry) => entry.lab)),
    limitations: Object.freeze([
      "The overall study, all nine symbol×regime cells and three chronological holdout sensitivities are reviewed separately; mixed evidence is labelled revise-current-formula rather than promoted.",
      "False-positive and false-negative rates are descriptive held-out diagnostics and do not establish tradability after fees, slippage or market impact.",
      "The circular-rotation null is a deterministic descriptive baseline, not a universal significance test.",
      "Retain-experimental preserves a research hypothesis only. It does not validate, signal-enable, execute or promote the metric.",
      "Any future signal contribution requires a separate reviewed promotion PR and independent approval.",
    ]),
  });
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Unsafe DizyQuant closure canonical value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new Error("Unsafe DizyQuant closure canonical value");
}

export const canonicalDizyQuantCampaignClosureJson = (value: DizyQuantCampaignClosureResult) =>
  canonical(value);
