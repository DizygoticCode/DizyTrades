export const DIZYBRAIN_WORKSPACE_STORAGE_KEY = "dizybrain-workspace:v1";
export const DIZYBRAIN_MIN_WIDTH = 300;
export const DIZYBRAIN_DEFAULT_WIDTH = 390;
export const DIZYBRAIN_MAX_WIDTH = 560;

export const DIZYBRAIN_MODULES = [
  { id: "overview", label: "Overview", icon: "◫" },
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
    : Object.freeze({ hidden: false as const, availability: flow?.availability ?? "Unavailable", confidence: flow ? `${flow.intelligenceConfidence}% · ${flow.confidenceBand}` : "Unavailable", walls: flow?.walls.candidates.length ?? 0 });

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
