export const ALL_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "8h", "1d", "1w", "1M"] as const;

export const TIMEFRAME_TITLES: Record<(typeof ALL_TIMEFRAMES)[number], string> = {
  "1m": "1m — 1 minute", "5m": "5m — 5 minutes", "15m": "15m — 15 minutes", "30m": "30m — 30 minutes",
  "1h": "1h — Hourly", "4h": "4h — 4 hours", "8h": "8h — 8 hours", "1d": "1d — Daily", "1w": "1w — Weekly", "1M": "1M — Monthly",
};

export const PROFILE_BAR_PRESETS = { Large: 24, Medium: 48, Small: 80, "Very small": 120 } as const;
export type ProfileBarPreset = keyof typeof PROFILE_BAR_PRESETS | "Custom";
export function profileBarPreset(rows: number): ProfileBarPreset {
  return (Object.entries(PROFILE_BAR_PRESETS).find(([, value]) => value === rows)?.[0] as keyof typeof PROFILE_BAR_PRESETS | undefined) ?? "Custom";
}
