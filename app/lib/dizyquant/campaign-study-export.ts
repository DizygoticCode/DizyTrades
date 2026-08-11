import {
  DIZYQUANT_INITIAL_EVIDENCE_REGIMES,
  DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS,
  DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
  type DizyQuantCampaignRejectionReason,
  type DizyQuantCampaignStatus,
} from "./evidence-campaign.ts";
import {
  DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID,
  DIZYQUANT_REPRESENTATIVE_METRIC_ID,
  DizyQuantCampaignRecorderRunner,
  parseDizyQuantCampaignRecorderRunnerState,
  type DizyQuantCampaignRecorderRunnerState,
} from "./campaign-recorder-runner.ts";
import { DIZYQUANT_MIDPOINT_OUTCOME_VERSION } from "./evidence-recorder.ts";
import type { DizyQuantStudyObservation } from "./lab.ts";

export const DIZYQUANT_CAMPAIGN_STUDY_EXPORT_SCHEMA_VERSION = 1 as const;
export const DIZYQUANT_CAMPAIGN_STUDY_EXPORT_FORMULA_VERSION =
  "dizyquant-campaign-study-export/1.0.0" as const;

const rejectionReasons = Object.freeze([
  "unselected-symbol",
  "unselected-regime",
  "evidence-grade-mismatch",
  "gapped-evidence",
  "unavailable-evidence",
  "continuous-coverage-missing",
  "metric-unavailable",
] as const satisfies readonly DizyQuantCampaignRejectionReason[]);

export type DizyQuantCampaignStudyCell = Readonly<{
  symbol: string;
  regime: string;
  submittedCount: number;
  qualifiedCount: number;
  rejectedCount: number;
  minimumRequired: number;
  coverageReady: boolean;
  coverage: Readonly<{ fromMs: number | null; toMs: number | null }>;
}>;

export type DizyQuantCampaignStudyExport = Readonly<{
  schemaVersion: typeof DIZYQUANT_CAMPAIGN_STUDY_EXPORT_SCHEMA_VERSION;
  formulaVersion: typeof DIZYQUANT_CAMPAIGN_STUDY_EXPORT_FORMULA_VERSION;
  campaignId: typeof DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID;
  metricId: typeof DIZYQUANT_REPRESENTATIVE_METRIC_ID;
  outcomeVersion: typeof DIZYQUANT_MIDPOINT_OUTCOME_VERSION;
  status: DizyQuantCampaignStatus;
  representativeCoverage: boolean;
  selectedSymbols: readonly string[];
  selectedRegimes: readonly string[];
  minimumSamplesPerCell: number;
  submittedCount: number;
  qualifiedCount: number;
  rejectedCount: number;
  rejectionCounts: Readonly<Record<DizyQuantCampaignRejectionReason, number>>;
  cells: readonly DizyQuantCampaignStudyCell[];
  observations: readonly DizyQuantStudyObservation[];
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

const finiteInteger = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;

function coverage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { fromMs?: unknown; toMs?: unknown };
  if ((candidate.fromMs === null) !== (candidate.toMs === null)) return null;
  if (candidate.fromMs === null && candidate.toMs === null) {
    return Object.freeze({ fromMs: null, toMs: null });
  }
  if (
    !Number.isSafeInteger(candidate.fromMs) ||
    !Number.isSafeInteger(candidate.toMs) ||
    Number(candidate.fromMs) <= 0 ||
    Number(candidate.toMs) < Number(candidate.fromMs)
  ) {
    return null;
  }
  return Object.freeze({ fromMs: Number(candidate.fromMs), toMs: Number(candidate.toMs) });
}

function observation(value: unknown, previousTime: number, ids: Set<string>) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DizyQuantStudyObservation>;
  const observationId = typeof candidate.observationId === "string" ? candidate.observationId.trim() : "";
  const symbol = typeof candidate.symbol === "string" ? candidate.symbol.trim().toUpperCase() : "";
  const regime = typeof candidate.regime === "string" ? candidate.regime.trim() : "";
  if (
    !observationId ||
    observationId.length > 160 ||
    /[\u0000-\u001f]/.test(observationId) ||
    ids.has(observationId) ||
    !DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS.some((entry) => entry === symbol) ||
    !DIZYQUANT_INITIAL_EVIDENCE_REGIMES.some((entry) => entry === regime) ||
    candidate.metricId !== DIZYQUANT_REPRESENTATIVE_METRIC_ID ||
    !Number.isSafeInteger(candidate.timestampMs) ||
    Number(candidate.timestampMs) <= previousTime ||
    !Number.isFinite(candidate.predictor) ||
    !Number.isFinite(candidate.outcome)
  ) {
    return null;
  }
  ids.add(observationId);
  return Object.freeze({
    observationId,
    timestampMs: Number(candidate.timestampMs),
    symbol,
    regime,
    metricId: DIZYQUANT_REPRESENTATIVE_METRIC_ID,
    predictor: Number(candidate.predictor),
    outcome: Number(candidate.outcome),
  }) satisfies DizyQuantStudyObservation;
}

