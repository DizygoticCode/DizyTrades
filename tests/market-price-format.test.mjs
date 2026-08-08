import test from "node:test";
import assert from "node:assert/strict";
import { formatUsdMarketPrice, marketPriceFractionDigits } from "../app/lib/market/price-format.ts";

test("keeps ordinary market prices at normal currency precision", () => {
  assert.equal(marketPriceFractionDigits(76.342), 2);
  assert.equal(formatUsdMarketPrice(76.342), "$76.34");
});

test("preserves useful precision for sub-cent DEX prices", () => {
  assert.equal(marketPriceFractionDigits(0.006704), 6);
  assert.equal(formatUsdMarketPrice(0.006704), "$0.006704");
  assert.equal(formatUsdMarketPrice(0.007), "$0.007");
});

test("supports very small prices without scientific notation", () => {
  assert.equal(marketPriceFractionDigits(0.00012345), 7);
  assert.equal(formatUsdMarketPrice(0.00012345), "$0.0001235");
  assert.equal(formatUsdMarketPrice(Number.NaN), "—");
});
