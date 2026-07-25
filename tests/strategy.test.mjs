import assert from "node:assert/strict";
import test from "node:test";
import { simulateConfirmedSignals } from "../app/lib/backtest.ts";
import {
  DEFAULT_RISK,
  DEFAULT_STRATEGY,
  sanitiseTerminalSettings,
} from "../app/lib/config.ts";
import {
  alternatingPivots,
  analyzeStrategy,
  formatLevelLabel,
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

test("structural labels are short, ordered and price-free", () => {
  const analysis = analyzeStrategy(generateDemoCandles(420), DEFAULT_STRATEGY);
  const resistances = analysis.levels.filter(level => level.kind === "resistance").sort((a,b)=>a.price-b.price);
  const supports = analysis.levels.filter(level => level.kind === "support").sort((a,b)=>b.price-a.price);
  resistances.forEach((level,index)=>assert.equal(level.label,`R${index+1}`));
  supports.forEach((level,index)=>assert.equal(level.label,`S${index+1}`));
  for (const level of analysis.levels) {
    assert.equal(formatLevelLabel(level), level.label);
    assert.equal(formatLevelLabel(level,true), `${level.label} · ${level.touches}×`);
    assert.ok(!formatLevelLabel(level,true).includes(level.price.toFixed(1)));
  }
  assert.deepEqual(analysis.fibs.map(f=>f.label), ["FIB 0","FIB 0.236","FIB 0.382","FIB 0.5","FIB 0.618","FIB 0.786","FIB 1"]);
  assert.ok(analysis.fibs.every(f=>!f.label.includes(f.price.toFixed(1))));
});

test("alternating pivots collapse consecutive extremes deterministically", () => {
  const sequence=alternatingPivots([{index:1,time:1,price:10},{index:2,time:2,price:12},{index:4,time:4,price:14}],[{index:3,time:3,price:7}]);
  assert.deepEqual(sequence.map(p=>[p.kind,p.time]), [["high",2],["low",3],["high",4]]);
});

test("trade signals keep stable timestamps and are deduplicated", () => {
  const candles=generateDemoCandles(420), analysis=analyzeStrategy(candles,DEFAULT_STRATEGY);
  assert.equal(new Set(analysis.tradeSignals.map(signal=>signal.id)).size,analysis.tradeSignals.length);
  assert.ok(analysis.tradeSignals.every(signal=>candles.some(candle=>candle.time===signal.time)));
  assert.ok(analysis.patternStages.every(stage=>stage.status === "confirmed" ? !stage.label.endsWith("?") : stage.label.endsWith("?")));
  assert.ok(analysis.completedPatterns.every(region=>region.status === "confirmed"));
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
