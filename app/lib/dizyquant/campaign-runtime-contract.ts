import type { DizyQuantLiveEvidenceBuildResult } from "./live-evidence-window.ts";

export const DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION =
  "dizyquant-campaign-depth-runtime/1.1.0" as const;
export const DIZYQUANT_CAMPAIGN_REGIME_RUNTIME_VERSION =
  "dizyquant-campaign-regime/1.0.0" as const;
export const DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS = 25 as const;
export const DIZYQUANT_CAMPAIGN_DEPTH_PUBLICATION_MS = 5_000 as const;

export type DizyQuantCampaignRuntimeRegime =
  | "range"
  | "directional"
  | "volatility-shock";
export type DizyQuantCampaignRuntimeDirection = "up" | "down" | "flat";

export type DizyQuantCampaignDepthPublication = Readonly<{
  runtimeVersion: typeof DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION;
  symbol: string;
  sourceTimeMs: number;
  receivedTimeMs: number;
  boundaryTimeMs: number;
  baselineMidpoint: number;
  coverageBandBps: typeof DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS;
  coverageComplete: true;
  sequenceContinuous: true;
  hasGaps: false;
  versionGaps: number;
  regimeFormulaVersion: typeof DIZYQUANT_CAMPAIGN_REGIME_RUNTIME_VERSION;
  regime: DizyQuantCampaignRuntimeRegime;
  regimeDirection: DizyQuantCampaignRuntimeDirection;
  regimeWindowFromMs: number;
  regimeWindowToMs: number;
  selectedShockTimestampMs: number | null;
  shockSelectionRequired: false;
  evidence: DizyQuantLiveEvidenceBuildResult;
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;
