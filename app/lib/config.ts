import type { StrategySettings } from "./strategy";
import { DEFAULT_APPEARANCE, sanitiseAppearance, type ChartAppearanceSettings } from "./chart/appearance.ts";
import type { LineExtension, PatternPlacement, SidePlacement } from "./chart/chart-layout.ts";

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
  provisionalStages: boolean;
  completedPatternFills: boolean;
  showLevelTouches: boolean;
  globalLineExtensionOverride: LineExtension | "individual";
  fadeExtendedPortions: boolean;
  manualTrendLineExtension: LineExtension;
  manualRayExtension: LineExtension;
  manualHorizontalLineExtension: Exclude<LineExtension,"none">;
  manualChannelExtension: LineExtension;
  manualFibonacciExtension: LineExtension;
  srLineExtension: LineExtension;
  fibLineExtension: LineExtension;
  pivotTrendlineExtension: LineExtension;
  lrChannelExtension: LineExtension;
  triangleLineExtension: LineExtension;
  pivotTrendlineWidth: number;
  pivotTrendlineStyle: "solid" | "dashed" | "dotted";
  trendlineHalo: boolean;
  showTrendlineLabels: boolean;
  lrBasisWidth: number;
  lrBoundaryWidth: number;
  lrBoundaryStyle: "solid" | "dashed" | "dotted";
  showLrChannelFill: boolean;
  lrChannelFillOpacity: number;
  showLrChannelLabels: boolean;
  lrBasisHalo: boolean;
  patternBubbleSize: "Small" | "Medium" | "Large";
  signalBubbleSize: "Medium" | "Large" | "Extra Large";
  signalDetail: "Direction only" | "Direction + confluence";
  labelSize: "Small" | "Medium" | "Large";
  volumeBars: number;
  volumeRows: number;
  realtimeChartUpdates: boolean;
  candleCountdown: boolean;
  countdownToolbar: boolean;
  countdownPriceMarker: boolean;
  autoFitOnMarketChange: boolean;
  srLabelPlacement: SidePlacement;
  fibLabelPlacement: SidePlacement;
  patternLabelPlacement: PatternPlacement;
  labelOffset: number;
  labelPadding: number;
  compactLabels: boolean;
  profileWidthPct: number;
  profileMaxWidth: number;
  profileOpacity: number;
  profileInset: number;
  showProfileHeading: boolean;
  appearance: ChartAppearanceSettings;
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
  market: { exchange: "mexc"; symbol: string; timeframe: string; favourites: string[] };
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
  provisionalStages: true,
  completedPatternFills: true,
  showLevelTouches: false,
  globalLineExtensionOverride: "individual",
  fadeExtendedPortions: true,
  manualTrendLineExtension: "none",
  manualRayExtension: "right",
  manualHorizontalLineExtension: "both",
  manualChannelExtension: "none",
  manualFibonacciExtension: "none",
  srLineExtension: "both",
  fibLineExtension: "both",
  pivotTrendlineExtension: "right",
  lrChannelExtension: "right",
  triangleLineExtension: "none",
  pivotTrendlineWidth: 3,
  pivotTrendlineStyle: "solid",
  trendlineHalo: true,
  showTrendlineLabels: true,
  lrBasisWidth: 3,
  lrBoundaryWidth: 2,
  lrBoundaryStyle: "dashed",
  showLrChannelFill: true,
  lrChannelFillOpacity: .1,
  showLrChannelLabels: true,
  lrBasisHalo: true,
  patternBubbleSize: "Small",
  signalBubbleSize: "Large",
  signalDetail: "Direction only",
  labelSize: "Medium",
  volumeBars: 240,
  volumeRows: 64,
  realtimeChartUpdates: true,
  candleCountdown: true,
  countdownToolbar: true,
  countdownPriceMarker: true,
  autoFitOnMarketChange: true,
  srLabelPlacement: "right-before-profile",
  fibLabelPlacement: "left-edge",
  patternLabelPlacement: "above",
  labelOffset: 12,
  labelPadding: 8,
  compactLabels: false,
  profileWidthPct: 20,
  profileMaxWidth: 240,
  profileOpacity: .42,
  profileInset: 6,
  showProfileHeading: true,
  appearance: DEFAULT_APPEARANCE,
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
  market: { exchange: "mexc", symbol: "BTC_USDT", timeframe: "15m", favourites: [] },
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
  const marketInput = object.market && typeof object.market === "object" ? object.market as Record<string, unknown> : {};
  const validSymbol = (value: unknown) => /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(String(value));
  const validTimeframes = ["1m", "5m", "15m", "30m", "1h", "4h", "8h", "1d", "1w", "1M"];
  const labelSize = ["Small", "Medium", "Large"].includes(
    String(viewInput.labelSize),
  )
    ? String(viewInput.labelSize) as ViewSettings["labelSize"]
    : DEFAULT_VIEW.labelSize;
  const sidePlacement = (value: unknown, fallback: SidePlacement) => ["right-before-profile", "left-edge", "near-latest", "hidden"].includes(String(value)) ? value as SidePlacement : fallback;
  const patternPlacement = ["above", "inside", "below", "left", "right", "hidden"].includes(String(viewInput.patternLabelPlacement)) ? viewInput.patternLabelPlacement as PatternPlacement : DEFAULT_VIEW.patternLabelPlacement;
  const extension = (value: unknown, fallback: LineExtension): LineExtension => ["none", "left", "right", "both"].includes(String(value)) ? value as LineExtension : fallback;
  const lineStyle = (value: unknown, fallback: "solid" | "dashed" | "dotted") => ["solid", "dashed", "dotted"].includes(String(value)) ? value as "solid" | "dashed" | "dotted" : fallback;

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
      provisionalStages: boolean(viewInput.provisionalStages, DEFAULT_VIEW.provisionalStages),
      completedPatternFills: boolean(viewInput.completedPatternFills, DEFAULT_VIEW.completedPatternFills),
      showLevelTouches: boolean(viewInput.showLevelTouches, DEFAULT_VIEW.showLevelTouches),
      globalLineExtensionOverride: ["individual","none","left","right","both"].includes(String(viewInput.globalLineExtensionOverride)) ? viewInput.globalLineExtensionOverride as ViewSettings["globalLineExtensionOverride"] : DEFAULT_VIEW.globalLineExtensionOverride,
      fadeExtendedPortions: boolean(viewInput.fadeExtendedPortions, DEFAULT_VIEW.fadeExtendedPortions),
      manualTrendLineExtension: extension(viewInput.manualTrendLineExtension, DEFAULT_VIEW.manualTrendLineExtension),
      manualRayExtension: extension(viewInput.manualRayExtension, DEFAULT_VIEW.manualRayExtension),
      manualHorizontalLineExtension: (["left","right","both"].includes(String(viewInput.manualHorizontalLineExtension)) ? viewInput.manualHorizontalLineExtension : DEFAULT_VIEW.manualHorizontalLineExtension) as ViewSettings["manualHorizontalLineExtension"],
      manualChannelExtension: extension(viewInput.manualChannelExtension, DEFAULT_VIEW.manualChannelExtension),
      manualFibonacciExtension: extension(viewInput.manualFibonacciExtension, DEFAULT_VIEW.manualFibonacciExtension),
      srLineExtension: extension(viewInput.srLineExtension, DEFAULT_VIEW.srLineExtension),
      fibLineExtension: extension(viewInput.fibLineExtension, DEFAULT_VIEW.fibLineExtension),
      pivotTrendlineExtension: extension(viewInput.pivotTrendlineExtension, DEFAULT_VIEW.pivotTrendlineExtension),
      lrChannelExtension: extension(viewInput.lrChannelExtension, DEFAULT_VIEW.lrChannelExtension),
      triangleLineExtension: extension(viewInput.triangleLineExtension, DEFAULT_VIEW.triangleLineExtension),
      pivotTrendlineWidth: finite(viewInput.pivotTrendlineWidth, DEFAULT_VIEW.pivotTrendlineWidth, 1, 5),
      pivotTrendlineStyle: lineStyle(viewInput.pivotTrendlineStyle, DEFAULT_VIEW.pivotTrendlineStyle),
      trendlineHalo: boolean(viewInput.trendlineHalo, DEFAULT_VIEW.trendlineHalo),
      showTrendlineLabels: boolean(viewInput.showTrendlineLabels, DEFAULT_VIEW.showTrendlineLabels),
      lrBasisWidth: finite(viewInput.lrBasisWidth, DEFAULT_VIEW.lrBasisWidth, 1, 5),
      lrBoundaryWidth: finite(viewInput.lrBoundaryWidth, DEFAULT_VIEW.lrBoundaryWidth, 1, 5),
      lrBoundaryStyle: lineStyle(viewInput.lrBoundaryStyle, DEFAULT_VIEW.lrBoundaryStyle),
      showLrChannelFill: boolean(viewInput.showLrChannelFill, DEFAULT_VIEW.showLrChannelFill),
      lrChannelFillOpacity: finite(viewInput.lrChannelFillOpacity, DEFAULT_VIEW.lrChannelFillOpacity, 0, .4),
      showLrChannelLabels: boolean(viewInput.showLrChannelLabels, DEFAULT_VIEW.showLrChannelLabels),
      lrBasisHalo: boolean(viewInput.lrBasisHalo, DEFAULT_VIEW.lrBasisHalo),
      patternBubbleSize: ["Small","Medium","Large"].includes(String(viewInput.patternBubbleSize)) ? viewInput.patternBubbleSize as ViewSettings["patternBubbleSize"] : DEFAULT_VIEW.patternBubbleSize,
      signalBubbleSize: ["Medium","Large","Extra Large"].includes(String(viewInput.signalBubbleSize)) ? viewInput.signalBubbleSize as ViewSettings["signalBubbleSize"] : DEFAULT_VIEW.signalBubbleSize,
      signalDetail: ["Direction only","Direction + confluence"].includes(String(viewInput.signalDetail)) ? viewInput.signalDetail as ViewSettings["signalDetail"] : DEFAULT_VIEW.signalDetail,
      realtimeChartUpdates: boolean(viewInput.realtimeChartUpdates, DEFAULT_VIEW.realtimeChartUpdates),
      candleCountdown: boolean(viewInput.candleCountdown, DEFAULT_VIEW.candleCountdown),
      countdownToolbar: boolean(viewInput.countdownToolbar, boolean(viewInput.candleCountdown, DEFAULT_VIEW.countdownToolbar)),
      countdownPriceMarker: boolean(viewInput.countdownPriceMarker, DEFAULT_VIEW.countdownPriceMarker),
      autoFitOnMarketChange: boolean(viewInput.autoFitOnMarketChange, DEFAULT_VIEW.autoFitOnMarketChange),
      srLabelPlacement: sidePlacement(viewInput.srLabelPlacement, DEFAULT_VIEW.srLabelPlacement),
      fibLabelPlacement: sidePlacement(viewInput.fibLabelPlacement, DEFAULT_VIEW.fibLabelPlacement),
      patternLabelPlacement: patternPlacement,
      labelOffset: finite(viewInput.labelOffset, DEFAULT_VIEW.labelOffset, 0, 80),
      labelPadding: finite(viewInput.labelPadding, DEFAULT_VIEW.labelPadding, 2, 20),
      compactLabels: boolean(viewInput.compactLabels, DEFAULT_VIEW.compactLabels),
      profileWidthPct: finite(viewInput.profileWidthPct, DEFAULT_VIEW.profileWidthPct, 10, 30),
      profileMaxWidth: finite(viewInput.profileMaxWidth, DEFAULT_VIEW.profileMaxWidth, 100, 320),
      profileOpacity: finite(viewInput.profileOpacity, DEFAULT_VIEW.profileOpacity, 0, 1),
      profileInset: finite(viewInput.profileInset, DEFAULT_VIEW.profileInset, 0, 40),
      showProfileHeading: boolean(viewInput.showProfileHeading, DEFAULT_VIEW.showProfileHeading),
      appearance: sanitiseAppearance(viewInput.appearance),
      labelSize,
      volumeBars: finite(viewInput.volumeBars, DEFAULT_VIEW.volumeBars, 60, 600),
      volumeRows: finite(viewInput.volumeRows, DEFAULT_VIEW.volumeRows, 12, 240),
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
    market: {
      exchange: "mexc",
      symbol: validSymbol(marketInput.symbol) ? String(marketInput.symbol) : "BTC_USDT",
      timeframe: validTimeframes.includes(String(marketInput.timeframe)) ? String(marketInput.timeframe) : "15m",
      favourites: Array.isArray(marketInput.favourites) ? [...new Set(marketInput.favourites.filter(validSymbol).map(String))].slice(0, 50) : [],
    },
  };
}
