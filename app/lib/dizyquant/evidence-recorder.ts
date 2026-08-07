import {
  buildDizyQuantEvidenceCampaign,
  DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES,
  type DizyQuantEvidenceCampaignConfig,
  type DizyQuantEvidenceCampaignResult,
  type DizyQuantEvidenceCampaignSampleInput,
} from "./evidence-campaign.ts";
import {
  DIZYQUANT_METRIC_DEFINITIONS,
  DIZYQUANT_METRIC_SET_VERSION,
  DIZYQUANT_RESEARCH_SCHEMA_VERSION,
  type DizyQuantReplaySnapshot,
} from "./research.ts";

export const DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION = 1 as const;
export const DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION =
  "dizyquant-evidence-recorder/1.0.0" as const;
export const DIZYQUANT_MIDPOINT_OUTCOME_VERSION =
  "midpoint-response-60s-bps/1.0.0" as const;
export const DIZYQUANT_MIDPOINT_OUTCOME_HORIZON_MS = 60_000 as const;
export const DIZYQUANT_MIDPOINT_OUTCOME_MAX_LAG_MS = 5_000 as const;
export const DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION =
  "dizyquant-explicit-regime-label/1.0.0" as const;
export const DIZYQUANT_EVIDENCE_REGIMES = Object.freeze([
  "range",
  "directional",
  "volatility-shock",
] as const);

export type DizyQuantEvidenceRegime =
  (typeof DIZYQUANT_EVIDENCE_REGIMES)[number];

export type DizyQuantPendingEvidenceSample = Readonly<{
  schemaVersion: typeof DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION;
  formulaVersion: typeof DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION;
  sampleId: string;
  regime: DizyQuantEvidenceRegime;
  regimeLabelVersion: typeof DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION;
  outcomeVersion: typeof DIZYQUANT_MIDPOINT_OUTCOME_VERSION;
  predictorTimeMs: number;
  outcomeDueAtMs: number;
  outcomeExpiresAtMs: number;
  baselineMidpoint: number;
  snapshot: DizyQuantReplaySnapshot;
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

export type DizyQuantRecordedEvidenceSample = Readonly<{
  schemaVersion: typeof DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION;
  formulaVersion: typeof DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION;
  sampleId: string;
  regime: DizyQuantEvidenceRegime;
  regimeLabelVersion: typeof DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION;
  outcomeVersion: typeof DIZYQUANT_MIDPOINT_OUTCOME_VERSION;
  predictorTimeMs: number;
  outcomeDueAtMs: number;
  outcomeTimeMs: number;
  baselineMidpoint: number;
  outcomeMidpoint: number;
  outcomeBps: number;
  snapshot: DizyQuantReplaySnapshot;
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

export type DizyQuantEvidenceDataset = Readonly<{
  schemaVersion: typeof DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION;
  formulaVersion: typeof DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION;
  outcomeVersion: typeof DIZYQUANT_MIDPOINT_OUTCOME_VERSION;
  regimeLabelVersion: typeof DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION;
  metricSetVersion: typeof DIZYQUANT_METRIC_SET_VERSION;
  records: readonly DizyQuantRecordedEvidenceSample[];
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

export type DizyQuantOutcomeObservation = Readonly<{
  symbol: string;
  timestampMs: number;
  midpoint: number;
}>;

export type DizyQuantEvidenceRecorderObservationResult = Readonly<{
  completed: readonly DizyQuantRecordedEvidenceSample[];
  expiredSampleIds: readonly string[];
}>;

const metricIds = new Set(DIZYQUANT_METRIC_DEFINITIONS.map((value) => value.id));
const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;

function cleanText(value: string, label: string, maximum = 160) {
  const clean = value.trim();
  if (!clean || clean.length > maximum || /[\u0000-\u001f]/.test(clean)) {
    throw new Error(`Invalid ${label}`);
  }
  return clean;
}

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${label}`);
  return value;
}

function safePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${label}`);
  return value;
}

function regime(value: string): DizyQuantEvidenceRegime {
  if (!DIZYQUANT_EVIDENCE_REGIMES.includes(value as DizyQuantEvidenceRegime)) {
    throw new Error("Invalid DizyQuant evidence regime");
  }
  return value as DizyQuantEvidenceRegime;
}

function freezeReplaySnapshot(snapshot: DizyQuantReplaySnapshot): DizyQuantReplaySnapshot {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    snapshot.schemaVersion !== DIZYQUANT_RESEARCH_SCHEMA_VERSION ||
    snapshot.metricSetVersion !== DIZYQUANT_METRIC_SET_VERSION ||
    !symbolPattern.test(snapshot.symbol) ||
    !Number.isSafeInteger(snapshot.sourceTimeMs) ||
    snapshot.sourceTimeMs <= 0 ||
    !["snapshot-grade", "continuous-stream-grade"].includes(snapshot.evidenceGrade) ||
    !["fresh", "gapped", "unavailable"].includes(snapshot.availability) ||
    !Array.isArray(snapshot.sourceKinds) ||
    snapshot.sourceKinds.length < 1 ||
    new Set(snapshot.sourceKinds).size !== snapshot.sourceKinds.length ||
    !Array.isArray(snapshot.metrics) ||
    !Array.isArray(snapshot.limitations) ||
    snapshot.signalInfluence !== "forbidden"
  ) {
    throw new Error("Invalid DizyQuant Replay predictor snapshot");
  }
  const { fromMs, toMs } = snapshot.coverage;
  if (
    (fromMs === null) !== (toMs === null) ||
    (fromMs !== null &&
      (!Number.isSafeInteger(fromMs) ||
        !Number.isSafeInteger(toMs) ||
        fromMs <= 0 ||
        toMs! < fromMs ||
        toMs! > snapshot.sourceTimeMs))
  ) {
    throw new Error("DizyQuant predictor coverage may not extend beyond predictor time");
  }
  const metrics = snapshot.metrics.map((metric) => {
    if (
      !metric ||
      typeof metric !== "object" ||
      !metricIds.has(metric.id) ||
      metric.version !== 1 ||
      metric.signalEligible !== false ||
      (metric.value !== null && !Number.isFinite(metric.value))
    ) {
      throw new Error("Invalid DizyQuant Replay predictor metric");
    }
    return Object.freeze({ ...metric });
  });
  if (new Set(metrics.map((metric) => metric.id)).size !== metrics.length) {
    throw new Error("Duplicate DizyQuant Replay predictor metric");
  }
  const limitations = snapshot.limitations.map((value, index) =>
    cleanText(String(value), `DizyQuant predictor limitation ${index + 1}`),
  );
  return Object.freeze({
    ...snapshot,
    sourceKinds: Object.freeze([...snapshot.sourceKinds]),
    coverage: Object.freeze({ fromMs, toMs }),
    metrics: Object.freeze(metrics),
    limitations: Object.freeze(limitations),
  });
}

