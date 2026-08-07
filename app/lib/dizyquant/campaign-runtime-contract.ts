import type { DizyQuantLiveEvidenceBuildResult } from "./live-evidence-window.ts";

export const DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION =
  "dizyquant-campaign-depth-runtime/1.0.0" as const;
export const DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS = 25 as const;
export const DIZYQUANT_CAMPAIGN_DEPTH_PUBLICATION_MS = 5_000 as const;

export type DizyQuantCampaignDepthPublication = Readonly<{
  runtimeVersion: typeof DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION;
  symbol: string;
  sourceTimeMs: number;
  receivedTimeMs: number;
  boundaryTimeMs: number;
  coverageBandBps: typeof DIZYQUANT_CAMPAIGN_DEPTH_COVERAGE_BPS;
  coverageComplete: boolean;
  sequenceContinuous: boolean | null;
  hasGaps: boolean;
  versionGaps: number;
  shockSelectionRequired: true;
  evidence: DizyQuantLiveEvidenceBuildResult;
  researchOnly: true;
  decisionEligible: false;
  signalEligible: false;
  executionEligible: false;
  promotionEligible: false;
}>;
