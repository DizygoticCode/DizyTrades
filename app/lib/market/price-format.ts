const marketPriceFormatters = new Map<number, Intl.NumberFormat>();

export function marketPriceFractionDigits(value: number) {
  const absolute = Math.abs(value);
  if (!Number.isFinite(absolute) || absolute === 0 || absolute >= 1) return 2;
  return Math.min(8, Math.max(2, 3 - Math.floor(Math.log10(absolute))));
}

export function formatUsdMarketPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  const maximumFractionDigits = marketPriceFractionDigits(value);
  let formatter = marketPriceFormatters.get(maximumFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits,
    });
    marketPriceFormatters.set(maximumFractionDigits, formatter);
  }
  return formatter.format(value);
}