export function beginDizyQuantEvidenceSample(input: Readonly<{
  sampleId: string;
  regime: DizyQuantEvidenceRegime;
  baselineMidpoint: number;
  snapshot: DizyQuantReplaySnapshot;
}>): DizyQuantPendingEvidenceSample {
  const snapshot = freezeReplaySnapshot(input.snapshot);
  const sampleId = cleanText(input.sampleId, "DizyQuant evidence sample ID");
  const predictorTimeMs = safePositiveInteger(
    snapshot.sourceTimeMs,
    "DizyQuant predictor time",
  );
  const outcomeDueAtMs = predictorTimeMs + DIZYQUANT_MIDPOINT_OUTCOME_HORIZON_MS;
  const outcomeExpiresAtMs = outcomeDueAtMs + DIZYQUANT_MIDPOINT_OUTCOME_MAX_LAG_MS;
  if (!Number.isSafeInteger(outcomeExpiresAtMs)) {
    throw new Error("DizyQuant outcome horizon exceeds the safe time boundary");
  }
  return Object.freeze({
    schemaVersion: DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION,
    sampleId,
    regime: regime(input.regime),
    regimeLabelVersion: DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION,
    outcomeVersion: DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
    predictorTimeMs,
    outcomeDueAtMs,
    outcomeExpiresAtMs,
    baselineMidpoint: positive(input.baselineMidpoint, "DizyQuant baseline midpoint"),
    snapshot,
    researchOnly: true,
    decisionEligible: false,
    signalEligible: false,
    executionEligible: false,
    promotionEligible: false,
  });
}

