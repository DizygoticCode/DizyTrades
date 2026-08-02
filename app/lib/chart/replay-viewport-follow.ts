export type ReplayLogicalRange = Readonly<{ from: number; to: number }>;

export function calculateReplayFollowRange(input: {
  currentRange: ReplayLogicalRange | null;
  previousCandleCount: number;
  candleCount: number;
}): ReplayLogicalRange | null {
  const { currentRange, previousCandleCount, candleCount } = input;
  if (
    !currentRange ||
    !Number.isFinite(currentRange.from) ||
    !Number.isFinite(currentRange.to) ||
    !Number.isInteger(previousCandleCount) ||
    !Number.isInteger(candleCount) ||
    previousCandleCount < 1 ||
    candleCount < 1 ||
    previousCandleCount === candleCount
  )
    return null;

  const span = currentRange.to - currentRange.from;
  if (!Number.isFinite(span) || span <= 0) return null;

  const previousLatest = previousCandleCount - 1;
  const latest = candleCount - 1;
  const previousLatestVisible =
    previousLatest >= currentRange.from && previousLatest <= currentRange.to;

  const minimumOffset = Math.min(2, span * 0.25);
  const maximumOffset = Math.max(minimumOffset, span * 0.6);
  const priorOffset = previousLatestVisible
    ? currentRange.to - previousLatest
    : span * 0.25;
  const rightOffset = Math.min(
    maximumOffset,
    Math.max(minimumOffset, priorOffset),
  );
  const to = latest + rightOffset;

  return Object.freeze({ from: to - span, to });
}
