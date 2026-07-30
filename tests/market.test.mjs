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
    { symbol: "BTC_USDT", baseCoin: "BTC", quoteCoin: "USDT", settleCoin: "USDT", state: 0, apiAllowed: false, priceScale: 1, priceUnit: "0.1", depthStepList: ["0.1", "1", "10", "100"] },
    { symbol: "OFF_USDT", state: 1 },
    { symbol: "HIDDEN_USDT", state: 0, isHidden: true },
    { symbol: "DELIVERY_USDT", state: 0, deliveryTime: 123 },
    { symbol: "../BAD", state: 0 },
  ]);
  assert.deepEqual(result.map((market) => market.symbol), ["BTC_USDT", "DELIVERY_USDT"]);
  assert.deepEqual({priceUnit:result[0].priceUnit,depthStepList:result[0].depthStepList,pricePrecision:result[0].pricePrecision},{priceUnit:"0.1",depthStepList:["0.1","1","10","100"],pricePrecision:1});
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

import { normaliseMexcSpot, normaliseMexcFutures, mergeMexcTickers, getMexcMarkets, resetMexcMarketCache } from "../app/lib/market/mexc.ts";
import { marketBadge, searchMarkets } from "../app/lib/market/catalogue.ts";

const spotFixture = { symbols: [
  { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "ENABLED", quotePrecision: 2, baseAssetPrecision: 6 },
  { symbol: "OLDUSDT", baseAsset: "OLD", quoteAsset: "USDT", status: "OFFLINE" },
] };
const futuresFixture = [
  { symbol: "BTC_USDT", baseCoin: "BTC", quoteCoin: "USDT", settleCoin: "USDT", state: 0, priceScale: 1 },
  { symbol: "ETH_USDT", baseCoin: "ETH", quoteCoin: "USDT", settleCoin: "USDT", state: 0, deliveryTime: 1 },
  { symbol: "OFF_USDT", state: 1 },
];

test("normalises Spot and Futures into distinct stable market keys", () => {
  const spot = normaliseMexcSpot(spotFixture)[0];
  const future = normaliseMexcFutures(futuresFixture)[0];
  assert.equal(spot.key, "mexc:spot:BTCUSDT");
  assert.equal(future.key, "mexc:futures:BTC_USDT");
  assert.notEqual(spot.key, future.key);
  assert.equal(spot.pricePrecision, 2);
  assert.equal(future.pricePrecision, 1);
});

test("filters offline instruments while retaining chartable delivery contracts", () => {
  assert.deepEqual(normaliseMexcSpot(spotFixture).map(m => m.sourceSymbol), ["BTCUSDT"]);
  const contracts = normaliseMexcFutures(futuresFixture);
  assert.deepEqual(contracts.map(m => marketBadge(m)), ["PERP", "DELIVERY"]);
});

test("catalogue search, tabs, quote filters and key-based favorites do not conflate markets", () => {
  const markets = mergeMexcTickers([...normaliseMexcSpot(spotFixture), ...normaliseMexcFutures(futuresFixture)], [{symbol:"BTCUSDT",lastPrice:"70000",priceChangePercent:"1.2",quoteVolume:"100"}], {data:[{symbol:"BTC_USDT",lastPrice:"70100",riseFallRate:"0.02",amount24:"200"}]});
  assert.equal(searchMarkets(markets, "Bitcoin", "spot", "USDT", new Set()).length, 1);
  assert.equal(searchMarkets(markets, "BTC", "perpetual", "All", new Set()).length, 1);
  assert.deepEqual(searchMarkets(markets, "", "favorites", "All", new Set(["mexc:spot:BTCUSDT"])).map(m=>m.key), ["mexc:spot:BTCUSDT"]);
});

test("catalogue cache is reused and a failed refresh retains the last valid bounded data", async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let now = 1_000_000, failing = false, calls = 0;
  Date.now = () => now;
  globalThis.fetch = async (url) => {
    calls++;
    if (failing) throw new Error("fixture outage");
    const text = String(url);
    if (text.includes("exchangeInfo")) return new Response(JSON.stringify(spotFixture), {status: 200});
    if (text.includes("contract/detail")) return new Response(JSON.stringify({data:futuresFixture}), {status: 200});
    if (text.includes("ticker/24hr")) return new Response("[]", {status: 200});
    return new Response('{"data":[]}', {status: 200});
  };
  try {
    resetMexcMarketCache();
    const first = await getMexcMarkets();
    const afterFirst = calls;
    const cached = await getMexcMarkets();
    assert.equal(calls, afterFirst);
    assert.strictEqual(cached, first);
    failing = true; now += 11 * 60_000;
    const stale = await getMexcMarkets();
    assert.deepEqual(stale.map(m=>m.key), first.map(m=>m.key));
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; resetMexcMarketCache(); }
});