export function completeDizyQuantEvidenceSample(
  pending: DizyQuantPendingEvidenceSample,
  observation: DizyQuantOutcomeObservation,
): DizyQuantRecordedEvidenceSample {
  if (observation.symbol !== pending.snapshot.symbol) {
    throw new Error("DizyQuant outcome symbol does not match predictor symbol");
  }
  const outcomeTimeMs = safePositiveInteger(
    observation.timestampMs,
    "DizyQuant outcome time",
  );
  if (outcomeTimeMs < pending.outcomeDueAtMs) {
    throw new Error("DizyQuant outcome was observed before the future horizon");
  }
  if (outcomeTimeMs > pending.outcomeExpiresAtMs) {
    throw new Error("DizyQuant outcome was observed outside the bounded horizon lag");
  }
  const outcomeMidpoint = positive(observation.midpoint, "DizyQuant outcome midpoint");
  const outcomeBps =
    ((outcomeMidpoint - pending.baselineMidpoint) / pending.baselineMidpoint) * 10_000;
  if (!Number.isFinite(outcomeBps)) throw new Error("Invalid DizyQuant outcome arithmetic");
  return Object.freeze({
    schemaVersion: pending.schemaVersion,
    formulaVersion: pending.formulaVersion,
    sampleId: pending.sampleId,
    regime: pending.regime,
    regimeLabelVersion: pending.regimeLabelVersion,
    outcomeVersion: pending.outcomeVersion,
    predictorTimeMs: pending.predictorTimeMs,
    outcomeDueAtMs: pending.outcomeDueAtMs,
    outcomeTimeMs,
    baselineMidpoint: pending.baselineMidpoint,
    outcomeMidpoint,
    outcomeBps,
    snapshot: pending.snapshot,
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
    if (!Number.isFinite(value)) throw new Error("Unsafe DizyQuant recorder canonical value");
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
  throw new Error("Unsafe DizyQuant recorder canonical value");
}

function orderedRecords(records: readonly DizyQuantRecordedEvidenceSample[]) {
  if (!Array.isArray(records) || records.length > DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES) {
    throw new Error("DizyQuant evidence dataset exceeds the bounded sample limit");
  }
  const ids = new Set<string>();
  return Object.freeze(
    records
      .map((record) => {
        if (
          record.schemaVersion !== DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION ||
          record.formulaVersion !== DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION ||
          record.regimeLabelVersion !== DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION ||
          record.outcomeVersion !== DIZYQUANT_MIDPOINT_OUTCOME_VERSION ||
          record.researchOnly !== true ||
          record.decisionEligible !== false ||
          record.signalEligible !== false ||
          record.executionEligible !== false ||
          record.promotionEligible !== false
        ) {
          throw new Error("Invalid DizyQuant recorded evidence boundary");
        }
        if (ids.has(record.sampleId)) throw new Error("Duplicate DizyQuant recorded sample ID");
        ids.add(record.sampleId);
        const pending = beginDizyQuantEvidenceSample({
          sampleId: record.sampleId,
          regime: regime(record.regime),
          baselineMidpoint: record.baselineMidpoint,
          snapshot: record.snapshot,
        });
        const completed = completeDizyQuantEvidenceSample(pending, {
          symbol: record.snapshot.symbol,
          timestampMs: record.outcomeTimeMs,
          midpoint: record.outcomeMidpoint,
        });
        if (Math.abs(completed.outcomeBps - record.outcomeBps) > 1e-12) {
          throw new Error("DizyQuant recorded outcome does not match its midpoint evidence");
        }
        return completed;
      })
      .sort(
        (left, right) =>
          left.predictorTimeMs - right.predictorTimeMs || left.sampleId.localeCompare(right.sampleId),
      ),
  );
}

export function buildDizyQuantEvidenceDataset(
  records: readonly DizyQuantRecordedEvidenceSample[],
): DizyQuantEvidenceDataset {
  return Object.freeze({
    schemaVersion: DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION,
    outcomeVersion: DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
    regimeLabelVersion: DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION,
    metricSetVersion: DIZYQUANT_METRIC_SET_VERSION,
    records: orderedRecords(records),
    researchOnly: true,
    decisionEligible: false,
    signalEligible: false,
    executionEligible: false,
    promotionEligible: false,
  });
}

export function canonicalDizyQuantEvidenceDatasetJson(
  records: readonly DizyQuantRecordedEvidenceSample[],
) {
  return canonical(buildDizyQuantEvidenceDataset(records));
}

export function parseDizyQuantEvidenceDatasetJson(value: string): DizyQuantEvidenceDataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid DizyQuant evidence dataset JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid DizyQuant evidence dataset");
  }
  const candidate = parsed as Partial<DizyQuantEvidenceDataset>;
  if (
    candidate.schemaVersion !== DIZYQUANT_EVIDENCE_RECORDER_SCHEMA_VERSION ||
    candidate.formulaVersion !== DIZYQUANT_EVIDENCE_RECORDER_FORMULA_VERSION ||
    candidate.outcomeVersion !== DIZYQUANT_MIDPOINT_OUTCOME_VERSION ||
    candidate.regimeLabelVersion !== DIZYQUANT_EXPLICIT_REGIME_LABEL_VERSION ||
    candidate.metricSetVersion !== DIZYQUANT_METRIC_SET_VERSION ||
    !Array.isArray(candidate.records) ||
    candidate.researchOnly !== true ||
    candidate.decisionEligible !== false ||
    candidate.signalEligible !== false ||
    candidate.executionEligible !== false ||
    candidate.promotionEligible !== false
  ) {
    throw new Error("Invalid DizyQuant evidence dataset contract");
  }
  return buildDizyQuantEvidenceDataset(
    candidate.records as readonly DizyQuantRecordedEvidenceSample[],
  );
}

