export type AppearancePreset = "dizy-dark" | "high-contrast" | "colourblind-friendly" | "minimal" | "custom";

export type ChartAppearanceSettings = {
  preset: AppearancePreset;
  chart: { background: string; grid: string; axisText: string; priceScaleBorder: string; timeScaleBorder: string; crosshair: string; livePrice: string };
  candles: { bull: string; bear: string; bullWick: string; bearWick: string; bullVolume: string; bearVolume: string };
  indicators: { vwap: string; trendMa: string; regression: string; bullTrendline: string; bearTrendline: string };
  structure: { supportLine: string; supportZone: string; supportLabelBackground: string; supportLabelText: string; resistanceLine: string; resistanceZone: string; resistanceLabelBackground: string; resistanceLabelText: string; fibonacciLine: string; fibonacciText: string; bullishTriangleBorder: string; bullishTriangleFill: string; bullishTriangleText: string; bearishTriangleBorder: string; bearishTriangleFill: string; bearishTriangleText: string; buyMarker: string; buyText: string; sellMarker: string; sellText: string; waveMarker: string; elliottBorder: string; elliottText: string; elliottFill: string; wyckoffAccumulation: string; wyckoffAccumulationFill: string; wyckoffDistribution: string; wyckoffDistributionFill: string; provisionalBackground: string; provisionalBorder: string };
  profile: { bull: string; bear: string; heading: string };
  opacity: { grid: number; zones: number; labels: number; triangles: number; profile: number; completedPatterns: number };
};

const dark: Omit<ChartAppearanceSettings, "preset"> = {
  chart: { background: "#090c14", grid: "#57678b", axisText: "#8994ad", priceScaleBorder: "#20283a", timeScaleBorder: "#20283a", crosshair: "#7182a7", livePrice: "#e2e8f6" },
  candles: { bull: "#20c997", bear: "#f05268", bullWick: "#20c997", bearWick: "#f05268", bullVolume: "#20c997", bearVolume: "#f05268" },
  indicators: { vwap: "#57a5ff", trendMa: "#d58bff", regression: "#67d1ff", bullTrendline: "#61e7b8", bearTrendline: "#ff8a65" },
  structure: { supportLine: "#2ee6a6", supportZone: "#2ee6a6", supportLabelBackground: "#094335", supportLabelText: "#6cf4c2", resistanceLine: "#ff5c70", resistanceZone: "#ff5c70", resistanceLabelBackground: "#4d1924", resistanceLabelText: "#ff8c9c", fibonacciLine: "#ffc75e", fibonacciText: "#ffd781", bullishTriangleBorder: "#2ee6a6", bullishTriangleFill: "#2ee6a6", bullishTriangleText: "#8affd7", bearishTriangleBorder: "#ff5c70", bearishTriangleFill: "#ff5c70", bearishTriangleText: "#ffb0bc", buyMarker: "#16d991", buyText: "#04130d", sellMarker: "#ff4964", sellText: "#ffffff", waveMarker: "#b994ff", elliottBorder: "#d5c2ff", elliottText: "#ffffff", elliottFill: "#9f7aea", wyckoffAccumulation: "#20c997", wyckoffAccumulationFill: "#20c997", wyckoffDistribution: "#f05268", wyckoffDistributionFill: "#f05268", provisionalBackground: "#30374a", provisionalBorder: "#8994ad" },
  profile: { bull: "#2ee6a6", bear: "#ff5c70", heading: "#a6b2cf" },
  opacity: { grid: .1, zones: .085, labels: .94, triangles: .24, profile: .42, completedPatterns: .14 },
};

export const APPEARANCE_PRESETS: Record<Exclude<AppearancePreset, "custom">, ChartAppearanceSettings> = {
  "dizy-dark": { preset: "dizy-dark", ...structuredClone(dark) },
  "high-contrast": { preset: "high-contrast", ...structuredClone(dark), chart: { ...dark.chart, background: "#000000", grid: "#596579", axisText: "#ffffff", livePrice: "#ffffff" }, candles: { ...dark.candles, bull: "#00ff99", bear: "#ff3158", bullWick: "#00ff99", bearWick: "#ff3158" } },
  "colourblind-friendly": { preset: "colourblind-friendly", ...structuredClone(dark), candles: { ...dark.candles, bull: "#56b4e9", bear: "#e69f00", bullWick: "#56b4e9", bearWick: "#e69f00", bullVolume: "#56b4e9", bearVolume: "#e69f00" }, profile: { ...dark.profile, bull: "#56b4e9", bear: "#e69f00" } },
  minimal: { preset: "minimal", ...structuredClone(dark), chart: { ...dark.chart, background: "#111318", grid: "#30343d" }, opacity: { ...dark.opacity, grid: .04, zones: .04, triangles: .12, profile: .25 } },
};

export const DEFAULT_APPEARANCE = APPEARANCE_PRESETS["dizy-dark"];
export const isHexColour = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
const clampOpacity = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function sanitiseAppearance(input: unknown): ChartAppearanceSettings {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const result = structuredClone(DEFAULT_APPEARANCE) as unknown as Record<string, unknown>;
  for (const group of ["chart", "candles", "indicators", "structure", "profile"] as const) {
    const incoming = source[group] && typeof source[group] === "object" ? source[group] as Record<string, unknown> : {};
    const target = result[group] as Record<string, unknown>;
    for (const key of Object.keys(target)) if (isHexColour(incoming[key])) target[key] = incoming[key];
  }
  const opacity = source.opacity && typeof source.opacity === "object" ? source.opacity as Record<string, unknown> : {};
  const targetOpacity = result.opacity as Record<string, number>;
  for (const key of Object.keys(targetOpacity)) targetOpacity[key] = clampOpacity(opacity[key], targetOpacity[key]);
  const presets: AppearancePreset[] = ["dizy-dark", "high-contrast", "colourblind-friendly", "minimal", "custom"];
  result.preset = presets.includes(source.preset as AppearancePreset) ? source.preset : "dizy-dark";
  return result as unknown as ChartAppearanceSettings;
}

export const hexToRgba = (hex: string, opacity: number) => {
  const clean = isHexColour(hex) ? hex : "#000000";
  return `rgba(${parseInt(clean.slice(1, 3), 16)},${parseInt(clean.slice(3, 5), 16)},${parseInt(clean.slice(5, 7), 16)},${Math.min(1, Math.max(0, opacity))})`;
};
