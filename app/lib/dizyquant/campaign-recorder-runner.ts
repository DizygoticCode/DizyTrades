import {
  createInitialDizyQuantEvidenceCampaignConfig,
  DIZYQUANT_EVIDENCE_CAMPAIGN_MAX_SAMPLES,
  DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS,
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
import {
  DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
  DIZYQUANT_CAMPAIGN_REGIME_RUNTIME_VERSION,
  type DizyQuantCampaignDepthPublication,
  type DizyQuantCampaignRuntimeRegime,
} from "./campaign-runtime-contract.ts";
import type { DizyQuantReplaySnapshot } from "./research.ts";

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

export type DizyQuantCampaignSampleKind = "representative" | "shock";
export type DizyQuantCampaignSampleProvenance = Readonly<{
  sampleId: string;
  kind: DizyQuantCampaignSampleKind;
  symbol: string;
  residencySlot: number;
  residencyFromMs: number;
  residencyToMs: number;
  publicationRuntimeVersion: typeof DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION;
  regimeFormulaVersion: typeof DIZYQUANT_CAMPAIGN_REGIME_RUNTIME_VERSION;
  regime: DizyQuantCampaignRuntimeRegime;
  boundaryTimeMs: number;
  publicationSourceTimeMs: number;
  predictorSourceTimeMs: number;
  selectedShockTimestampMs: number | null;
}>;

export type DizyQuantCampaignRecorderRunnerState = Readonly<{
  schemaVersion: typeof DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_SCHEMA_VERSION;
  formulaVersion: typeof DIZYQUANT_CAMPAIGN_RECORDER_RUNNER_FORMULA_VERSION;
  campaignId: typeof DIZYQUANT_REPRESENTATIVE_CAMPAIGN_ID;
  metricId: typeof DIZYQUANT_REPRESENTATIVE_METRIC_ID;
  outcomeVersion: typeof DIZYQUANT_MIDPOINT_OUTCOME_VERSION;
  completed: readonly DizyQuantRecordedEvidenceSample[];
  pending: readonly DizyQuantPendingEvidenceSample[];
  provenance: readonly DizyQuantCampaignSampleProvenance[];
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
  kind: DizyQuantCampaignSampleKind,
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

function validateProvenance(
  value: DizyQuantCampaignSampleProvenance,
  sample: DizyQuantPendingEvidenceSample | DizyQuantRecordedEvidenceSample,
) {
  if (
    !value ||
    typeof value !== "object" ||
    value.sampleId !== sample.sampleId ||
    (value.kind !== "representative" && value.kind !== "shock") ||
    value.symbol !== sample.snapshot.symbol ||
    !DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS.some((symbol) => symbol === value.symbol) ||
    !Number.isSafeInteger(value.residencySlot) ||
    value.residencySlot < 0 ||
    value.publicationRuntimeVersion !== DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION ||
    value.regimeFormulaVersion !== DIZYQUANT_CAMPAIGN_REGIME_RUNTIME_VERSION ||
    value.regime !== sample.regime ||
    value.predictorSourceTimeMs !== sample.snapshot.sourceTimeMs
  ) {
    throw new Error("Invalid DizyQuant campaign sample provenance");
  }
  const residency = dizyQuantCampaignResidencyAt(value.boundaryTimeMs);
  if (
    residency.slot !== value.residencySlot ||
    residency.symbol !== value.symbol ||
    residency.fromMs !== value.residencyFromMs ||
    residency.toMs !== value.residencyToMs ||
    residency.predictorBoundaryMs !== value.boundaryTimeMs ||
    value.publicationSourceTimeMs > value.boundaryTimeMs ||
    value.boundaryTimeMs - value.publicationSourceTimeMs > 1_000 ||
    dizyQuantCampaignSampleId(value.kind, value.symbol, value.boundaryTimeMs) !== value.sampleId
  ) {
    throw new Error("DizyQuant campaign provenance does not match its residency");
  }
  if (value.kind === "representative") {
    if (value.predictorSourceTimeMs !== value.publicationSourceTimeMs) {
      throw new Error("DizyQuant representative source clocks do not match");
    }
  } else if (
    value.regime !== "volatility-shock" ||
    value.predictorSourceTimeMs !== value.boundaryTimeMs
  ) {
    throw new Error("DizyQuant shock provenance does not match the resilience clock");
  }
  if (value.regime === "volatility-shock") {
    if (
      !Number.isSafeInteger(value.selectedShockTimestampMs) ||
      value.selectedShockTimestampMs! <= value.boundaryTimeMs - 60_000 ||
      value.selectedShockTimestampMs! >= value.boundaryTimeMs
    ) {
      throw new Error("Invalid DizyQuant selected shock provenance");
    }
  } else if (value.selectedShockTimestampMs !== null) {
    throw new Error("Non-shock DizyQuant provenance carries a shock timestamp");
  }
  return Object.freeze({ ...value });
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
    !Array.isArray(candidate.provenance) ||
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
  const samples = new Map<string, DizyQuantPendingEvidenceSample | DizyQuantRecordedEvidenceSample>();
  for (const record of completed) samples.set(record.sampleId, record);
  for (const record of pending) samples.set(record.sampleId, record);
  if (candidate.provenance.length !== samples.size) {
    throw new Error("DizyQuant campaign provenance coverage is incomplete");
  }
  const provenanceIds = new Set<string>();
  const provenance = candidate.provenance.map((entry) => {
    const sample = samples.get(entry.sampleId);
    if (!sample || provenanceIds.has(entry.sampleId)) {
      throw new Error("Invalid DizyQuant campaign provenance sample ID");
    }
    provenanceIds.add(entry.sampleId);
    return validateProvenance(entry, sample);
  });
  if (provenanceIds.size !== samples.size) {
    throw new Error("DizyQuant campaign provenance coverage is incomplete");
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
    provenance: Object.freeze(provenance),
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
    provenance: Object.freeze([] as DizyQuantCampaignSampleProvenance[]),
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
  private provenance = new Map<string, DizyQuantCampaignSampleProvenance>();
  private expiredOutcomeCount = 0;
  private recentExpiredSampleIds: string[] = [];

  constructor(state: DizyQuantCampaignRecorderRunnerState = emptyDizyQuantCampaignRecorderRunnerState()) {
    const validated = parseDizyQuantCampaignRecorderRunnerState(state);
    this.recorder = DizyQuantEvidenceRecorder.fromJson(
      canonicalDizyQuantEvidenceDatasetJson(validated.completed),
    );
    this.expiredOutcomeCount = validated.expiredOutcomeCount;
    this.recentExpiredSampleIds = [...validated.recentExpiredSampleIds];
    for (const entry of validated.provenance) this.provenance.set(entry.sampleId, entry);
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

  private open(
    kind: DizyQuantCampaignSampleKind,
    sampleId: string,
    publication: DizyQuantCampaignDepthPublication,
    snapshot: DizyQuantReplaySnapshot,
  ) {
    if (this.provenance.has(sampleId)) return null;
    const stats = this.recorder.stats();
    if (stats.pendingCount + stats.completedCount >= stats.maximumSamples) return null;
    const residency = dizyQuantCampaignResidencyAt(publication.boundaryTimeMs);
    const pending = this.recorder.begin({
      sampleId,
      regime: publication.regime,
      baselineMidpoint: publication.baselineMidpoint,
      snapshot,
    });
    const provenance = validateProvenance(
      {
        sampleId,
        kind,
        symbol: publication.symbol,
        residencySlot: residency.slot,
        residencyFromMs: residency.fromMs,
        residencyToMs: residency.toMs,
        publicationRuntimeVersion: publication.runtimeVersion,
        regimeFormulaVersion: publication.regimeFormulaVersion,
        regime: publication.regime,
        boundaryTimeMs: publication.boundaryTimeMs,
        publicationSourceTimeMs: publication.sourceTimeMs,
        predictorSourceTimeMs: snapshot.sourceTimeMs,
        selectedShockTimestampMs: publication.selectedShockTimestampMs,
      },
      pending,
    );
    this.pending.set(pending.sampleId, pending);
    this.provenance.set(sampleId, provenance);
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
        "representative",
        dizyQuantCampaignSampleId("representative", publication.symbol, publication.boundaryTimeMs),
        publication,
        representative,
      );
      if (id) opened.push(id);
    }

    const shock = shockSnapshot(publication);
    if (shock) {
      const id = this.open(
        "shock",
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
    for (const sampleId of result.expiredSampleIds) {
      this.pending.delete(sampleId);
      this.provenance.delete(sampleId);
    }
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
      provenance: Object.freeze(
        [...this.provenance.values()].sort(
          (left, right) =>
            left.boundaryTimeMs - right.boundaryTimeMs || left.sampleId.localeCompare(right.sampleId),
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
