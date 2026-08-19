import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  globalAssetClass,
  globalMarketDisplayName,
  globalMarketKey,
  TWELVE_DATA_INTERVALS,
} from "../app/lib/market/global.ts";

const provider = await readFile(
  new URL("../app/lib/market/twelve-data.ts", import.meta.url),
  "utf8",
);
const searchRoute = await readFile(
  new URL("../app/api/global-markets/search/route.ts", import.meta.url),
  "utf8",
);
const candleRoute = await readFile(
  new URL("../app/api/global-markets/candles/route.ts", import.meta.url),
  "utf8",
);
const profileRoute = await readFile(
  new URL("../app/api/profile/route.ts", import.meta.url),
  "utf8",
);
const browser = await readFile(
  new URL("../app/market-browser.tsx", import.meta.url),
  "utf8",
);
const envExample = await readFile(
  new URL("../.env.example", import.meta.url),
  "utf8",
);

test("global market identity is deterministic and asset classes remain provider-neutral", () => {
  assert.equal(globalMarketKey(" nasdaq ", " aapl "), "twelvedata:NASDAQ:AAPL");
  assert.equal(globalMarketDisplayName("aapl", "Apple Inc"), "AAPL · Apple Inc");
  assert.equal(globalAssetClass("Common Stock"), "stock");
  assert.equal(globalAssetClass("Exchange-Traded Fund"), "etf");
  assert.equal(globalAssetClass("Physical Currency"), "forex");
  assert.equal(globalAssetClass("Digital Currency"), "crypto");
});

test("Twelve Data interval map covers every DizyCharts timeframe", () => {
  assert.deepEqual(TWELVE_DATA_INTERVALS, {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",
    "1h": "1h",
    "4h": "4h",
    "8h": "8h",
    "1d": "1day",
    "1w": "1week",
    "1M": "1month",
  });
});

test("Twelve Data credentials and upstream calls stay server-side", () => {
  assert.match(provider, /import "server-only"/);
  assert.match(provider, /process\.env\.TWELVE_DATA_API_KEY/);
  assert.match(provider, /https:\/\/api\.twelvedata\.com\/symbol_search/);
  assert.match(provider, /https:\/\/api\.twelvedata\.com\/time_series/);
  assert.match(provider, /authorization: `apikey \$\{apiKey\(\)\}`/);
  assert.doesNotMatch(provider, /NEXT_PUBLIC_TWELVE_DATA/);
  assert.match(envExample, /^TWELVE_DATA_API_KEY=$/m);
  assert.doesNotMatch(envExample, /^NEXT_PUBLIC_TWELVE_DATA/m);
});

test("global search and candles require an authenticated DizyTrades user", () => {
  assert.match(searchRoute, /requireApiUser\(\)/);
  assert.match(searchRoute, /status: 401/);
  assert.match(candleRoute, /requireApiUser\(\)/);
  assert.match(candleRoute, /status: 401/);
  assert.match(candleRoute, /CANDLE_TIMEFRAMES\.includes/);
  assert.match(candleRoute, /limit > 2000/);
});

test("global selections cannot overwrite persisted MEXC market identity", () => {
  assert.match(profileRoute, /marketPayload\.marketKey\.startsWith\("twelvedata:"\)/);
  assert.match(profileRoute, /\{ \.\.\.settingsPayload, market: current\.settings\.market \}/);
});

test("Market Browser owns debounced Global Search without calling Twelve Data directly", () => {
  assert.match(browser, /"Global"/);
  assert.match(browser, /\/api\/global-markets\/search\?query=/);
  assert.match(browser, /window\.setTimeout\(\(\) => \{/);
  assert.match(browser, /onSelectGlobal/);
  assert.doesNotMatch(browser, /api\.twelvedata\.com/);
  assert.doesNotMatch(browser, /TWELVE_DATA_API_KEY/);
});
