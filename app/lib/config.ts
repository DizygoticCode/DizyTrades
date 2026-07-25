import type { StrategySettings } from "./strategy";

export type ViewSettings = {
  supportResistance: boolean;
  vwap: boolean;
  fibonacci: boolean;
  channels: boolean;
  trendlines: boolean;
  triangles: boolean;
  volumeProfile: boolean;
  waves: boolean;
  signals: boolean;
  labelSize: "Small" | "Medium" | "Large";
  volumeBars: number;
  volumeRows: number;
};

export type RiskSettings = {
  riskPct: number;
  maxNotional: number;
  leverage: number;
  atrStop: number;
  tp1: number;
  tp2: number;
};

export type UserTerminalSettings = {
  view: ViewSettings;
  strategy: StrategySettings;
  risk: RiskSettings;
};

export const DEFAULT_STRATEGY: StrategySettings = {
  pivotLength: 3,
  srLookback: 300,
  srTolerancePct: 0.1,
  srClusterAtr: 0.8,
  minTouches: 2,
  vwapLength: 96,
  trendLength: 50,
  channelLength: 80,
  channelDeviation: 2,
  fibLength: 100,
  minConfluence: 2,
};

export const DEFAULT_VIEW: ViewSettings = {
  supportResistance: true,
  vwap: true,
  fibonacci: true,
  channels: true,
  trendlines: true,
  triangles: true,
  volumeProfile: true,
  waves: true,
  signals: true,
  labelSize: "Medium",
  volumeBars: 240,
  volumeRows: 28,
};

export const DEFAULT_RISK: RiskSettings = {
  riskPct: 1,
  maxNotional: 1000,
  leverage: 2,
  atrStop: 2,
  tp1: 1.5,
  tp2: 3,
};

export const DEFAULT_TERMINAL_SETTINGS: UserTerminalSettings = {
  view: DEFAULT_VIEW,
  strategy: DEFAULT_STRATEGY,
  risk: DEFAULT_RISK,
};

const finite = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const boolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

export function sanitiseTerminalSettings(
  input: unknown,
): UserTerminalSettings {
  const object = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  const viewInput = object.view && typeof object.view === "object"
    ? object.view as Record<string, unknown>
    : {};
  const strategyInput = object.strategy && typeof object.strategy === "object"
    ? object.strategy as Record<string, unknown>
    : {};
  const riskInput = object.risk && typeof object.risk === "object"
    ? object.risk as Record<string, unknown>
    : {};
  const labelSize = ["Small", "Medium", "Large"].includes(
    String(viewInput.labelSize),
  )
    ? String(viewInput.labelSize) as ViewSettings["labelSize"]
    : DEFAULT_VIEW.labelSize;

  return {
    view: {
      supportResistance: boolean(viewInput.supportResistance, DEFAULT_VIEW.supportResistance),
      vwap: boolean(viewInput.vwap, DEFAULT_VIEW.vwap),
      fibonacci: boolean(viewInput.fibonacci, DEFAULT_VIEW.fibonacci),
      channels: boolean(viewInput.channels, DEFAULT_VIEW.channels),
      trendlines: boolean(viewInput.trendlines, DEFAULT_VIEW.trendlines),
      triangles: boolean(viewInput.triangles, DEFAULT_VIEW.triangles),
      volumeProfile: boolean(viewInput.volumeProfile, DEFAULT_VIEW.volumeProfile),
      waves: boolean(viewInput.waves, DEFAULT_VIEW.waves),
      signals: boolean(viewInput.signals, DEFAULT_VIEW.signals),
      labelSize,
      volumeBars: finite(viewInput.volumeBars, DEFAULT_VIEW.volumeBars, 60, 600),
      volumeRows: finite(viewInput.volumeRows, DEFAULT_VIEW.volumeRows, 12, 80),
    },
    strategy: {
      pivotLength: finite(strategyInput.pivotLength, DEFAULT_STRATEGY.pivotLength, 2, 20),
      srLookback: finite(strategyInput.srLookback, DEFAULT_STRATEGY.srLookback, 150, 1200),
      srTolerancePct: finite(strategyInput.srTolerancePct, DEFAULT_STRATEGY.srTolerancePct, 0.01, 2),
      srClusterAtr: finite(strategyInput.srClusterAtr, DEFAULT_STRATEGY.srClusterAtr, 0.1, 5),
      minTouches: finite(strategyInput.minTouches, DEFAULT_STRATEGY.minTouches, 2, 8),
      vwapLength: finite(strategyInput.vwapLength, DEFAULT_STRATEGY.vwapLength, 20, 500),
      trendLength: finite(strategyInput.trendLength, DEFAULT_STRATEGY.trendLength, 5, 300),
      channelLength: finite(strategyInput.channelLength, DEFAULT_STRATEGY.channelLength, 30, 500),
      channelDeviation: finite(strategyInput.channelDeviation, DEFAULT_STRATEGY.channelDeviation, 0.5, 5),
      fibLength: finite(strategyInput.fibLength, DEFAULT_STRATEGY.fibLength, 50, 600),
      minConfluence: finite(strategyInput.minConfluence, DEFAULT_STRATEGY.minConfluence, 1, 5),
    },
    risk: {
      riskPct: finite(riskInput.riskPct, DEFAULT_RISK.riskPct, 0.1, 10),
      maxNotional: finite(riskInput.maxNotional, DEFAULT_RISK.maxNotional, 50, 100000),
      leverage: finite(riskInput.leverage, DEFAULT_RISK.leverage, 1, 10),
      atrStop: finite(riskInput.atrStop, DEFAULT_RISK.atrStop, 0.5, 8),
      tp1: finite(riskInput.tp1, DEFAULT_RISK.tp1, 0.5, 10),
      tp2: finite(riskInput.tp2, DEFAULT_RISK.tp2, 1, 20),
    },
  };
}
