import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clampContractLeverage,
  isMexcStepAligned,
  leverageStopsForContract,
  parseMexcContractMetadata,
  quantizeMexcExecutionPrice,
  quantizeMexcStep,
  sizeMexcContractOrder,
} from "../app/lib/mexc-contract-metadata.ts";
import { selectMexcContractRiskTier } from "../app/lib/manual-paper-risk-tiers.ts";

const xauPayload = {
  success: true,
  data: [
    {
      symbol: "XAU_USDT",
      displayNameEn: "GOLD(XAU)USDT SWAP",
      positionOpenType: 3,
      contractSize: 0.001,
      minLeverage: 1,
      maxLeverage: 1000,
      priceUnit: 0.01,
      volUnit: 1,
      minVol: 1,
      maxVol: 1_000_000,
      makerFeeRate: 0.0002,
      takerFeeRate: 0.0006,
      maintenanceMarginRate: 0.0004,
      initialMarginRate: 0.001,
      riskLimitType: "BY_VOLUME",
    },
  ],
};

const contract = () => parseMexcContractMetadata(xauPayload, "XAU_USDT");

test("parses public MEXC contract leverage and precision", () => {
  const value = contract();
  assert.equal(value.maxLeverage, 1000);
  assert.equal(value.contractSize, 0.001);
  assert.equal(value.maintenanceMarginRate, 0.0004);
  assert.equal(value.positionOpenType, 3);
});

test("selects the requested symbol from the bulk MEXC contract response", () => {
  const btc = {
    ...xauPayload.data[0],
    symbol: "BTC_USDT",
    displayNameEn: "BTCUSDT SWAP",
    contractSize: 0.0001,
    maxLeverage: 500,
  };
  const value = parseMexcContractMetadata(
    { success: true, data: [xauPayload.data[0], btc] },
    "BTC_USDT",
  );
  assert.equal(value.symbol, "BTC_USDT");
  assert.equal(value.maxLeverage, 500);
  assert.equal(value.contractSize, 0.0001);
});

test("unusable optional MEXC tier fields fall back without erasing valid leverage rules", () => {
  const value = parseMexcContractMetadata(
    {
      success: true,
      data: [{
        ...xauPayload.data[0],
        riskBaseVol: 0,
        riskIncrVol: "",
        riskIncrMmr: "unavailable",
        riskIncrImr: -1,
        riskLevelLimit: 0,
      }],
    },
    "XAU_USDT",
  );
  assert.equal(value.maxLeverage, 1000);
  assert.equal(value.riskBaseVol, undefined);
  assert.equal(value.riskIncrVol, undefined);
  assert.equal(value.riskIncrMmr, undefined);
  assert.equal(value.riskIncrImr, undefined);
  assert.equal(value.riskLevelLimit, undefined);
  assert.equal(
    selectMexcContractRiskTier(value, { contractVolume: 10, notional: 2_500 }).source,
    "mexc-public-contract-flat-fallback",
  );
});

test("builds practical stops while preserving and enforcing range endpoints", () => {
  const value = contract();
  assert.deepEqual(leverageStopsForContract(value), [
    1, 2, 3, 5, 10, 20, 25, 50, 75, 100, 125, 200, 500, 1000,
  ]);
  assert.equal(clampContractLeverage(-50, value), 1);
  assert.equal(clampContractLeverage(Number.NaN, value), 1);
  assert.equal(clampContractLeverage(999.6, value), 1000);
  assert.equal(clampContractLeverage(5000, value), 1000);
});

test("step quantisation is decimal-safe and directionally conservative", () => {
  assert.equal(quantizeMexcStep(12.349, 0.01, "floor"), 12.34);
  assert.equal(quantizeMexcStep(12.341, 0.01, "ceil"), 12.35);
  assert.equal(quantizeMexcStep(0.30000000000000004, 0.1), 0.3);
  assert.equal(isMexcStepAligned(12.34, 0.01), true);
  assert.equal(isMexcStepAligned(12.345, 0.01), false);
  assert.equal(quantizeMexcExecutionPrice(100.001, 0.01, "long", true), 100.01);
  assert.equal(quantizeMexcExecutionPrice(100.009, 0.01, "short", true), 100);
  assert.equal(quantizeMexcExecutionPrice(100.009, 0.01, "long", false), 100);
  assert.equal(quantizeMexcExecutionPrice(100.001, 0.01, "short", false), 100.01);
});

test("contract sizing floors to valid volume without exceeding requested notional", () => {
  const value = contract();
  const sizing = sizeMexcContractOrder(123.456, 2500.01, value);
  assert.equal(sizing.contractVolume, 49);
  assert.equal(sizing.quantity, 0.049);
  assert.equal(sizing.notional, 122.50049);
  assert.ok(sizing.notional <= 123.456);

  const rawMaximumEdge = value.maxVol + value.volUnit / 2;
  assert.equal(
    quantizeMexcStep(rawMaximumEdge, value.volUnit, "floor"),
    value.maxVol,
  );
  const maximumEdge = sizeMexcContractOrder(
    rawMaximumEdge * 2500 * value.contractSize,
    2500,
    value,
  );
  assert.equal(maximumEdge.contractVolume, value.maxVol);
});

test("contract sizing rejects exchange minimum and maximum violations", () => {
  const value = contract();
  assert.throws(
    () => sizeMexcContractOrder(0.5, 2500, value),
    /CONTRACT_VOLUME_BELOW_MINIMUM/,
  );
  assert.throws(
    () => sizeMexcContractOrder(3_000_000, 2500, value),
    /CONTRACT_VOLUME_ABOVE_MAXIMUM/,
  );
});

test("rejects malformed or mismatched core contract metadata", () => {
  assert.throws(
    () => parseMexcContractMetadata(xauPayload, "BTC_USDT"),
    /unavailable|mismatch/i,
  );
  assert.throws(
    () =>
      parseMexcContractMetadata(
        {
          success: true,
          data: [{ ...xauPayload.data[0], maxLeverage: 2000 }],
        },
        "XAU_USDT",
      ),
    /leverage range/i,
  );
  assert.throws(
    () =>
      parseMexcContractMetadata(
        {
          success: true,
          data: [{ ...xauPayload.data[0], minVol: 10, maxVol: 1 }],
        },
        "XAU_USDT",
      ),
    /volume range/i,
  );
});

test("Manual Paper ticket requires contract rules and previews contract precision", () => {
  const source = readFileSync(
    new URL("../app/manual-paper-ticket.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /!publicPrice \|\|\s*!contract \|\|\s*invalidAmount/);
  assert.match(source, /maintenanceMarginRate:riskTierPreview\?\.maintenanceMarginRate\?\?contract\?\.maintenanceMarginRate\?\?/);
  assert.match(source, /sizeMexcContractOrder/);
  assert.match(source, /steppedContractVolume/);
  assert.match(source, /contractVolume/);
});