export function buildDizyQuantCampaignStudyExport(
  state: DizyQuantCampaignRecorderRunnerState,
): DizyQuantCampaignStudyExport {
  const runner = new DizyQuantCampaignRecorderRunner(
    parseDizyQuantCampaignRecorderRunnerState(state),
  );
  const campaign = runner.campaign();
  return Object.freeze({
    schemaVersion: DIZYQUANT_CAMPAIGN_STUDY_EXPORT_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_CAMPAIGN_STUDY_EXPORT_FORMULA_VERSION,
    campaignId: DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID,
    metricId: DIZYQUANT_REPRESENTATIVE_METRIC_ID,
    outcomeVersion: DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
    status: campaign.status,
    representativeCoverage: campaign.representativeCoverage,
    selectedSymbols: Object.freeze([...campaign.selectedSymbols]),
    selectedRegimes: Object.freeze([...campaign.selectedRegimes]),
    minimumSamplesPerCell: campaign.minimumSamplesPerCell,
    submittedCount: campaign.submittedCount,
    qualifiedCount: campaign.qualifiedCount,
    rejectedCount: campaign.rejectedCount,
    rejectionCounts: Object.freeze({ ...campaign.rejectionCounts }),
    cells: Object.freeze(campaign.cells.map((cell) => Object.freeze({
      symbol: cell.symbol,
      regime: cell.regime,
      submittedCount: cell.submittedCount,
      qualifiedCount: cell.qualifiedCount,
      rejectedCount: cell.rejectedCount,
      minimumRequired: cell.minimumRequired,
      coverageReady: cell.coverageReady,
      coverage: Object.freeze({ ...cell.coverage }),
    }))),
    observations: Object.freeze(campaign.observations.map((entry) => Object.freeze({ ...entry }))),
    researchOnly: true,
    decisionEligible: false,
    signalEligible: false,
    executionEligible: false,
    promotionEligible: false,
  });
}

