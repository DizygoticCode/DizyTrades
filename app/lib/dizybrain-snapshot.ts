import type { RiskSettings } from "./config.ts";
import type { StrategyAnalysis, StrategySettings } from "./strategy.ts";
import type { DizyFlowEvidenceReference } from "./order-flow/intelligence.ts";

export type DizyBrainDirection = "BUY" | "SELL" | "NEUTRAL";

export type DizyBrainChecklistItem = {
  id: "market-bias" | "market-phase" | "confluence" | "confirmed-signal" | "risk";
  label: string;
  passed: boolean;
};

export type DizyBrainExplanationMetadata = {
  confidencePercent: number;
  currentSetup: string;
  rejectionReasons: string[];
  timeline: Array<{
    label: string;
    detail: string;
    state: "complete" | "active" | "waiting";
  }>;
  source: "closed-candle-strategy-engine";
};

export type DizyBrainSnapshot = {
  provenance: { source: "live" | "replay"; sessionId?: string; replayTimestampMs?: number };
  timestamp: string;
  currentDirection: DizyBrainDirection;
  marketBias: StrategyAnalysis["bias"];
  marketPhase: string;
  longScore: number;
  shortScore: number;
  activeConfluence: number;
  qualificationThreshold: number;
  qualified: boolean;
  confirmedSignal: "BUY" | "SELL" | null;
  leverage: number;
  riskPercent: number;
  checklist: DizyBrainChecklistItem[];
  explanation: DizyBrainExplanationMetadata;
  /** Optional live public-flow evidence. It is display-only and never enters scoring. */
  dizyFlowEvidence: DizyFlowEvidenceReference;
};

export function createDizyBrainSnapshot(input: {
  analysis: StrategyAnalysis;
  strategy: StrategySettings;
  risk: RiskSettings;
  latestClosedCandleTime: number | null;
  provenance?: DizyBrainSnapshot["provenance"];
  dizyFlowEvidence?: DizyFlowEvidenceReference;
}): DizyBrainSnapshot {
  const { analysis, strategy, risk } = input;
  const currentDirection: DizyBrainDirection = analysis.scoreLong > analysis.scoreShort
    ? "BUY"
    : analysis.scoreShort > analysis.scoreLong ? "SELL" : "NEUTRAL";
  const activeConfluence = Math.max(analysis.scoreLong, analysis.scoreShort);
  const qualificationThreshold = strategy.requireMinConfluence ? strategy.minConfluence : 1;
  const currentSignal = input.latestClosedCandleTime === null
    ? undefined
    : analysis.tradeSignals.findLast((signal) => signal.time === input.latestClosedCandleTime);
  const confirmedSignal = currentSignal?.label ?? null;
  const directionConsistent = confirmedSignal !== null && confirmedSignal === currentDirection;
  const qualified = activeConfluence >= qualificationThreshold && directionConsistent;
  const biasAvailable = analysis.bias !== "Neutral";
  const phaseAvailable = Boolean(analysis.phase);
  const riskAvailable = Number.isFinite(risk.riskPct) && Number.isFinite(risk.leverage);
  const checklist: DizyBrainChecklistItem[] = [
    { id: "market-bias", label: `${analysis.bias} market bias`, passed: biasAvailable },
    { id: "market-phase", label: `${analysis.phase} phase identified`, passed: phaseAvailable },
    { id: "confluence", label: `${activeConfluence} / 5 deterministic confluence`, passed: activeConfluence >= qualificationThreshold },
    { id: "confirmed-signal", label: "Current confirmed-candle context available", passed: directionConsistent },
    { id: "risk", label: `Risk gate ${risk.riskPct}% · ${risk.leverage}×`, passed: riskAvailable },
  ];
  const rejectionReasons: string[] = [];
  if (!biasAvailable) rejectionReasons.push("Market bias has not been confirmed.");
  if (!phaseAvailable) rejectionReasons.push("A recognised structure phase is not available.");
  if (activeConfluence < qualificationThreshold) rejectionReasons.push(`Confluence is ${activeConfluence}/5; the setup has not reached the qualification threshold.`);
  if (!riskAvailable) rejectionReasons.push("The risk gate cannot be evaluated yet.");
  if (!directionConsistent) rejectionReasons.push("No direction-consistent signal exists on the current confirmed candle.");

  return {
    provenance: input.provenance ?? { source: "live" },
    timestamp: input.latestClosedCandleTime === null ? new Date(0).toISOString() : new Date(input.latestClosedCandleTime * 1000).toISOString(),
    currentDirection,
    marketBias: analysis.bias,
    marketPhase: analysis.phase,
    longScore: analysis.scoreLong,
    shortScore: analysis.scoreShort,
    activeConfluence,
    qualificationThreshold,
    qualified,
    confirmedSignal,
    leverage: risk.leverage,
    riskPercent: risk.riskPct,
    checklist,
    explanation: {
      confidencePercent: activeConfluence * 20,
      currentSetup: `${currentDirection}-leaning current setup`,
      rejectionReasons,
      source: "closed-candle-strategy-engine",
      timeline: [
        { label: "Market context", detail: biasAvailable ? `${analysis.bias} bias detected` : "Waiting for confirmed market context", state: biasAvailable ? "complete" : "waiting" },
        { label: "Structure phase", detail: phaseAvailable ? analysis.phase : "No deterministic phase identified yet", state: phaseAvailable ? "complete" : "waiting" },
        { label: "Current confluence", detail: `${activeConfluence} of 5 current confluence inputs`, state: activeConfluence > 0 ? "active" : "waiting" },
        { label: "Risk gate", detail: `${risk.riskPct}% · ${risk.leverage}×`, state: riskAvailable ? "complete" : "waiting" },
        { label: "Current setup direction", detail: `${currentDirection}-leaning`, state: activeConfluence > 0 ? "complete" : "active" },
      ],
    },
    dizyFlowEvidence: input.provenance?.source === "replay"
      ? { available:false,snapshotTimeMs:null,inputHash:null,confidence:null,findingCodes:[] }
      : input.dizyFlowEvidence ?? { available:false,snapshotTimeMs:null,inputHash:null,confidence:null,findingCodes:[] },
  };
}
