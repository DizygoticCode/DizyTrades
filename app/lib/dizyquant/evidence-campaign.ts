import {
  DIZYQUANT_METRIC_DEFINITIONS,
  DIZYQUANT_METRIC_SET_VERSION,
  DIZYQUANT_RESEARCH_SCHEMA_VERSION,
  type DizyQuantEvidenceGrade,
  type DizyQuantMetricId,
  type DizyQuantReplaySnapshot,
  type DizyQuantSourceKind,
} from "./research.ts";
import {
  DIZYQUANT_LAB_MAX_OBSERVATIONS,
  type DizyQuantStudyObservation,
} from "./lab.ts";

export const DIZYQUANT_EVIDENCE_CAMPAIGN_SCHEMA_VERSION = 1 as const;
export const DIZYQUANT_EVIDENCE_CAMPAIGN_FORMULA_VERSION =
  "dizyquant-evidence-campaign/1.0.0" as const;
export const DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES =
  DIZYQUANT_LAB_MAX_OBSERVATIONS;
export const DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SYMBOLS = 12 as const;
export const DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_REGIMES = 8 as const;
export const DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_MINIMUM_PER_CELL = 500 as const;
export const DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS = Object.freeze([
  "BTC_USDT",
  "ETH_USDT",
  "SOL_USDT",
] as const);
export const DIZYQUANT_INITIAL_EVIDENCE_REGIMES = Object.freeze([
  "range",
  "directional",
  "volatility-shock",
] as const);
export const DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL = 50 as const;

export type DizyQuantCampaignStatus = "collecting" | "coverage-ready";
export type DizyQuantCampaignRejectionReason =
  | "unselected-symbol"
  | "unselected-regime"
  | "evidence-grade-mismatch"
  | "gapped-evidence"
  | "unavailable-evidence"
  | "continuous-coverage-missing"
  | "metric-unavailable";

export type DizyQuantEvidenceCampaignConfig = Readonly<{
  campaignId: string;
  metricId: DizyQuantMetricId;
  metricVersion: 1;
  evidenceGrade: DizyQuantEvidenceGrade;
  outcomeVersion: string;
  selectedSymbols: readonly string[];
  selectedRegimes: readonly string[];
  minimumSamplesPerCell: number;
}>;

export type DizyQuantEvidenceCampaignSampleInput = Readonly<{
  sampleId: string;
  regime: string;
  outcome: number;
  snapshot: DizyQuantReplaySnapshot;
}>;

export type DizyQuantQualifiedCampaignSample = Readonly<{
  sampleId: string;
  timestampMs: number;
  symbol: string;
  regime: string;
  metricId: DizyQuantMetricId;
  metricVersion: 1;
  metricSetVersion: typeof DIZYQUANT_METRIC_SET_VERSION;
  evidenceGrade: DizyQuantEvidenceGrade;
  availability: "fresh";
  sequenceContinuous: boolean | null;
  hasGaps: false;
  sourceKinds: readonly DizyQuantSourceKind[];
  coverage: Readonly<{ fromMs: number | null; toMs: number | null }>;
  predictor: number;
  outcome: number;
  decisionEligible: false;
  signalInfluence: "forbidden";
  promotionEligible: false;
}>;

export type DizyQuantRejectedCampaignSample = Readonly<{
  sampleId: string;
  timestampMs: number;
  symbol: string;
  regime: string;
  reason: DizyQuantCampaignRejectionReason;
}>;

export type DizyQuantCampaignCell = Readonly<{
  symbol: string;
  regime: string;
  submittedCount: number;
  qualifiedCount: number;
  rejectedCount: number;
  minimumRequired: number;
  coverageReady: boolean;
  coverage: Readonly<{ fromMs: number | null; toMs: number | null }>;
}>;

export type DizyQuantEvidenceCampaignResult = Readonly<{
  schemaVersion: typeof DIZYQUANT_EVIDENCE_CAMPAIGN_SCHEMA_VERSION;
  formulaVersion: typeof DIZYQUANT_EVIDENCE_CAMPAIGN_FORMULA_VERSION;
  metricSetVersion: typeof DIZYQUANT_METRIC_SET_VERSION;
  campaignId: string;
  metricId: DizyQuantMetricId;
  metricVersion: 1;
  evidenceGrade: DizyQuantEvidenceGrade;
  outcomeVersion: string;
  status: DizyQuantCampaignStatus;
  representativeCoverage: boolean;
  selectedSymbols: readonly string[];
  selectedRegimes: readonly string[];
  minimumSamplesPerCell: number;
  submittedCount: number;
  qualifiedCount: number;
  rejectedCount: number;
  coverage: Readonly<{ fromMs: number | null; toMs: number | null }>;
  cells: readonly DizyQuantCampaignCell[];
  qualifiedSamples: readonly DizyQuantQualifiedCampaignSample[];
  rejectedSamples: readonly DizyQuantRejectedCampaignSample[];
  rejectionCounts: Readonly<Record<DizyQuantCampaignRejectionReason, number>>;
  observations: readonly DizyQuantStudyObservation[];
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
  limitations: readonly string[];
}>;

