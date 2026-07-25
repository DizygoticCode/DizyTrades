import assert from "node:assert/strict";
import test from "node:test";
import { CANDLE_TIMEFRAMES } from "../app/lib/market/types.ts";
import { MEXC_INTERVALS, normaliseCandles, sanitiseMexcMarkets } from "../app/lib/market/mexc.ts";
import { sanitiseTerminalSettings } from "../app/lib/config.ts";

test("maps every native MEXC timeframe and distinguishes minute from month", () => {
  assert.equal(MEXC_INTERVALS["1m"].api, "Min1");
  assert.equal(MEXC_INTERVALS["1M"].api, "Month1");
  assert.notEqual(MEXC_INTERVALS["1m"].api, MEXC_INTERVALS["1M"].api);
  assert.equal(Object.keys(MEXC_INTERVALS).length, CANDLE_TIMEFRAMES.length);
});

test("market directory keeps enabled perpetuals irrespective of apiAllowed", () => {
  const result = sanitiseMexcMarkets([
    { symbol: "BTC_USDT", baseCoin: "BTC", quoteCoin: "USDT", settleCoin: "USDT", state: 0, apiAllowed: false, priceScale: 1 },
    { symbol: "OFF_USDT", state: 1 },
    { symbol: "HIDDEN_USDT", state: 0, isHidden: true },
    { symbol: "DELIVERY_USDT", state: 0, deliveryTime: 123 },
    { symbol: "../BAD", state: 0 },
  ]);
  assert.deepEqual(result.map((market) => market.symbol), ["BTC_USDT"]);
});

test("candles are finite, unique, sorted, valid and closed", () => {
  const result = normaliseCandles({ time: [900, 100, 100, 950, 200], open: [2, 1, 1.5, 4, NaN], high: [3, 2, 2, 5, 3], low: [1, 0, 1, 3, 1], close: [2.5, 1.5, 1.8, 4, 2], vol: [2, 1, 3, 1, 1] }, 1000, "1m");
  assert.deepEqual(result.map((candle) => candle.time), [100, 900]);
  assert.equal(result[0].open, 1.5);
});

test("legacy profiles safely gain sanitised market defaults", () => {
  const migrated = sanitiseTerminalSettings({ view: {}, strategy: {}, risk: {} });
  assert.deepEqual(migrated.market, { exchange: "mexc", symbol: "BTC_USDT", timeframe: "15m", favourites: [] });
  const clean = sanitiseTerminalSettings({ market: { symbol: "ETH_USDT", timeframe: "1M", favourites: ["BTC_USDT", "bad", "BTC_USDT"] } });
  assert.deepEqual(clean.market, { exchange: "mexc", symbol: "ETH_USDT", timeframe: "1M", favourites: ["BTC_USDT"] });
});