export function toDizyQuantEvidenceCampaignSamples(
  records: readonly DizyQuantRecordedEvidenceSample[],
  config: DizyQuantEvidenceCampaignConfig,
): readonly DizyQuantEvidenceCampaignSampleInput[] {
  if (config.outcomeVersion !== DIZYQUANT_MIDPOINT_OUTCOME_VERSION) {
    throw new Error("DizyQuant campaign outcome version does not match recorder output");
  }
  return Object.freeze(
    orderedRecords(records)
      .filter((record) => record.snapshot.metrics.some((metric) => metric.id === config.metricId))
      .map((record) =>
        Object.freeze({
          sampleId: record.sampleId,
          regime: record.regime,
          outcome: record.outcomeBps,
          snapshot: record.snapshot,
        }),
      ),
  );
}

export function runRecordedDizyQuantEvidenceCampaign(
  records: readonly DizyQuantRecordedEvidenceSample[],
  config: DizyQuantEvidenceCampaignConfig,
): DizyQuantEvidenceCampaignResult {
  return buildDizyQuantEvidenceCampaign(
    toDizyQuantEvidenceCampaignSamples(records, config),
    config,
  );
}

export class DizyQuantEvidenceRecorder {
  private readonly pending = new Map<string, DizyQuantPendingEvidenceSample>();
  private readonly completed = new Map<string, DizyQuantRecordedEvidenceSample>();
  private expiredCount = 0;

  begin(input: Parameters<typeof beginDizyQuantEvidenceSample>[0]) {
    if (
      this.pending.size + this.completed.size >= DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES
    ) {
      throw new Error("DizyQuant evidence recorder reached the bounded sample limit");
    }
    const sample = beginDizyQuantEvidenceSample(input);
    if (this.pending.has(sample.sampleId) || this.completed.has(sample.sampleId)) {
      throw new Error("Duplicate DizyQuant evidence sample ID");
    }
    this.pending.set(sample.sampleId, sample);
    return sample;
  }

  observe(observation: DizyQuantOutcomeObservation): DizyQuantEvidenceRecorderObservationResult {
    if (!symbolPattern.test(observation.symbol)) {
      throw new Error("Invalid DizyQuant outcome symbol");
    }
    safePositiveInteger(observation.timestampMs, "DizyQuant outcome time");
    positive(observation.midpoint, "DizyQuant outcome midpoint");
    const completed: DizyQuantRecordedEvidenceSample[] = [];
    const expiredSampleIds: string[] = [];
    for (const pending of [...this.pending.values()].sort(
      (left, right) => left.predictorTimeMs - right.predictorTimeMs,
    )) {
      if (pending.snapshot.symbol !== observation.symbol) continue;
      if (observation.timestampMs < pending.outcomeDueAtMs) continue;
      this.pending.delete(pending.sampleId);
      if (observation.timestampMs > pending.outcomeExpiresAtMs) {
        this.expiredCount += 1;
        expiredSampleIds.push(pending.sampleId);
        continue;
      }
      const record = completeDizyQuantEvidenceSample(pending, observation);
      this.completed.set(record.sampleId, record);
      completed.push(record);
    }
    return Object.freeze({
      completed: Object.freeze(completed),
      expiredSampleIds: Object.freeze(expiredSampleIds),
    });
  }

  records() {
    return buildDizyQuantEvidenceDataset([...this.completed.values()]).records;
  }

  stats() {
    return Object.freeze({
      pendingCount: this.pending.size,
      completedCount: this.completed.size,
      expiredCount: this.expiredCount,
      maximumSamples: DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES,
    });
  }

  exportJson() {
    return canonicalDizyQuantEvidenceDatasetJson([...this.completed.values()]);
  }

  campaign(config: DizyQuantEvidenceCampaignConfig) {
    return runRecordedDizyQuantEvidenceCampaign([...this.completed.values()], config);
  }

  static fromJson(value: string) {
    const dataset = parseDizyQuantEvidenceDatasetJson(value);
    const recorder = new DizyQuantEvidenceRecorder();
    for (const record of dataset.records) recorder.completed.set(record.sampleId, record);
    return recorder;
  }
}
