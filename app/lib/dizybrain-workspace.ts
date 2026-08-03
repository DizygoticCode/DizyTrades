import type { DizyBrainSnapshot } from "./dizybrain-snapshot.ts";

export const DIZYBRAIN_WORKSPACE_STORAGE_KEY = "dizybrain-workspace:v1";
export const DIZYBRAIN_MIN_WIDTH = 340;
export const DIZYBRAIN_DEFAULT_WIDTH = 420;
export const DIZYBRAIN_MAX_WIDTH = 560;

export const DIZYBRAIN_MODULES = [
  { id: "overview", label: "Summary", icon: "◫" },
  { id: "signals", label: "Signals", icon: "⌁" },
  { id: "flow", label: "Flow", icon: "≋" },
  { id: "position", label: "Position", icon: "◇" },
  { id: "replay", label: "Replay", icon: "↺" },
  { id: "journal", label: "Journal", icon: "▤" },
  { id: "behaviour", label: "Behaviour", icon: "◎" },
  { id: "diagnostics", label: "Diagnostics", icon: "⚙" },
] as const;

export type DizyBrainWorkspaceModule = (typeof DIZYBRAIN_MODULES)[number]["id"];
export type DizyBrainWorkspacePreferences = Readonly<{
  open: boolean;
  collapsed: boolean;
  width: number;
  selectedModule: DizyBrainWorkspaceModule;
}>;

export type DizyBrainBeginnerOverview = Readonly<{
  tone: "buy" | "sell" | "neutral";
  marketRead: string;
  actionState: string;
  confidenceLabel: string;
  confidencePercent: number;
  summary: string;
  reasons: readonly string[];
  caution: string;
}>;

export const DEFAULT_DIZYBRAIN_PREFERENCES: DizyBrainWorkspacePreferences = Object.freeze({
  open: false,
  collapsed: false,
  width: DIZYBRAIN_DEFAULT_WIDTH,
  selectedModule: "overview",
});

export const isDizyBrainModule = (value: unknown): value is DizyBrainWorkspaceModule =>
  DIZYBRAIN_MODULES.some((module) => module.id === value);

export const clampDizyBrainWidth = (value: unknown) =>
  Math.min(DIZYBRAIN_MAX_WIDTH, Math.max(DIZYBRAIN_MIN_WIDTH,
    typeof value === "number" && Number.isFinite(value) ? value : DIZYBRAIN_DEFAULT_WIDTH));

export const shouldUseDizyBrainOverlay = (availableWidth: number, sidebarWidth: number) =>
  !Number.isFinite(availableWidth) || availableWidth < 560 + clampDizyBrainWidth(sidebarWidth) + 16;

export const presentOverviewFlow = (replay: boolean, flow: null | { availability: string; intelligenceConfidence: number; confidenceBand: string; walls: { candidates: readonly unknown[] } }) =>
  replay
    ? Object.freeze({ hidden: true as const, message: "Live DizyFlow hidden during historical Replay." })
    : Object.freeze({ hidden: false as const, availability: flow?.availability ?? "Unavailable", confidence: flow ? flow.intelligenceConfidence + "% · " + flow.confidenceBand : "Unavailable", walls: flow?.walls.candidates.length ?? 0 });

export function buildDizyBrainBeginnerOverview(snapshot: DizyBrainSnapshot, replay: boolean): DizyBrainBeginnerOverview {
  const confidencePercent = Math.max(0, Math.min(100, snapshot.explanation.confidencePercent));
  const tone = replay ? "neutral" : snapshot.currentDirection === "BUY" ? "buy" : snapshot.currentDirection === "SELL" ? "sell" : "neutral";
  const marketRead = replay ? "Historical review" : snapshot.currentDirection === "BUY" ? "Bullish lean" : snapshot.currentDirection === "SELL" ? "Bearish lean" : "Neutral / mixed";
  const actionState = replay
    ? "Review mode"
    : snapshot.qualified && snapshot.confirmedSignal
      ? "Setup ready"
      : snapshot.activeConfluence >= snapshot.qualificationThreshold
        ? "Watch"
        : snapshot.activeConfluence > 0
          ? "Setup forming"
          : "No setup";
  const confidenceLabel = confidencePercent >= 80 ? "Strong support" : confidencePercent >= 60 ? "Moderate support" : confidencePercent >= 40 ? "Early support" : "Weak support";
  const reasons: string[] = [];
  if (snapshot.confirmedSignal) reasons.push(snapshot.confirmedSignal + " confirmed on the latest closed candle");
  reasons.push(snapshot.activeConfluence + " of 5 setup checks currently agree");
  reasons.push(snapshot.marketBias === "Neutral" ? "Market bias is currently neutral" : snapshot.marketBias + " market bias");
  if (reasons.length < 3) reasons.push(snapshot.marketPhase ? snapshot.marketPhase + " structure phase" : "No clear structure phase yet");
  const summary = replay
    ? "This is historical evidence for review, not a live setup."
    : snapshot.qualified && snapshot.confirmedSignal
      ? "The latest closed candle meets the current deterministic setup rules. Review risk before acting."
      : snapshot.activeConfluence >= snapshot.qualificationThreshold
        ? "The setup has enough supporting checks, but the latest closed candle has not confirmed it."
        : snapshot.activeConfluence > 0
          ? "Some conditions agree, but the setup is still incomplete."
          : "The current evidence is mixed or incomplete. Waiting is the clearest state.";
  const caution = snapshot.explanation.rejectionReasons[0] ?? "Current deterministic checks passed; risk and execution still require your decision.";
  return Object.freeze({ tone, marketRead, actionState, confidenceLabel, confidencePercent, summary, reasons: Object.freeze(reasons.slice(0, 3)), caution });
}

export function parseDizyBrainPreferences(value: string | null): DizyBrainWorkspacePreferences {
  if (!value) return DEFAULT_DIZYBRAIN_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.freeze({
      open: typeof parsed.open === "boolean" ? parsed.open : false,
      collapsed: typeof parsed.collapsed === "boolean" ? parsed.collapsed : false,
      width: clampDizyBrainWidth(parsed.width),
      selectedModule: isDizyBrainModule(parsed.selectedModule) ? parsed.selectedModule : "overview",
    });
  } catch {
    return DEFAULT_DIZYBRAIN_PREFERENCES;
  }
}
