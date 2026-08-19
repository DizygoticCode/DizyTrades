import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mergeMexcTickers,
  normaliseMexcFutures,
  normaliseMexcSpot,
} from "../app/lib/market/mexc.ts";

test("MEXC catalogue ticker enrichment supplies price change and 24h volume for spot and futures", () => {
  const spot = normaliseMexcSpot({
    symbols: [{
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      status: "ENABLED",
      isSpotTradingAllowed: true,
      quotePrecision: 2,
      baseAssetPrecision: 6,
    }],
  });
  const futures = normaliseMexcFutures([{
    symbol: "BTC_USDT",
    baseCoin: "BTC",
    quoteCoin: "USDT",
    settleCoin: "USDT",
    state: 0,
    isHidden: false,
    display: true,
    priceScale: 1,
    volScale: 0,
    contractSize: 0.0001,
    maxLeverage: 200,
  }]);

  const enriched = mergeMexcTickers(
    [...spot, ...futures],
    [{ symbol: "BTCUSDT", lastPrice: "65000", priceChangePercent: "2.5", quoteVolume: "123456" }],
    { data: [{ symbol: "BTC_USDT", lastPrice: "65010", riseFallRate: "0.0123", amount24: "654321" }] },
  );

  const spotMarket = enriched.find((market) => market.key === "mexc:spot:BTCUSDT");
  const futuresMarket = enriched.find((market) => market.key === "mexc:futures:BTC_USDT");
  assert.ok(spotMarket);
  assert.ok(futuresMarket);
  assert.equal(spotMarket.lastPrice, 65000);
  assert.equal(spotMarket.change24h, 2.5);
  assert.equal(spotMarket.volume24h, 123456);
  assert.equal(futuresMarket.lastPrice, 65010);
  assert.equal(futuresMarket.change24h, 1.23);
  assert.equal(futuresMarket.volume24h, 654321);
});

test("a cold MEXC catalogue waits for first ticker enrichment before returning", async () => {
  const source = await readFile(new URL("../app/lib/market/mexc.ts", import.meta.url), "utf8");
  assert.match(source, /tickerAt\s*:\s*0/);
  assert.match(source, /cache\.tickerAt\s*===\s*0\s*&&\s*cache\.tickerRefresh[\s\S]*markets\s*=\s*await\s+cache\.tickerRefresh/);
});

test("market browser V2 uses one persisted favourite set and real DEX 24h volume", async () => {
  const source = await readFile(new URL("../app/market-browser.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /dexFavourites/);
  assert.match(source, /favourites\.includes\(market\.key\)/);
  assert.match(source, /onFavourite\(market\.key\)/);
  assert.match(source, /market\.volume24h/);
  assert.match(source, /24h Vol/);
  assert.match(source, /Minimum 24h volume/);
  assert.match(source, /tab === "Favorites"[\s\S]*subtab === "All"[\s\S]*subtab === "DEX"/);
});

test("DizyDEX venue choices are derived from discovered Solana markets", async () => {
  const source = await readFile(new URL("../app/market-browser.tsx", import.meta.url), "utf8");

  assert.match(source, /dexItems\.filter\(item => item\.chain === "solana"\)\.map\(item => item\.dex\)/);
  assert.match(source, /const moreItems = tab === "DizyDEX" \? dexVenues : mexcMore/);
  assert.doesNotMatch(source, /const dexMore\s*=\s*\[/);
  assert.doesNotMatch(source, /DizyDEX:\s*\[[^\]]*Pump\.fun/);
});