export function parseDizyQuantCampaignStudyExport(value: unknown): DizyQuantCampaignStudyExport {
  if (!value || typeof value !== "object") throw new Error("Invalid DizyQuant campaign study export");
  const candidate = value as Partial<DizyQuantCampaignStudyExport>;
  if (
    candidate.schemaVersion !== DIZYQUANT_CAMPAIGN_STUDY_EXPORT_SCHEMA_VERSION ||
    candidate.formulaVersion !== DIZYQUANT_CAMPAIGN_STUDY_EXPORT_FORMULA_VERSION ||
    candidate.campaignId !== DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID ||
    candidate.metricId !== DIZYQUANT_REPRESENTATIVE_METRIC_ID ||
    candidate.outcomeVersion !== DIZYQUANT_MIDPOINT_OUTCOME_VERSION ||
    (candidate.status !== "collecting" && candidate.status !== "coverage-ready") ||
    typeof candidate.representativeCoverage !== "boolean" ||
    !Array.isArray(candidate.selectedSymbols) ||
    !Array.isArray(candidate.selectedRegimes) ||
    !Array.isArray(candidate.cells) ||
    !Array.isArray(candidate.observations) ||
    !candidate.rejectionCounts ||
    typeof candidate.rejectionCounts !== "object" ||
    candidate.researchOnly !== true ||
    candidate.decisionEligible !== false ||
    candidate.signalEligible !== false ||
    candidate.executionEligible !== false ||
    candidate.promotionEligible !== false
  ) {
    throw new Error("Invalid DizyQuant campaign study export contract");
  }
  if (
    candidate.selectedSymbols.length !== DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS.length ||
    candidate.selectedSymbols.some((entry, index) => entry !== DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS[index]) ||
    candidate.selectedRegimes.length !== DIZYQUANT_INITIAL_EVIDENCE_REGIMES.length ||
    candidate.selectedRegimes.some((entry, index) => entry !== DIZYQUANT_INITIAL_EVIDENCE_REGIMES[index]) ||
    candidate.minimumSamplesPerCell !== DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL
  ) {
    throw new Error("Invalid DizyQuant campaign study matrix");
  }
  const submittedCount = finiteInteger(candidate.submittedCount);
  const qualifiedCount = finiteInteger(candidate.qualifiedCount);
  const rejectedCount = finiteInteger(candidate.rejectedCount);
  if (
    submittedCount === null || qualifiedCount === null || rejectedCount === null ||
    submittedCount !== qualifiedCount + rejectedCount
  ) {
    throw new Error("Invalid DizyQuant campaign study counts");
  }
  const counts = {} as Record<DizyQuantCampaignRejectionReason, number>;
  let rejectionTotal = 0;
  for (const reason of rejectionReasons) {
    const count = finiteInteger((candidate.rejectionCounts as Record<string, unknown>)[reason]);
    if (count === null) throw new Error("Invalid DizyQuant campaign rejection counts");
    counts[reason] = count;
    rejectionTotal += count;
  }
  if (rejectionTotal !== rejectedCount) throw new Error("DizyQuant rejection counts do not reconcile");

  const ids = new Set<string>();
  const observations: DizyQuantStudyObservation[] = [];
  let previousTime = -Infinity;
  for (const entry of candidate.observations) {
    const parsed = observation(entry, previousTime, ids);
    if (!parsed) throw new Error("Invalid DizyQuant campaign study observation");
    observations.push(parsed);
    previousTime = parsed.timestampMs;
  }
  if (observations.length !== qualifiedCount) {
    throw new Error("DizyQuant qualified observation count does not reconcile");
  }

  const expectedCells = DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS.flatMap((symbol) =>
    DIZYQUANT_INITIAL_EVIDENCE_REGIMES.map((regime) => ({ symbol, regime })),
  );
  if (candidate.cells.length !== expectedCells.length) throw new Error("Invalid DizyQuant campaign cells");
  const cells = candidate.cells.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid DizyQuant campaign cell");
    const cell = entry as Partial<DizyQuantCampaignStudyCell>;
    const expected = expectedCells[index];
    const cellSubmitted = finiteInteger(cell.submittedCount);
    const cellQualified = finiteInteger(cell.qualifiedCount);
    const cellRejected = finiteInteger(cell.rejectedCount);
    const cellCoverage = coverage(cell.coverage);
    if (
      cell.symbol !== expected.symbol ||
      cell.regime !== expected.regime ||
      cellSubmitted === null || cellQualified === null || cellRejected === null ||
      cellSubmitted !== cellQualified + cellRejected ||
      cell.minimumRequired !== DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL ||
      typeof cell.coverageReady !== "boolean" ||
      cell.coverageReady !== (cellQualified >= DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL) ||
      !cellCoverage
    ) {
      throw new Error("Invalid DizyQuant campaign cell contract");
    }
    const matching = observations.filter(
      (item) => item.symbol === expected.symbol && item.regime === expected.regime,
    );
    if (matching.length !== cellQualified) throw new Error("DizyQuant campaign cell count does not reconcile");
    const expectedFrom = matching[0]?.timestampMs ?? null;
    const expectedTo = matching.at(-1)?.timestampMs ?? null;
    if (cellCoverage.fromMs !== expectedFrom || cellCoverage.toMs !== expectedTo) {
      throw new Error("DizyQuant campaign cell coverage does not reconcile");
    }
    return Object.freeze({
      symbol: expected.symbol,
      regime: expected.regime,
      submittedCount: cellSubmitted,
      qualifiedCount: cellQualified,
      rejectedCount: cellRejected,
      minimumRequired: DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
      coverageReady: cell.coverageReady,
      coverage: cellCoverage,
    });
  });
  const representativeCoverage = cells.every((cell) => cell.coverageReady);
  if (
    candidate.representativeCoverage !== representativeCoverage ||
    candidate.status !== (representativeCoverage ? "coverage-ready" : "collecting")
  ) {
    throw new Error("DizyQuant campaign coverage status does not reconcile");
  }

  return Object.freeze({
    schemaVersion: DIZYQUANT_CAMPAIGN_STUDY_EXPORT_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_CAMPAIGN_STUDY_EXPORT_FORMULA_VERSION,
    campaignId: DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID,
    metricId: DIZYQUANT_REPRESENTATIVE_METRIC_ID,
    outcomeVersion: DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
    status: candidate.status,
    representativeCoverage,
    selectedSymbols: DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS,
    selectedRegimes: DIZYQUANT_INITIAL_EVIDENCE_REGIMES,
    minimumSamplesPerCell: DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
    submittedCount,
    qualifiedCount,
    rejectedCount,
    rejectionCounts: Object.freeze(counts),
    cells: Object.freeze(cells),
    observations: Object.freeze(observations),
    researchOnly: true,
    decisionEligible: false,
    signalEligible: false,
    executionEligible: false,
    promotionEligible: false,
  });
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Unsafe DizyQuant study export canonical value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new Error("Unsafe DizyQuant study export canonical value");
}

export const canonicalDizyQuantCampaignStudyExportJson = (value: DizyQuantCampaignStudyExport) =>
  canonical(parseDizyQuantCampaignStudyExport(value));
