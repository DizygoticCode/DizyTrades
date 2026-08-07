import {
  createInitialDizyQuantEvidenceCampaignConfig,
  DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES,
} from "./evidence-campaign.ts";
import {
  beginDizyQuantEvidenceSample,
  canonicalDizyQuantEvidenceDatasetJson,
  DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
  DizyQuantEvidenceRecorder,
  type DizyQuantOutcomeObservation,
  type DizyQuantPendingEvidenceSample,
  type DizyQuantRecordedEvidenceSample,
} from "./evidence-recorder.ts";
import type { DizyQuantCampaignDepthPublication } from "./campaign-runtime-contract.ts";
import { DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS } from "./evidence-campaign.ts";

export const DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_SCHEMA_VERSION = 1 as const;
export const DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_FORMULA_VERSION =
  "dizyquant-campaign-recorder-runner/1.0.0" as const;
export const DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID =
  "depth-imbalance-25bps-representative-v1" as const;
export const DIZYQUANT_REPRESENTATIVE_METRIC_ID = "depth-imbalance-25bps" as const;
export const DIZYQUANT_CAMPAIGN_SYMBOL_RESIDENCY_MS = 180_000 as const;
export const DIZYQUANT_CAMPAIGN_PREDICTOR_OFFSET_MS = 110_000 as const;
export const DIZYQUANT_CAMPAIGN_EXPIRED_ID_RETENTION = 100 as const;

export type DizyQuantCampaignResidency = Readonly<{
  slot: number;
  symbol: (typeof DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS)[number];
  fromMs: number;
  predictorBoundaryMs: number;
  toMs: number;
}>;

