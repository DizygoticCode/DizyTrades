import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TERMINAL_SETTINGS } from "../app/lib/config.ts";
import { applyMarketSettingsPatch, parseMarketSettingsPatch } from "../app/lib/profile-market-patch.ts";

const settings = () => structuredClone(DEFAULT_TERMINAL_SETTINGS);

test("market patch preserves every unrelated profile group and omitted market field", () => {
  const current = settings();
  current.strategy.minConfluence = 5;
  current.view.volumeRows = 111;
  current.risk.leverage = 7;
  current.market = {
    exchange: "mexc",
    symbol: "BTC_USDT",
    marketKey: "mexc:futures:BTC_USDT",
    timeframe: "15m",
    favourites: ["mexc:futures:BTC_USDT"],
  };
  const result = applyMarketSettingsPatch(current, { timeframe: "1h", favourites: ["mexc:futures:ETH_USDT"] });
  assert.equal(result.ok, true);
  assert.equal(result.settings.strategy.minConfluence, 5);
  assert.equal(result.settings.view.volumeRows, 111);
  assert.equal(result.settings.risk.leverage, 7);
  assert.equal(result.settings.market.symbol, "BTC_USDT");
  assert.equal(result.settings.market.marketKey, "mexc:futures:BTC_USDT");
  assert.equal(result.settings.market.timeframe, "1h");
  assert.deepEqual(result.settings.market.favourites, ["mexc:futures:ETH_USDT"]);
});

test("valid patches accept symbols, stable market keys, timeframes and deduplicated favourites", () => {
  const result = parseMarketSettingsPatch({
    symbol: "SOL_USDT",
    marketKey: "mexc:spot:SOL_USDT",
    timeframe: "4h",
    favourites: ["SOL_USDT", "mexc:spot:SOL_USDT", "SOL_USDT"],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.patch, {
    symbol: "SOL_USDT",
    marketKey: "mexc:spot:SOL_USDT",
    timeframe: "4h",
    favourites: ["SOL_USDT", "mexc:spot:SOL_USDT"],
  });
});

test("patch rejects empty, unknown and malformed market updates", () => {
  for (const input of [
    null,
    {},
    { exchange: "other" },
    { symbol: "../../secret" },
    { marketKey: "mexc:other:BTC_USDT" },
    { timeframe: "2h" },
    { favourites: ["bad"] },
    { favourites: Array.from({ length: 101 }, (_, index) => `A${index}_USDT`) },
  ]) {
    assert.equal(parseMarketSettingsPatch(input).ok, false);
  }
});

test("patch result does not mutate the current settings object", () => {
  const current = settings();
  const original = structuredClone(current);
  const result = applyMarketSettingsPatch(current, { symbol: "ETH_USDT", marketKey: "mexc:futures:ETH_USDT" });
  assert.equal(result.ok, true);
  assert.deepEqual(current, original);
  assert.notEqual(result.settings, current);
  assert.notEqual(result.settings.market, current.market);
});
