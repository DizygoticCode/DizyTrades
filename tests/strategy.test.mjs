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
import { STRATEGY_PRESETS, resolveStrategySettings, strategyHistoryCapacity } from "../app/lib/strategy-presets.ts";

test("Pine V1 preset values are centralised and exact",()=>{
  assert.deepEqual(STRATEGY_PRESETS["scalp-15m"],{mode:"scalp-15m",trendLength:50,channelDeviation:2,requireMinConfluence:true,minConfluence:2,useVwapFilter:false,useTrendFilter:false,srLookback:300,pivotLength:3,srClusterAtr:.8,minTouches:2,srTolerancePct:.1,triangleTightnessPct:.5,breakoutVolumeMultiple:1.4,channelLength:80,channelReversalWindow:5,fibLength:100,zigZagThresholdPct:1,structureWindow:4,vwapLength:96});
  assert.deepEqual(STRATEGY_PRESETS["swing-1h-4h"],{mode:"swing-1h-4h",trendLength:50,channelDeviation:2,requireMinConfluence:true,minConfluence:2,useVwapFilter:false,useTrendFilter:false,srLookback:1000,pivotLength:8,srClusterAtr:1.3,minTouches:3,srTolerancePct:.2,triangleTightnessPct:.8,breakoutVolumeMultiple:1.1,channelLength:240,channelReversalWindow:8,fibLength:320,zigZagThresholdPct:2.5,structureWindow:8,vwapLength:192});
  assert.equal(strategyHistoryCapacity(STRATEGY_PRESETS["swing-1h-4h"]),1400);
});

test("preset resolution retains stored custom values",()=>{const stored={...DEFAULT_STRATEGY,mode:"scalp-15m",fibLength:555};assert.equal(resolveStrategySettings(stored).fibLength,100);assert.equal(resolveStrategySettings({...stored,mode:"custom"}).fibLength,555);});

test("historical signals are prefix invariant and carry five-part details",()=>{const candles=generateDemoCandles(500),prefix=analyzeStrategy(candles.slice(0,460),DEFAULT_STRATEGY).tradeSignals,extended=analyzeStrategy(candles,DEFAULT_STRATEGY).tradeSignals.filter(s=>s.time<=candles[459].time);assert.deepEqual(extended,prefix);assert.ok(extended.every(s=>s.confluenceTotal===5&&Object.keys(s.components).length===5&&s.primaryTrigger));});

test("signal scan is not limited to the latest 160 bars",()=>{const candles=generateDemoCandles(800),custom={...DEFAULT_STRATEGY,mode:"custom",minConfluence:1,requireMinConfluence:true};const analysis=analyzeStrategy(candles,custom);assert.equal(analysis.diagnostics.barsAfterWarmup,700);assert.ok(analysis.tradeSignals.some(s=>s.time<candles.at(-160).time));});

test("strategy produces finite visual analysis and a paper summary", () => {
  const candles = generateDemoCandles(420);
  const analysis = analyzeStrategy(candles, DEFAULT_STRATEGY);
  const summary = simulateConfirmedSignals(candles, analysis, DEFAULT_RISK);

  assert.ok(analysis.vwap.length >= 400);
  assert.ok(analysis.fibs.length === 7);
  assert.ok(analysis.levels.length > 0);
  assert.ok(analysis.levels.every(level=>level.startTime<=level.endTime));
  assert.ok(analysis.fibs.every(fib=>fib.startTime<=fib.endTime));
  assert.ok(analysis.activeChannel);
  const slopes=[analysis.activeChannel.basis,analysis.activeChannel.upper,analysis.activeChannel.lower].map(line=>(line[1].value-line[0].value)/(line[1].time-line[0].time));
  assert.ok(slopes.every(slope=>Number.isFinite(slope)));
  assert.ok(slopes.every(slope=>Math.abs(slope-slopes[0])<1e-12));
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
