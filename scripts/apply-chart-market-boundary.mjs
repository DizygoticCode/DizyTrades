import { readFile, writeFile } from "node:fs/promises";

const path = "app/trading-terminal.tsx";
let source = await readFile(path, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: source fragment not found`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`${label}: source fragment is not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceExactly(label, before, after, expected) {
  const pieces = source.split(before);
  const actual = pieces.length - 1;
  if (actual !== expected)
    throw new Error(`${label}: expected ${expected} occurrences, found ${actual}`);
  source = pieces.join(after);
}

replaceOnce(
  "DEX helper import",
  'import { DIZY_USDT_POOL, splitDexOhlcv, supportsDexChartTimeframe } from "./lib/dex/dizy";',
  'import { DIZY_USDT_POOL } from "./lib/dex/dizy";',
);

replaceOnce(
  "realtime import",
  `import type { CandleTimeframe } from "./lib/market/types";\nimport {\n  useMexcRealtime,\n  type RealtimeStatus,\n} from "./lib/market/use-mexc-realtime";`,
  `import type { CandleTimeframe } from "./lib/market/types";\nimport {\n  chartMarketCandleEndpoint,\n  chartMarketSupportsTimeframe,\n  chartMarketTimeline,\n  createDexChartMarket,\n  createMexcChartMarket,\n} from "./lib/market/chart-market";\nimport {\n  useChartMarketRealtime,\n  type RealtimeStatus,\n} from "./lib/market/use-chart-market-realtime";`,
);

replaceOnce(
  "active chart market",
  `  const selectedMarket=markets.find((market)=>market.key===selectedMarketKey);\n  const dexSelected=selectedDexMarket!==null;\n  const futuresSelected=!dexSelected&&selectedMarket?.marketType!=="spot";`,
  `  const selectedMarket=markets.find((market)=>market.key===selectedMarketKey);\n  const dexSelected=selectedDexMarket!==null;\n  const chartMarket=useMemo(\n    () => selectedDexMarket\n      ? createDexChartMarket(selectedDexMarket)\n      : createMexcChartMarket(selectedMarket, symbol),\n    [selectedDexMarket, selectedMarket, symbol],\n  );\n  const futuresSelected=chartMarket.kind==="futures";`,
);

replaceOnce(
  "candle request",
  `        const dexRequest = selectedDexMarket;\n        if (dexRequest && !supportsDexChartTimeframe(timeframe))\n          throw new Error("Unsupported DEX timeframe");\n        const endpoint = dexRequest\n          ? \`/api/dex/ohlcv?chain=\${encodeURIComponent(dexRequest.chain)}&pool=\${encodeURIComponent(dexRequest.poolAddress)}&interval=\${encodeURIComponent(timeframe)}&limit=\${Math.min(historyCapacity, 1000)}\`\n          : \`/api/market?exchange=mexc&marketType=\${selectedMarket?.marketType ?? "futures"}&symbol=\${encodeURIComponent(symbol)}&timeframe=\${encodeURIComponent(timeframe)}&limit=\${historyCapacity}\`;`,
  `        const dexRequest = chartMarket.provider.id === "dizydex";\n        const endpoint = chartMarketCandleEndpoint(\n          chartMarket,\n          timeframe as CandleTimeframe,\n          historyCapacity,\n        );`,
);

replaceOnce(
  "minimum history",
  `        if (!payload.candles.length || (!dexRequest && payload.candles.length < 20))\n          throw new Error("Insufficient candle history");`,
  `        if (\n          !payload.candles.length ||\n          payload.candles.length < chartMarket.capabilities.minimumHistory\n        )\n          throw new Error("Insufficient candle history");`,
);

replaceOnce(
  "timeline adaptation",
  `        const dexTimeline = dexRequest\n          ? splitDexOhlcv(payload.candles, timeframe as CandleTimeframe)\n          : { closed: payload.candles, live: null as Candle | null };`,
  `        const providerTimeline = chartMarketTimeline(\n          chartMarket,\n          payload.candles,\n          timeframe as CandleTimeframe,\n        );`,
);

replaceExactly(
  "closed timeline references",
  "closed: dexTimeline.closed",
  "closed: providerTimeline.closed",
  2,
);
replaceOnce(
  "DEX live condition",
  "dispatchTimeline(dexTimeline.live",
  "dispatchTimeline(providerTimeline.live",
);
replaceOnce(
  "DEX live candle",
  "candle: dexTimeline.live",
  "candle: providerTimeline.live",
);

replaceOnce(
  "provider data source",
  '        setDataSource(dexRequest ? `${payload.source.toUpperCase()} · RAYDIUM` : payload.source.toUpperCase());',
  '        setDataSource(dexRequest ? `${payload.source.toUpperCase()} · ${chartMarket.provider.venue.toUpperCase()}` : payload.source.toUpperCase());',
);

replaceOnce(
  "provider failure identity",
  "        const dexFailure = selectedDexMarket !== null;",
  '        const dexFailure = chartMarket.provider.id === "dizydex";',
);

replaceOnce(
  "unsupported timeframe error",
  'error instanceof Error && error.message === "Unsupported DEX timeframe"',
  'error instanceof Error && error.message === "Unsupported chart timeframe"',
);

replaceOnce(
  "load dependencies",
  "    [symbol, selectedMarketKey, selectedMarket, selectedDexMarket, timeframe, view.autoFitOnMarketChange, historyCapacity],",
  "    [selectedMarketKey, chartMarket, timeframe, view.autoFitOnMarketChange, historyCapacity],",
);

replaceOnce(
  "neutral realtime",
  `  useMexcRealtime({\n    enabled: terminalTab === "charts" && !dexSelected && !demo && !replayActive && view.realtimeChartUpdates,\n    symbol,\n    marketType: selectedMarket?.marketType ?? "futures",\n    timeframe: timeframe as CandleTimeframe,\n    contractSize:selectedMarket?.contractSize??1,`,
  `  useChartMarketRealtime({\n    enabled: terminalTab === "charts" && !demo && !replayActive && view.realtimeChartUpdates,\n    market: chartMarket,\n    timeframe: timeframe as CandleTimeframe,`,
);

replaceOnce(
  "remove DEX polling from terminal",
  `\n  useEffect(() => {\n    if (!dexSelected || terminalTab !== "charts" || replayActive || !view.realtimeChartUpdates) return;\n    const timer = window.setInterval(\n      () => void loadMarketData({ reason: "reconnect", resetView: false }),\n      65_000,\n    );\n    return () => window.clearInterval(timer);\n  }, [dexSelected, terminalTab, replayActive, view.realtimeChartUpdates, loadMarketData]);\n`,
  "\n",
);

replaceOnce(
  "DEX selection timeframe capability",
  '                    if (market.poolAddress===DIZY_USDT_POOL || !supportsDexChartTimeframe(timeframe)) setTimeframe("1m");',
  '                    if (market.poolAddress===DIZY_USDT_POOL || !chartMarketSupportsTimeframe(createDexChartMarket(market), timeframe)) setTimeframe("1m");',
);

replaceOnce(
  "toolbar timeframe capability",
  "              {ALL_TIMEFRAMES.filter((item) => !dexSelected || supportsDexChartTimeframe(item)).map((item) => (",
  "              {ALL_TIMEFRAMES.filter((item) => chartMarketSupportsTimeframe(chartMarket, item)).map((item) => (",
);

if (source.includes("useMexcRealtime"))
  throw new Error("MEXC realtime transport still leaks into trading terminal");
if (source.includes("/api/market?exchange=mexc") || source.includes("/api/dex/ohlcv?"))
  throw new Error("Provider candle request details still leak into trading terminal");
if (source.includes("supportsDexChartTimeframe") || source.includes("splitDexOhlcv"))
  throw new Error("DEX chart capability/normalization still leaks into trading terminal");

await writeFile(path, source);