const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;
const rejectionReasons: readonly DizyQuantCampaignRejectionReason[] = Object.freeze([
  "unselected-symbol",
  "unselected-regime",
  "evidence-grade-mismatch",
  "gapped-evidence",
  "unavailable-evidence",
  "continuous-coverage-missing",
  "metric-unavailable",
]);
const definitionById = new Map(
  DIZYQUANT_METRIC_DEFINITIONS.map((definition) => [definition.id, definition]),
);

function cleanText(value: string, label: string, maximum = 160) {
  const result = value.trim();
  if (!result || result.length > maximum || /[\u0000-\u001f]/.test(result)) {
    throw new Error(`Invalid ${label}`);
  }
  return result;
}

function normaliseSymbols(values: readonly string[]) {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SYMBOLS
  ) {
    throw new Error("Invalid DizyQuant campaign symbols");
  }
  const symbols = values.map((value) => value.trim().toUpperCase());
  if (
    symbols.some((symbol) => !symbolPattern.test(symbol)) ||
    new Set(symbols).size !== symbols.length
  ) {
    throw new Error("Invalid DizyQuant campaign symbols");
  }
  return Object.freeze(symbols);
}

function normaliseRegimes(values: readonly string[]) {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_REGIMES
  ) {
    throw new Error("Invalid DizyQuant campaign regimes");
  }
  const regimes = values.map((value, index) =>
    cleanText(value, `DizyQuant campaign regime ${index + 1}`, 80),
  );
  if (new Set(regimes).size !== regimes.length) {
    throw new Error("Invalid DizyQuant campaign regimes");
  }
  return Object.freeze(regimes);
}

function validateSnapshot(snapshot: DizyQuantReplaySnapshot) {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    snapshot.schemaVersion !== DIZYQUANT_RESEARCH_SCHEMA_VERSION ||
    snapshot.metricSetVersion !== DIZYQUANT_METRIC_SET_VERSION ||
    !symbolPattern.test(snapshot.symbol) ||
    !Number.isSafeInteger(snapshot.sourceTimeMs) ||
    snapshot.sourceTimeMs <= 0 ||
    !Array.isArray(snapshot.metrics) ||
    !Array.isArray(snapshot.sourceKinds) ||
    snapshot.sourceKinds.length < 1 ||
    new Set(snapshot.sourceKinds).size !== snapshot.sourceKinds.length ||
    snapshot.signalInfluence !== "forbidden" ||
    !["fresh", "gapped", "unavailable"].includes(snapshot.availability)
  ) {
    throw new Error("Invalid DizyQuant campaign snapshot");
  }
  const { fromMs, toMs } = snapshot.coverage;
  if (
    (fromMs === null) !== (toMs === null) ||
    (fromMs !== null &&
      (!Number.isSafeInteger(fromMs) ||
        !Number.isSafeInteger(toMs) ||
        fromMs <= 0 ||
        toMs! < fromMs ||
        toMs! > snapshot.sourceTimeMs + 5_000))
  ) {
    throw new Error("Invalid DizyQuant campaign coverage");
  }
}

function rejectionFor(
  input: DizyQuantEvidenceCampaignSampleInput,
  config: DizyQuantEvidenceCampaignConfig,
  symbols: ReadonlySet<string>,
  regimes: ReadonlySet<string>,
  predictor: number | null,
): DizyQuantCampaignRejectionReason | null {
  if (!symbols.has(input.snapshot.symbol)) return "unselected-symbol";
  if (!regimes.has(input.regime)) return "unselected-regime";
  if (input.snapshot.evidenceGrade !== config.evidenceGrade) {
    return "evidence-grade-mismatch";
  }
  if (input.snapshot.availability === "gapped") return "gapped-evidence";
  if (input.snapshot.availability === "unavailable") return "unavailable-evidence";
  if (
    config.evidenceGrade === "continuous-stream-grade" &&
    (input.snapshot.sequenceContinuous !== true ||
      input.snapshot.hasGaps ||
      input.snapshot.coverage.fromMs === null ||
      input.snapshot.coverage.toMs === null ||
      input.snapshot.coverage.toMs <= input.snapshot.coverage.fromMs)
  ) {
    return "continuous-coverage-missing";
  }
  if (predictor === null) return "metric-unavailable";
  return null;
}

