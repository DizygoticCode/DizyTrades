export type MexcFundingRateSnapshot = Readonly<{
  symbol: string;
  fundingRate: number;
  minFundingRate: number;
  maxFundingRate: number;
  collectCycleHours: number;
  nextSettleTime: number;
  observedAt: number;
  source: "mexc-public-funding-rate";
}>;

export type MexcFundingSettlement = Readonly<{
  symbol: string;
  fundingRate: number;
  settleTime: number;
  source: "mexc-public-funding-history";
}>;

const finite = (value: unknown, field: string) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid MEXC funding ${field}.`);
  return parsed;
};
const positive = (value: unknown, field: string) => {
  const parsed = finite(value, field);
  if (parsed <= 0) throw new Error(`Invalid MEXC funding ${field}.`);
  return parsed;
};
const timestamp = (value: unknown, field: string) => {
  const parsed = positive(value, field);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid MEXC funding ${field}.`);
  return parsed;
};
const symbol = (value: unknown, expected?: string) => {
  if (typeof value !== "string" || !/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(value))
    throw new Error("Invalid MEXC funding symbol.");
  if (expected && value !== expected) throw new Error("MEXC funding symbol mismatch.");
  return value;
};

export function parseMexcFundingRate(
  payload: unknown,
  expectedSymbol?: string,
  observedAt = Date.now(),
): MexcFundingRateSnapshot {
  if (!payload || typeof payload !== "object") throw new Error("Invalid MEXC funding response.");
  const response = payload as { success?: unknown; data?: unknown };
  if (response.success === false || !response.data || typeof response.data !== "object")
    throw new Error("MEXC funding rate is unavailable.");
  const input = response.data as Record<string, unknown>;
  const fundingRate = finite(input.fundingRate, "rate");
  const minFundingRate = finite(input.minFundingRate, "minimum rate");
  const maxFundingRate = finite(input.maxFundingRate, "maximum rate");
  if (maxFundingRate < minFundingRate || fundingRate < minFundingRate || fundingRate > maxFundingRate)
    throw new Error("Invalid MEXC funding rate range.");
  return Object.freeze({
    symbol: symbol(input.symbol, expectedSymbol),
    fundingRate,
    minFundingRate,
    maxFundingRate,
    collectCycleHours: positive(input.collectCycle, "collection cycle"),
    nextSettleTime: timestamp(input.nextSettleTime, "next settlement time"),
    observedAt: timestamp(observedAt, "observation time"),
    source: "mexc-public-funding-rate",
  });
}

export function parseMexcFundingHistory(
  payload: unknown,
  expectedSymbol?: string,
): readonly MexcFundingSettlement[] {
  if (!payload || typeof payload !== "object") throw new Error("Invalid MEXC funding history response.");
  const response = payload as { success?: unknown; data?: unknown };
  if (response.success === false || !response.data || typeof response.data !== "object")
    throw new Error("MEXC funding history is unavailable.");
  const resultList = (response.data as { resultList?: unknown }).resultList;
  if (!Array.isArray(resultList)) throw new Error("Invalid MEXC funding history.");
  return Object.freeze(resultList.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid MEXC funding settlement.");
    const input = item as Record<string, unknown>;
    return Object.freeze({
      symbol: symbol(input.symbol, expectedSymbol),
      fundingRate: finite(input.fundingRate, "history rate"),
      settleTime: timestamp(input.settleTime, "settlement time"),
      source: "mexc-public-funding-history" as const,
    });
  }).sort((a, b) => a.settleTime - b.settleTime));
}

export function dueMexcFundingSettlements(
  history: readonly MexcFundingSettlement[],
  openedAt: number,
  lastSettlementAt: number | null | undefined,
  observedAt = Date.now(),
) {
  const lowerBound = Math.max(openedAt, lastSettlementAt ?? openedAt);
  return history.filter((item) => item.settleTime > lowerBound && item.settleTime <= observedAt);
}

export function calculatePaperFundingPayment(input: {
  side: "long" | "short";
  quantity: number;
  observedPrice: number;
  fundingRate: number;
}) {
  const { side, quantity, observedPrice, fundingRate } = input;
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(observedPrice) || observedPrice <= 0 || !Number.isFinite(fundingRate))
    throw new Error("Invalid paper funding calculation.");
  const notional = quantity * observedPrice;
  const calculatedCashDelta = (side === "long" ? -1 : 1) * notional * fundingRate;
  return Object.freeze({ notional, calculatedCashDelta });
}
