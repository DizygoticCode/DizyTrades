export type TimedPoint = { time: number };
export type SeriesSync = "initial" | "append" | "replace-latest" | "historical-correction" | "market-replacement" | "none";

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Select the least disruptive Lightweight Charts operation for a data change. */
export function classifySeriesSync<T extends TimedPoint>(previous: T[], next: T[], marketChanged = false): SeriesSync {
  if (marketChanged) return "market-replacement";
  if (!previous.length) return next.length ? "initial" : "none";
  if (equal(previous, next)) return "none";
  if (next.length === previous.length + 1 && previous.every((point, index) => equal(point, next[index]))) return "append";
  if (next.length === previous.length && previous.slice(0, -1).every((point, index) => equal(point, next[index])) && previous.at(-1)?.time === next.at(-1)?.time) return "replace-latest";
  return "historical-correction";
}

export const requiresSetData = (sync: SeriesSync) =>
  sync === "initial" || sync === "historical-correction" || sync === "market-replacement";

export type SeriesSyncPlan<T> = { operation: "none" } | { operation: "update"; point: T } | { operation: "setData"; data: T[] };

/** Plans a mutation which can never issue an update older than plotted data. */
export function planSeriesSync<T extends TimedPoint>(previous: T[], next: T[], marketChanged = false): SeriesSyncPlan<T> {
  const sync = classifySeriesSync(previous, next, marketChanged);
  if (sync === "none") return { operation: "none" };
  const point = next.at(-1);
  const lastPlottedTime = previous.at(-1)?.time;
  if ((sync === "append" || sync === "replace-latest") && point && (lastPlottedTime === undefined || point.time >= lastPlottedTime)) {
    return { operation: "update", point };
  }
  return { operation: "setData", data: next };
}
