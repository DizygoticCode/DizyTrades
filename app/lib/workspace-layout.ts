import {
  DEFAULT_TERMINAL_SETTINGS,
  sanitiseTerminalSettings,
  type UserTerminalSettings,
} from "./config";

export const WORKSPACE_LAYOUT_VERSION = 1 as const;
export const MAX_WORKSPACE_LAYOUTS = 12;
export const MAX_WORKSPACE_LAYOUT_NAME = 40;

export type SavedWorkspaceLayout = Readonly<{
  version: typeof WORKSPACE_LAYOUT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: UserTerminalSettings;
}>;

export type WorkspaceLayoutSummary = Readonly<{
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  market: string;
  timeframe: string;
  orderFlowEnabled: boolean;
}>;

const text = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";

export function normaliseWorkspaceLayoutName(value: unknown) {
  const name = text(value, MAX_WORKSPACE_LAYOUT_NAME);
  if (!name) throw new Error("Workspace name is required.");
  if (/^[.\-_ ]+$/.test(name)) throw new Error("Workspace name must contain a letter or number.");
  return name;
}

const iso = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
};

export function sanitiseSavedWorkspaceLayout(value: unknown): SavedWorkspaceLayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const id = text(input.id, 120);
  if (!/^wsl1_[a-z0-9-]{8,80}$/i.test(id)) return null;
  let name: string;
  try {
    name = normaliseWorkspaceLayoutName(input.name);
  } catch {
    return null;
  }
  const createdAt = iso(input.createdAt, new Date(0).toISOString());
  return Object.freeze({
    version: WORKSPACE_LAYOUT_VERSION,
    id,
    name,
    createdAt,
    updatedAt: iso(input.updatedAt, createdAt),
    settings: sanitiseTerminalSettings(input.settings),
  });
}

export function sanitiseSavedWorkspaceLayouts(value: unknown): readonly SavedWorkspaceLayout[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = new Map<string, SavedWorkspaceLayout>();
  for (const candidate of value) {
    const layout = sanitiseSavedWorkspaceLayout(candidate);
    if (layout) unique.set(layout.id, layout);
  }
  return Object.freeze(
    [...unique.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_WORKSPACE_LAYOUTS),
  );
}

export function workspaceLayoutSummary(layout: SavedWorkspaceLayout): WorkspaceLayoutSummary {
  return Object.freeze({
    id: layout.id,
    name: layout.name,
    createdAt: layout.createdAt,
    updatedAt: layout.updatedAt,
    market: layout.settings.market.symbol,
    timeframe: layout.settings.market.timeframe,
    orderFlowEnabled: layout.settings.orderFlow.enabled,
  });
}

export type BuiltInWorkspacePresetId = "research" | "clean-price" | "order-flow";

export const BUILT_IN_WORKSPACE_PRESETS = Object.freeze([
  Object.freeze({
    id: "research" as const,
    name: "Research default",
    description: "Restore the balanced DizyTrades research view while preserving your current market and favourites.",
  }),
  Object.freeze({
    id: "clean-price" as const,
    name: "Clean price action",
    description: "Keep support, VWAP, trendlines and signals while removing denser pattern and profile layers.",
  }),
  Object.freeze({
    id: "order-flow" as const,
    name: "Order-flow focus",
    description: "Enable DizyFlow depth, heatmap, bubbles and DOM with a quieter chart underneath.",
  }),
]);

export function applyBuiltInWorkspacePreset(
  settings: UserTerminalSettings,
  preset: BuiltInWorkspacePresetId,
): UserTerminalSettings {
  const current = sanitiseTerminalSettings(settings);
  if (preset === "research") {
    return sanitiseTerminalSettings({
      ...DEFAULT_TERMINAL_SETTINGS,
      market: current.market,
      view: {
        ...DEFAULT_TERMINAL_SETTINGS.view,
        appearance: current.view.appearance,
      },
      strategy: current.strategy,
      risk: current.risk,
    });
  }
  if (preset === "clean-price") {
    return sanitiseTerminalSettings({
      ...current,
      view: {
        ...current.view,
        indicatorPackage: true,
        supportResistance: true,
        vwap: true,
        fibonacci: false,
        channels: false,
        trendlines: true,
        triangles: false,
        volumeProfile: false,
        waves: false,
        signals: true,
        provisionalStages: false,
        completedPatternFills: false,
        compactLabels: true,
      },
      orderFlow: {
        ...current.orderFlow,
        enabled: false,
        domVisible: false,
      },
    });
  }
  return sanitiseTerminalSettings({
    ...current,
    view: {
      ...current.view,
      fibonacci: false,
      channels: false,
      trendlines: false,
      triangles: false,
      volumeProfile: false,
      waves: false,
      provisionalStages: false,
      completedPatternFills: false,
      compactLabels: true,
    },
    orderFlow: {
      ...current.orderFlow,
      enabled: true,
      marketDepthVisible: true,
      heatmapVisible: true,
      bubblesVisible: true,
      domVisible: true,
      alertsVisible: true,
      imbalanceVisible: true,
    },
  });
}
