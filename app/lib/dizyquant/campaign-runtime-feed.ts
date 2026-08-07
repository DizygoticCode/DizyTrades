import {
  DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS,
  DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
  type DizyQuantCampaignDepthPublication,
} from "./campaign-runtime-contract.ts";
import type { DizyQuantLiveEvidenceBuildResult } from "./live-evidence-window.ts";

export const DIZYQUANT_RUNTIME_CAMPAIGN_SYMBOLS = Object.freeze([
  "BTC_USDT",
  "ETH_USDT",
  "SOL_USDT",
] as const);

const latest = new Map<string, DizyQuantCampaignDepthPublication>();
const listeners = new Set<(value: DizyQuantCampaignDepthPublication) => void>();

export function isDizyQuantRuntimeCampaignSymbol(value: string) {
  return DIZYQUANT_RUNTIME_CAMPAIGN_SYMBOLS.includes(
    value.trim().toUpperCase() as (typeof DIZYQUANT_RUNTIME_CAMPAIGN_SYMBOLS)[number],
  );
}

function validEvidence(
  value: unknown,
  symbol: string,
  boundaryTimeMs: number,
): value is DizyQuantLiveEvidenceBuildResult {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Partial<DizyQuantLiveEvidenceBuildResult>;
  return (
    evidence.symbol === symbol &&
    evidence.windowToMs === boundaryTimeMs &&
    Boolean(evidence.snapshots) &&
    Array.isArray(evidence.limitations) &&
    evidence.researchOnly === true &&
    evidence.decisionEligible === false &&
    evidence.signalEligible === false &&
    evidence.executionEligible === false &&
    evidence.promotionEligible === false
  );
}

export function isDizyQuantCampaignDepthPublication(
  value: unknown,
): value is DizyQuantCampaignDepthPublication {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DizyQuantCampaignDepthPublication>;
  if (
    candidate.runtimeVersion !== DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION ||
    typeof candidate.symbol !== "string" ||
    !isDizyQuantRuntimeCampaignSymbol(candidate.symbol) ||
    !Number.isSafeInteger(candidate.sourceTimeMs) ||
    !Number.isSafeInteger(candidate.receivedTimeMs) ||
    !Number.isSafeInteger(candidate.boundaryTimeMs) ||
    candidate.coverageBandBps !== DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS ||
    typeof candidate.coverageComplete !== "boolean" ||
    !(
      candidate.sequenceContinuous === true ||
      candidate.sequenceContinuous === false ||
      candidate.sequenceContinuous === null
    ) ||
    typeof candidate.hasGaps !== "boolean" ||
    !Number.isSafeInteger(candidate.versionGaps) ||
    Number(candidate.versionGaps) < 0 ||
    candidate.shockSelectionRequired !== true ||
    candidate.researchOnly !== true ||
    candidate.decisionEligible !== false ||
    candidate.signalEligible !== false ||
    candidate.executionEligible !== false ||
    candidate.promotionEligible !== false
  ) {
    return false;
  }
  return validEvidence(candidate.evidence, candidate.symbol, candidate.boundaryTimeMs!);
}

export function publishDizyQuantCampaignDepthPublication(value: unknown) {
  if (!isDizyQuantCampaignDepthPublication(value)) return null;
  const previous = latest.get(value.symbol);
  if (previous && value.boundaryTimeMs <= previous.boundaryTimeMs) return previous;
  latest.set(value.symbol, value);
  for (const listener of listeners) {
    try {
      listener(value);
    } catch {}
  }
  return value;
}

export function readDizyQuantCampaignDepthPublication(symbol: string) {
  return latest.get(symbol.trim().toUpperCase()) ?? null;
}

export function subscribeDizyQuantCampaignDepthPublications(
  listener: (value: DizyQuantCampaignDepthPublication) => void,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearDizyQuantCampaignDepthPublication(symbol?: string) {
  if (symbol === undefined) latest.clear();
  else latest.delete(symbol.trim().toUpperCase());
}