function coverageFor(values: readonly { timestampMs: number }[]) {
  return Object.freeze({
    fromMs: values[0]?.timestampMs ?? null,
    toMs: values.at(-1)?.timestampMs ?? null,
  });
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Unsafe DizyQuant campaign canonical value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Unsafe DizyQuant campaign canonical value");
}

export function createInitialDizyQuantEvidenceCampaignConfig(
  campaignId: string,
  metricId: DizyQuantMetricId,
  outcomeVersion: string,
): DizyQuantEvidenceCampaignConfig {
  const definition = definitionById.get(metricId);
  if (!definition) throw new Error("Unknown DizyQuant campaign metric");
  return Object.freeze({
    campaignId: cleanText(campaignId, "DizyQuant campaign ID"),
    metricId,
    metricVersion: definition.version,
    evidenceGrade: definition.evidenceGrade,
    outcomeVersion: cleanText(outcomeVersion, "DizyQuant campaign outcome version"),
    selectedSymbols: DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS,
    selectedRegimes: DIZYQUANT_INITIAL_EVIDENCE_REGIMES,
    minimumSamplesPerCell: DIZYQUANT_INITIAL_MINIMUM_SAMPLES_PER_CELL,
  });
}

export function buildDizyQuantEvidenceCampaign(
  input: readonly DizyQuantEvidenceCampaignSampleInput[],
  config: DizyQuantEvidenceCampaignConfig,
): DizyQuantEvidenceCampaignResult {
  if (!Array.isArray(input as unknown) || input.length > DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES) {
    throw new Error("DizyQuant campaign exceeds the bounded sample limit");
  }
  const campaignId = cleanText(config.campaignId, "DizyQuant campaign ID");
  const outcomeVersion = cleanText(
    config.outcomeVersion,
    "DizyQuant campaign outcome version",
  );
  const definition = definitionById.get(config.metricId);
  if (
    !definition ||
    config.metricVersion !== definition.version ||
    config.evidenceGrade !== definition.evidenceGrade
  ) {
    throw new Error("Invalid DizyQuant campaign metric contract");
  }
  if (
    !Number.isInteger(config.minimumSamplesPerCell) ||
    config.minimumSamplesPerCell < 1 ||
    config.minimumSamplesPerCell > DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_MINIMUM_PER_CELL
  ) {
    throw new Error("Invalid DizyQuant campaign minimum sample count");
  }

  const selectedSymbols = normaliseSymbols(config.selectedSymbols);
  const selectedRegimes = normaliseRegimes(config.selectedRegimes);
  const symbolSet = new Set(selectedSymbols);
  const regimeSet = new Set(selectedRegimes);
  const sampleIds = new Set<string>();
  const qualifiedSamples: DizyQuantQualifiedCampaignSample[] = [];
  const rejectedSamples: DizyQuantRejectedCampaignSample[] = [];
  const rejectionCounts = Object.fromEntries(
    rejectionReasons.map((reason) => [reason, 0]),
  ) as Record<DizyQuantCampaignRejectionReason, number>;
  let previousTimestamp = -Infinity;

  for (const [index, sample] of input.entries()) {
    if (!sample || typeof sample !== "object") {
      throw new Error(`Invalid DizyQuant campaign sample ${index + 1}`);
    }
    const sampleId = cleanText(
      sample.sampleId,
      `DizyQuant campaign sample ID ${index + 1}`,
    );
    if (sampleIds.has(sampleId)) throw new Error("Duplicate DizyQuant campaign sample ID");
    sampleIds.add(sampleId);
    const regime = cleanText(sample.regime, `DizyQuant campaign sample regime ${index + 1}`, 80);
    if (!Number.isFinite(sample.outcome)) {
      throw new Error(`Invalid DizyQuant campaign outcome ${index + 1}`);
    }
    validateSnapshot(sample.snapshot);
    if (sample.snapshot.sourceTimeMs <= previousTimestamp) {
      throw new Error("DizyQuant campaign samples must be strictly ordered by source time");
    }
    previousTimestamp = sample.snapshot.sourceTimeMs;

    const metric = sample.snapshot.metrics.find((value) => value.id === config.metricId);
    if (
      metric &&
      (metric.version !== config.metricVersion ||
        metric.signalEligible !== false ||
        metric.unit !== definition.unit)
    ) {
      throw new Error("Invalid DizyQuant campaign metric observation");
    }
    const predictor = metric?.value ?? null;
    if (predictor !== null && !Number.isFinite(predictor)) {
      throw new Error("Invalid DizyQuant campaign predictor");
    }
    const reason = rejectionFor(
      { ...sample, sampleId, regime },
      config,
      symbolSet,
      regimeSet,
      predictor,
    );
    if (reason) {
      rejectionCounts[reason] += 1;
      rejectedSamples.push(
        Object.freeze({
          sampleId,
          timestampMs: sample.snapshot.sourceTimeMs,
          symbol: sample.snapshot.symbol,
          regime,
          reason,
        }),
      );
      continue;
    }

    qualifiedSamples.push(
      Object.freeze({
        sampleId,
        timestampMs: sample.snapshot.sourceTimeMs,
        symbol: sample.snapshot.symbol,
        regime,
        metricId: config.metricId,
        metricVersion: config.metricVersion,
        metricSetVersion: DIZYQUANT_METRIC_SET_VERSION,
        evidenceGrade: config.evidenceGrade,
        availability: "fresh",
        sequenceContinuous: sample.snapshot.sequenceContinuous,
        hasGaps: false,
        sourceKinds: Object.freeze([...sample.snapshot.sourceKinds]),
        coverage: Object.freeze({ ...sample.snapshot.coverage }),
        predictor: predictor!,
        outcome: sample.outcome,
        decisionEligible: false,
        signalInfluence: "forbidden",
        promotionEligible: false,
      }),
    );
  }

  const cells = selectedSymbols.flatMap((symbol) =>
    selectedRegimes.map((regime) => {
      const submitted = input.filter(
        (sample) => sample.snapshot.symbol === symbol && sample.regime.trim() === regime,
      );
      const qualified = qualifiedSamples.filter(
        (sample) => sample.symbol === symbol && sample.regime === regime,
      );
      const rejected = rejectedSamples.filter(
        (sample) => sample.symbol === symbol && sample.regime === regime,
      );
      return Object.freeze({
        symbol,
        regime,
        submittedCount: submitted.length,
        qualifiedCount: qualified.length,
        rejectedCount: rejected.length,
        minimumRequired: config.minimumSamplesPerCell,
        coverageReady: qualified.length >= config.minimumSamplesPerCell,
        coverage: coverageFor(qualified),
      });
    }),
  );
  const representativeCoverage = cells.every((cell) => cell.coverageReady);
  const observations = qualifiedSamples.map((sample) =>
    Object.freeze({
      observationId: sample.sampleId,
      timestampMs: sample.timestampMs,
      symbol: sample.symbol,
      regime: sample.regime,
      metricId: sample.metricId,
      predictor: sample.predictor,
      outcome: sample.outcome,
    }),
  );

  return Object.freeze({
    schemaVersion: DIZYQUANT_EVIDENCE_CAMPAIGN_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_EVIDENCE_CAMPAIGN_FORMULA_VERSION,
    metricSetVersion: DIZYQUANT_METRIC_SET_VERSION,
    campaignId,
    metricId: config.metricId,
    metricVersion: config.metricVersion,
    evidenceGrade: config.evidenceGrade,
    outcomeVersion,
    status: representativeCoverage ? "coverage-ready" : "collecting",
    representativeCoverage,
    selectedSymbols,
    selectedRegimes,
    minimumSamplesPerCell: config.minimumSamplesPerCell,
    submittedCount: input.length,
    qualifiedCount: qualifiedSamples.length,
    rejectedCount: rejectedSamples.length,
    coverage: coverageFor(qualifiedSamples),
    cells: Object.freeze(cells),
    qualifiedSamples: Object.freeze(qualifiedSamples),
    rejectedSamples: Object.freeze(rejectedSamples),
    rejectionCounts: Object.freeze(rejectionCounts),
    observations: Object.freeze(observations),
    decisionEligible: false,
    signalEligible: false,
    executionEligible: false,
    promotionEligible: false,
    limitations: Object.freeze([
      "Campaign coverage records qualified public-market evidence; it does not validate a hypothesis.",
      "Continuous-stream samples are excluded unless sequence continuity and exact coverage are proven.",
      "Regime labels are explicit study metadata and are not inferred from hidden participant intent.",
      "No campaign result can automatically influence DizySignals or execution.",
    ]),
  });
}

export const canonicalDizyQuantEvidenceCampaignJson = (
  result: DizyQuantEvidenceCampaignResult,
) => canonical(result);
