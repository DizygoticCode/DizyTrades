import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  chartMarketCandleEndpoint,
  chartMarketSupportsTimeframe,
  createDexChartMarket,
  createGlobalChartMarket,
  createMexcChartMarket,
} from "../app/lib/market/chart-market.ts";

const terminal = await readFile(
  new URL("../app/trading-terminal.tsx", import.meta.url),
  "utf8",
);
const realtimeAdapter = await readFile(
  new URL("../app/lib/market/use-chart-market-realtime.ts", import.meta.url),
  "utf8",
);

test("chart market model keeps MEXC provider identity and transport capability behind one instrument", () => {
  const futures = createMexcChartMarket(
    {
      key: "mexc:futures:BTC_USDT",
      exchange: "mexc",
      marketType: "futures",
      contractType: "perpetual",
      sourceSymbol: "BTC_USDT",
      symbol: "BTC_USDT",
      displayName: "BTC / USDT",
      contractDisplayName: "BTC_USDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      settlementAsset: "USDT",
      base: "BTC",
      quote: "USDT",
      fullName: "Bitcoin",
      status: "active",
      state: "enabled",
      pricePrecision: 2,
      contractSize: 0.0001,
    },
    "BTC_USDT",
  );
  assert.equal(futures.key, "mexc:futures:BTC_USDT");
  assert.deepEqual(futures.provider, { id: "mexc", label: "MEXC", venue: "Futures" });
  assert.equal(futures.providerSymbol, "BTC_USDT");
  assert.equal(futures.capabilities.realtime, "stream");
  assert.equal(futures.capabilities.executedTrades, true);
  assert.equal(futures.capabilities.orderBook, true);
  assert.match(
    chartMarketCandleEndpoint(futures, "15m", 800),
    /^\/api\/market\?exchange=mexc&marketType=futures&symbol=BTC_USDT&timeframe=15m&limit=800$/,
  );

  const spot = createMexcChartMarket({ ...futures, key: "mexc:spot:BTC_USDT", marketType: "spot", contractType: "spot" }, "BTC_USDT");
  assert.equal(spot.capabilities.realtime, "refresh");
  assert.equal(spot.capabilities.refreshMs, 10_000);
  assert.equal(spot.capabilities.executedTrades, false);
});

test("DizyDEX pools use the same chart market model with explicit bounded capabilities", () => {
  const market = createDexChartMarket({
    key: "solana:token:pool",
    chain: "solana",
    tokenAddress: "token",
    poolAddress: "pool",
    symbol: "DIZY",
    name: "DIZY",
    quoteSymbol: "USDT",
    dex: "raydium",
    changes: {},
    labels: [],
  });
  assert.equal(market.key, "dex:solana:token:pool");
  assert.deepEqual(market.provider, {
    id: "dizydex",
    label: "DizyDEX",
    venue: "raydium",
    network: "solana",
  });
  assert.equal(market.providerSymbol, "pool");
  assert.equal(market.capabilities.realtime, "refresh");
  assert.equal(market.capabilities.refreshMs, 65_000);
  assert.equal(market.capabilities.executedTrades, false);
  assert.equal(chartMarketSupportsTimeframe(market, "1m"), true);
  assert.equal(chartMarketSupportsTimeframe(market, "30m"), false);
  assert.equal(
    chartMarketCandleEndpoint(market, "1m", 5000),
    "/api/dex/ohlcv?chain=solana&pool=pool&interval=1m&limit=1000",
  );
});

test("global instruments use the neutral chart boundary without execution capabilities", () => {
  const market = createGlobalChartMarket({
    key: "twelvedata:NASDAQ:AAPL",
    provider: "twelvedata",
    symbol: "AAPL",
    displayName: "AAPL · Apple Inc",
    name: "Apple Inc",
    exchange: "NASDAQ",
    micCode: "XNAS",
    currency: "USD",
    country: "United States",
    instrumentType: "Common Stock",
    assetClass: "stock",
  });
  assert.equal(market.provider.id, "twelvedata");
  assert.equal(market.kind, "global");
  assert.equal(market.capabilities.realtime, "refresh");
  assert.equal(market.capabilities.refreshMs, 30_000);
  assert.equal(market.capabilities.executedTrades, false);
  assert.equal(market.capabilities.orderBook, false);
  assert.equal(chartMarketSupportsTimeframe(market, "1m"), true);
  assert.equal(chartMarketSupportsTimeframe(market, "1M"), true);
  assert.equal(
    chartMarketCandleEndpoint(market, "4h", 5000),
    "/api/global-markets/candles?symbol=AAPL&exchange=NASDAQ&timeframe=4h&limit=2000&mic=XNAS",
  );
});

test("provider-specific realtime transport is owned by the neutral adapter, not the terminal", () => {
  assert.match(realtimeAdapter, /useMexcRealtime/);
  assert.match(realtimeAdapter, /options\.market\.provider\.id === "mexc"/);
  assert.match(realtimeAdapter, /options\.market\.capabilities\.realtime !== "refresh"/);
  assert.doesNotMatch(terminal, /useMexcRealtime/);
});

test("trading terminal consumes the provider-neutral chart boundary instead of provider request details", () => {
  assert.match(terminal, /useChartMarketRealtime/);
  assert.match(terminal, /chartMarketCandleEndpoint/);
  assert.match(terminal, /createMexcChartMarket/);
  assert.match(terminal, /createDexChartMarket/);
  assert.match(terminal, /createGlobalChartMarket/);
  assert.doesNotMatch(terminal, /useMexcRealtime/);
  assert.doesNotMatch(terminal, /\/api\/market\?exchange=mexc/);
  assert.doesNotMatch(terminal, /\/api\/dex\/ohlcv\?/);
  assert.doesNotMatch(terminal, /api\.twelvedata\.com/);
  assert.doesNotMatch(terminal, /TWELVE_DATA_API_KEY/);
});
