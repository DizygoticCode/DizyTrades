import assert from "node:assert/strict";
import test from "node:test";
import { simulateConfirmedSignals } from "../app/lib/backtest.ts";
import {
  DEFAULT_RISK,
  DEFAULT_STRATEGY,
  sanitiseTerminalSettings,
} from "../app/lib/config.ts";
import {
  analyzeStrategy,
  generateDemoCandles,
} from "../app/lib/strategy.ts";

test("strategy produces finite visual analysis and a paper summary", () => {
  const candles = generateDemoCandles(420);
  const analysis = analyzeStrategy(candles, DEFAULT_STRATEGY);
  const summary = simulateConfirmedSignals(candles, analysis, DEFAULT_RISK);

  assert.ok(analysis.vwap.length >= 400);
  assert.ok(analysis.fibs.length === 7);
  assert.ok(analysis.levels.length > 0);
  assert.ok(Number.isFinite(summary.endingEquity));
  assert.ok(Number.isFinite(summary.maxDrawdownPct));
  assert.equal(summary.trades, summary.closedTrades.length);
});

test("settings sanitiser clamps unsafe or malformed values", () => {
  const settings = sanitiseTerminalSettings({
    view: { volumeBars: 999999, labelSize: "Huge" },
    strategy: { minConfluence: -4, channelDeviation: 99 },
    risk: { riskPct: 500, leverage: 100, maxNotional: -1 },
  });

  assert.equal(settings.view.volumeBars, 600);
  assert.equal(settings.view.labelSize, "Medium");
  assert.equal(settings.strategy.minConfluence, 1);
  assert.equal(settings.strategy.channelDeviation, 5);
  assert.equal(settings.risk.riskPct, 10);
  assert.equal(settings.risk.leverage, 10);
  assert.equal(settings.risk.maxNotional, 50);
});
