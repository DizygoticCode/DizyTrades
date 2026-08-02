import type { UserTerminalSettings } from "./config";

export type MarketSettingsPatch = Partial<UserTerminalSettings["market"]>;
export type MarketPatchResult =
  | Readonly<{ ok: true; patch: MarketSettingsPatch }>
  | Readonly<{ ok: false; error: string }>;

const VALID_TIMEFRAMES = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "8h", "1d", "1w", "1M"]);
const validSymbol = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(value);
const validMarketKey = (value: unknown): value is string =>
  typeof value === "string" && /^mexc:(spot|futures):[A-Z0-9_]{2,60}$/.test(value);
const validFavourite = (value: unknown): value is string => validSymbol(value) || validMarketKey(value);

/** Parses only the market fields that a secondary workspace is allowed to update. */
export function parseMarketSettingsPatch(input: unknown): MarketPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return Object.freeze({ ok: false, error: "Market settings patch must be an object." });
  }
  const object = input as Record<string, unknown>;
  const keys = Object.keys(object);
  const allowed = new Set(["symbol", "marketKey", "timeframe", "favourites"]);
  if (!keys.length) return Object.freeze({ ok: false, error: "Market settings patch is empty." });
  if (keys.some(key => !allowed.has(key))) {
    return Object.freeze({ ok: false, error: "Market settings patch contains an unsupported field." });
  }

  const patch: MarketSettingsPatch = {};
  if ("symbol" in object) {
    if (!validSymbol(object.symbol)) return Object.freeze({ ok: false, error: "Invalid market symbol." });
    patch.symbol = object.symbol;
  }
  if ("marketKey" in object) {
    if (!validMarketKey(object.marketKey)) return Object.freeze({ ok: false, error: "Invalid market key." });
    patch.marketKey = object.marketKey;
  }
  if ("timeframe" in object) {
    if (typeof object.timeframe !== "string" || !VALID_TIMEFRAMES.has(object.timeframe)) {
      return Object.freeze({ ok: false, error: "Invalid market timeframe." });
    }
    patch.timeframe = object.timeframe;
  }
  if ("favourites" in object) {
    if (!Array.isArray(object.favourites) || object.favourites.length > 100 || !object.favourites.every(validFavourite)) {
      return Object.freeze({ ok: false, error: "Invalid market favourites." });
    }
    patch.favourites = [...new Set(object.favourites)];
  }
  return Object.freeze({ ok: true, patch: Object.freeze(patch) });
}

export function applyMarketSettingsPatch(
  current: UserTerminalSettings,
  input: unknown,
): Readonly<{ ok: true; settings: UserTerminalSettings }> | Readonly<{ ok: false; error: string }> {
  const parsed = parseMarketSettingsPatch(input);
  if (!parsed.ok) return parsed;
  const settings: UserTerminalSettings = {
    ...current,
    market: {
      ...current.market,
      ...parsed.patch,
      exchange: "mexc",
    },
  };
  return Object.freeze({ ok: true, settings });
}