export type DizyQuantCampaignRecorderRunnerState = Readonly<{
  schemaVersion: typeof DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_SCHEMA_VERSION;
  formulaVersion: typeof DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_FORMULA_VERSION;
  campaignId: typeof DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID;
  metricId: typeof DIZYQUANT_REPRESENTATIVE_METRIC_ID;
  outcomeVersion: typeof DIZYQUANT_MIDPOINT_OUTCOME_VERSION;
  completed: readonly DizyQuantRecordedEvidenceSample[];
  pending: readonly DizyQuantPendingEvidenceSample[];
  expiredOutcomeCount: number;
  recentExpiredSampleIds: readonly string[];
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;

export type DizyQuantCampaignRunnerMutation = Readonly<{
  openedSampleIds: readonly string[];
  completedSampleIds: readonly string[];
  expiredSampleIds: readonly string[];
  changed: boolean;
}>;

const emptyMutation = (): DizyQuantCampaignRunnerMutation =>
  Object.freeze({
    openedSampleIds: Object.freeze([] as string[]),
    completedSampleIds: Object.freeze([] as string[]),
    expiredSampleIds: Object.freeze([] as string[]),
    changed: false,
  });

function safeTime(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${label}`);
  return value;
}

function cleanExpiredIds(value: unknown) {
  if (!Array.isArray(value) || value.length > DIZYQUANT_CAMPAIGN_EXPIRED_ID_RETENTION) {
    throw new Error("Invalid DizyQuant expired sample audit");
  }
  const ids = value.map((entry) => String(entry));
  if (
    ids.some((entry) => !entry || entry.length > 160 || /[\u0000-\u001f]/.test(entry)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error("Invalid DizyQuant expired sample audit");
  }
  return ids;
}

export function dizyQuantCampaignResidencyAt(timestampMs: number): DizyQuantCampaignResidency {
  const timestamp = safeTime(timestampMs, "DizyQuant campaign residency time");
  const slot = Math.floor(timestamp / DIZYQUANT_CAMPAIGN_SYMBOL_RESIDENCY_MS);
  const fromMs = slot * DIZYQUANT_CAMPAIGN_SYMBOL_RESIDENCY_MS;
  const symbol = DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS[
    slot % DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS.length
  ];
  return Object.freeze({
    slot,
    symbol,
    fromMs,
    predictorBoundaryMs: fromMs + DIZYQUANT_CAMPAIGN_PREDICTOR_OFFSET_MS,
    toMs: fromMs + DIZYQUANT_CAMPAIGN_SYMBOL_RESIDENCY_MS,
  });
}

export function dizyQuantCampaignSampleId(
  kind: "representative" | "shock",
  symbol: string,
  predictorBoundaryMs: number,
) {
  safeTime(predictorBoundaryMs, "DizyQuant campaign predictor boundary");
  if (!DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS.some((value) => value === symbol)) {
    throw new Error("Invalid DizyQuant campaign sample symbol");
  }
  return `dq-${kind === "representative" ? "rep" : "shock"}-v1:${symbol}:${predictorBoundaryMs}`;
}

function representativeSnapshot(publication: DizyQuantCampaignDepthPublication) {
  const ladder = publication.evidence.snapshots.ladder;
  if (
    !ladder ||
    ladder.availability !== "fresh" ||
    ladder.sourceTimeMs !== publication.sourceTimeMs ||
    ladder.evidenceGrade !== "snapshot-grade"
  ) {
    return null;
  }
  const metric = ladder.metrics.find((value) => value.id === DIZYQUANT_REPRESENTATIVE_METRIC_ID);
  if (!metric || metric.value === null || !Number.isFinite(metric.value)) return null;
  return ladder;
}

function shockSnapshot(publication: DizyQuantCampaignDepthPublication) {
  if (publication.regime !== "volatility-shock") return null;
  const resilience = publication.evidence.snapshots.resilience;
  if (
    !resilience ||
    resilience.availability !== "fresh" ||
    resilience.evidenceGrade !== "continuous-stream-grade" ||
    resilience.sequenceContinuous !== true ||
    resilience.hasGaps ||
    resilience.sourceTimeMs !== publication.boundaryTimeMs
  ) {
    return null;
  }
  return resilience;
}

function validatePending(value: DizyQuantPendingEvidenceSample) {
  const reconstructed = beginDizyQuantEvidenceSample({
    sampleId: value.sampleId,
    regime: value.regime,
    baselineMidpoint: value.baselineMidpoint,
    snapshot: value.snapshot,
  });
  if (
    reconstructed.schemaVersion !== value.schemaVersion ||
    reconstructed.formulaVersion !== value.formulaVersion ||
    reconstructed.regimeLabelVersion !== value.regimeLabelVersion ||
    reconstructed.outcomeVersion !== value.outcomeVersion ||
    reconstructed.predictorTimeMs !== value.predictorTimeMs ||
    reconstructed.outcomeDueAtMs !== value.outcomeDueAtMs ||
    reconstructed.outcomeExpiresAtMs !== value.outcomeExpiresAtMs ||
    reconstructed.researchOnly !== value.researchOnly ||
    reconstructed.decisionEligible !== value.decisionEligible ||
    reconstructed.signalEligible !== value.signalEligible ||
    reconstructed.executionEligible !== value.executionEligible ||
    reconstructed.promotionEligible !== value.promotionEligible
  ) {
    throw new Error("Invalid persisted DizyQuant pending sample");
  }
  return reconstructed;
}

export function parseDizyQuantCampaignRecorderRunnerState(
  value: unknown,
): DizyQuantCampaignRecorderRunnerState {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid DizyQuant campaign runner state");
  }
  const candidate = value as Partial<DizyQuantCampaignRecorderRunnerState>;
  if (
    candidate.schemaVersion !== DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_SCHEMA_VERSION ||
    candidate.formulaVersion !== DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_FORMULA_VERSION ||
    candidate.campaignId !== DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID ||
    candidate.metricId !== DIZYQUANT_REPRESENTATIVE_METRIC_ID ||
    candidate.outcomeVersion !== DIZYQUANT_MIDPOINT_OUTCOME_VERSION ||
    !Array.isArray(candidate.completed) ||
    !Array.isArray(candidate.pending) ||
    !Number.isSafeInteger(candidate.expiredOutcomeCount) ||
    Number(candidate.expiredOutcomeCount) < 0 ||
    candidate.researchOnly !== true ||
    candidate.decisionEligible !== false ||
    candidate.signalEligible !== false ||
    candidate.executionEligible !== false ||
    candidate.promotionEligible !== false
  ) {
    throw new Error("Invalid DizyQuant campaign runner state");
  }
  if (
    candidate.completed.length + candidate.pending.length >
    DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES
  ) {
    throw new Error("DizyQuant campaign runner state exceeds the bounded sample limit");
  }

  const recorder = DizyQuantEvidenceRecorder.fromJson(
    canonicalDizyQuantEvidenceDatasetJson(candidate.completed),
  );
  const completed = recorder.records();
  const completedIds = new Set(completed.map((record) => record.sampleId));
  const pending = candidate.pending.map((record) => validatePending(record));
  const pendingIds = new Set<string>();
  for (const record of pending) {
    if (completedIds.has(record.sampleId) || pendingIds.has(record.sampleId)) {
      throw new Error("Duplicate DizyQuant campaign runner sample ID");
    }
    pendingIds.add(record.sampleId);
  }
  const recentExpiredSampleIds = cleanExpiredIds(candidate.recentExpiredSampleIds);

  return Object.freeze({
    schemaVersion: DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_FORMULA_VERSION,
    campaignId: DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID,
    metricId: DIZYQUANT_REPRESENTATIVE_METRIC_ID,
    outcomeVersion: DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
    completed,
    pending: Object.freeze(pending),
    expiredOutcomeCount: candidate.expiredOutcomeCount!,
    recentExpiredSampleIds: Object.freeze(recentExpiredSampleIds),
    researchOnly: true,
    decisionEligible: false,
    signalEligible: false,
    executionEligible: false,
    promotionEligible: false,
  });
}

export function emptyDizyQuantCampaignRecorderRunnerState(): DizyQuantCampaignRecorderRunnerState {
  return Object.freeze({
    schemaVersion: DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_SCHEMA_VERSION,
    formulaVersion: DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_FORMULA_VERSION,
    campaignId: DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID,
    metricId: DIZYQUANT_REPRESENTATIVE_METRIC_ID,
    outcomeVersion: DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
    completed: Object.freeze([] as DizyQuantRecordedEvidenceSample[]),
    pending: Object.freeze([] as DizyQuantPendingEvidenceSample[]),
    expiredOutcomeCount: 0,
    recentExpiredSampleIds: Object.freeze([] as string[]),
    researchOnly: true,
    decisionEligible: false,
    signalEligible: false,
    executionEligible: false,
    promotionEligible: false,
  });
}

export class DizyQuantCampaignRecorderRunner {
  private recorder: DizyQuantEvidenceRecorder;
  private pending = new Map<string, DizyQuantPendingEvidenceSample>();
  private expiredOutcomeCount = 0;
  private recentExpiredSampleIds: string[] = [];

  constructor(state: DizyQuantCampaignRecorderRunnerState = emptyDizyQuantCampaignRecorderRunnerState()) {
    const validated = parseDizyQuantCampaignRecorderRunnerState(state);
    this.recorder = DizyQuantEvidenceRecorder.fromJson(
      canonicalDizyQuantEvidenceDatasetJson(validated.completed),
    );
    this.expiredOutcomeCount = validated.expiredOutcomeCount;
    this.recentExpiredSampleIds = [...validated.recentExpiredSampleIds];
    for (const record of validated.pending) {
      const restored = this.recorder.begin({
        sampleId: record.sampleId,
        regime: record.regime,
        baselineMidpoint: record.baselineMidpoint,
        snapshot: record.snapshot,
      });
      this.pending.set(restored.sampleId, restored);
    }
  }

  private hasSample(sampleId: string) {
    return this.pending.has(sampleId) || this.recorder.records().some((record) => record.sampleId === sampleId);
  }

  private open(
    sampleId: string,
    publication: DizyQuantCampaignDepthPublication,
    snapshot: NonNullable<DizyQuantCampaignDepthPublication["evidence"]["snapshots"]["ladder"]>,
  ) {
    if (this.hasSample(sampleId)) return null;
    const stats = this.recorder.stats();
    if (stats.pendingCount + stats.completedCount >= stats.maximumSamples) return null;
    const pending = this.recorder.begin({
      sampleId,
      regime: publication.regime,
      baselineMidpoint: publication.baselineMidpoint,
      snapshot,
    });
    this.pending.set(pending.sampleId, pending);
    return pending.sampleId;
  }

  consumePublication(publication: DizyQuantCampaignDepthPublication): DizyQuantCampaignRunnerMutation {
    const residency = dizyQuantCampaignResidencyAt(publication.boundaryTimeMs);
    if (
      publication.symbol !== residency.symbol ||
      publication.boundaryTimeMs !== residency.predictorBoundaryMs
    ) {
      return emptyMutation();
    }

    const opened: string[] = [];
    const representative = representativeSnapshot(publication);
    if (representative) {
      const id = this.open(
        dizyQuantCampaignSampleId("representative", publication.symbol, publication.boundaryTimeMs),
        publication,
        representative,
      );
      if (id) opened.push(id);
    }

    const shock = shockSnapshot(publication);
    if (shock) {
      const id = this.open(
        dizyQuantCampaignSampleId("shock", publication.symbol, publication.boundaryTimeMs),
        publication,
        shock,
      );
      if (id) opened.push(id);
    }

    return Object.freeze({
      openedSampleIds: Object.freeze(opened),
      completedSampleIds: Object.freeze([] as string[]),
      expiredSampleIds: Object.freeze([] as string[]),
      changed: opened.length > 0,
    });
  }

  observeOutcome(observation: DizyQuantOutcomeObservation): DizyQuantCampaignRunnerMutation {
    const result = this.recorder.observe(observation);
    for (const record of result.completed) this.pending.delete(record.sampleId);
    for (const sampleId of result.expiredSampleIds) this.pending.delete(sampleId);
    if (result.expiredSampleIds.length) {
      this.expiredOutcomeCount += result.expiredSampleIds.length;
      this.recentExpiredSampleIds = [
        ...this.recentExpiredSampleIds,
        ...result.expiredSampleIds,
      ].slice(-DIZYQUANT_CAMPAIGN_EXPIRED_ID_RETENTION);
    }
    const completedSampleIds = result.completed.map((record) => record.sampleId);
    return Object.freeze({
      openedSampleIds: Object.freeze([] as string[]),
      completedSampleIds: Object.freeze(completedSampleIds),
      expiredSampleIds: Object.freeze([...result.expiredSampleIds]),
      changed: completedSampleIds.length > 0 || result.expiredSampleIds.length > 0,
    });
  }

  state(): DizyQuantCampaignRecorderRunnerState {
    return Object.freeze({
      schemaVersion: DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_SCHEMA_VERSION,
      formulaVersion: DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_FORMULA_VERSION,
      campaignId: DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID,
      metricId: DIZYQUANT_REPRESENTATIVE_METRIC_ID,
      outcomeVersion: DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
      completed: this.recorder.records(),
      pending: Object.freeze(
        [...this.pending.values()].sort(
          (left, right) =>
            left.predictorTimeMs - right.predictorTimeMs ||
            left.sampleId.localeCompare(right.sampleId),
        ),
      ),
      expiredOutcomeCount: this.expiredOutcomeCount,
      recentExpiredSampleIds: Object.freeze([...this.recentExpiredSampleIds]),
      researchOnly: true,
      decisionEligible: false,
      signalEligible: false,
      executionEligible: false,
      promotionEligible: false,
    });
  }

  campaign() {
    return this.recorder.campaign(
      createInitialDizyQuantEvidenceCampaignConfig(
        DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID,
        DIZYQUANT_REPRESENTATIVE_METRIC_ID,
        DIZYQUANT_MIDPOINT_OUTCOME_VERSION,
      ),
    );
  }

  stats() {
    const recorder = this.recorder.stats();
    const campaign = this.campaign();
    return Object.freeze({
      ...recorder,
      expiredOutcomeCount: this.expiredOutcomeCount,
      campaignStatus: campaign.status,
      campaignQualifiedCount: campaign.qualifiedCount,
      campaignRejectedCount: campaign.rejectedCount,
      representativeCoverage: campaign.representativeCoverage,
      cells: campaign.cells,
    });
  }
}
