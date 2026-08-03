import type { UserTerminalSettings } from "./config";

export const RECENT_MARKET_LIMIT = 8;

export type RecentMarketShortcut = Readonly<{
  version: 1;
  marketKey: string;
  symbol: string;
  timeframe: string;
  exchange: string;
  marketType: "spot" | "futures" | "dex" | "unknown";
  visitedAt: string;
}>;

const bounded = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const marketTypeFromKey = (marketKey: string): RecentMarketShortcut["marketType"] => {
  const value = marketKey.split(":")[1]?.toLocaleLowerCase();
  if (value === "spot" || value === "futures" || value === "dex") return value;
  return "unknown";
};

export function recentMarketFromSettings(
  market: UserTerminalSettings["market"],
  visitedAt = new Date().toISOString(),
): RecentMarketShortcut | null {
  const marketKey = bounded(market.marketKey, 180);
  const symbol = bounded(market.symbol, 80).toUpperCase();
  const timeframe = bounded(market.timeframe, 20);
  const exchange = bounded(market.exchange, 40).toLocaleLowerCase();
  if (!marketKey || !symbol || !timeframe || !exchange) return null;
  const parsed = Date.parse(visitedAt);
  return Object.freeze({
    version: 1,
    marketKey,
    symbol,
    timeframe,
    exchange,
    marketType: marketTypeFromKey(marketKey),
    visitedAt: Number.isFinite(parsed)
      ? new Date(parsed).toISOString()
      : new Date(0).toISOString(),
  });
}

export function sanitiseRecentMarketShortcut(
  value: unknown,
): RecentMarketShortcut | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const marketKey = bounded(input.marketKey, 180);
  const symbol = bounded(input.symbol, 80).toUpperCase();
  const timeframe = bounded(input.timeframe, 20);
  const exchange = bounded(input.exchange, 40).toLocaleLowerCase();
  const visitedAt = bounded(input.visitedAt, 40);
  if (!marketKey || !symbol || !timeframe || !exchange) return null;
  const parsed = Date.parse(visitedAt);
  if (!Number.isFinite(parsed)) return null;
  return Object.freeze({
    version: 1,
    marketKey,
    symbol,
    timeframe,
    exchange,
    marketType: marketTypeFromKey(marketKey),
    visitedAt: new Date(parsed).toISOString(),
  });
}

export function sanitiseRecentMarketShortcuts(
  value: unknown,
): readonly RecentMarketShortcut[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = new Map<string, RecentMarketShortcut>();
  for (const candidate of value) {
    const shortcut = sanitiseRecentMarketShortcut(candidate);
    if (!shortcut) continue;
    const existing = unique.get(shortcut.marketKey);
    if (!existing || shortcut.visitedAt > existing.visitedAt) {
      unique.set(shortcut.marketKey, shortcut);
    }
  }
  return Object.freeze(
    [...unique.values()]
      .sort((left, right) => right.visitedAt.localeCompare(left.visitedAt))
      .slice(0, RECENT_MARKET_LIMIT),
  );
}

export function marketShortcutChanged(
  before: UserTerminalSettings["market"],
  after: UserTerminalSettings["market"],
) {
  return (
    before.marketKey !== after.marketKey ||
    before.symbol !== after.symbol ||
    before.timeframe !== after.timeframe
  );
}
