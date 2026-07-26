import test from "node:test";
import assert from "node:assert/strict";
import { applyKlineUpdate, mergeClosedCandles } from "../app/lib/market/realtime.ts";
import { reconcileClosedCandles, isCurrentMarketResponse } from "../app/lib/market/reconciliation.ts";
import { classifySeriesSync, requiresSetData } from "../app/lib/chart/series-sync.ts";
import { livePaperSnapshot, formatSignedMoney, tradeExitLabel } from "../app/lib/paper-performance.ts";
import { sanitiseTerminalSettings } from "../app/lib/config.ts";

const candle = (time, close=time) => ({ time, open:close, high:close, low:close, close, volume:1 });

test("kline rollover finalises one candle and exposes the new live candle without REST", () => {
  const first=applyKlineUpdate([candle(1)],candle(2),candle(3));
  assert.deepEqual(first.closed.map(item=>item.time),[1,2]); assert.equal(first.live.time,3); assert.equal(first.rolled,true);
  const duplicate=applyKlineUpdate(first.closed,first.live,candle(3,4));
  assert.deepEqual(duplicate.closed.map(item=>item.time),[1,2]); assert.equal(duplicate.live.close,4);
});

test("reconciliation deduplicates, prefers REST corrections, and retains newer local bars",()=>{
  const result=reconcileClosedCandles([candle(1),candle(2,20)],[candle(1,10)]);
  assert.deepEqual(result.map(item=>item.time),[1,2]); assert.equal(result[0].close,10); assert.equal(result[1].close,20);
  assert.equal(mergeClosedCandles([candle(1)],[candle(1,2)]).length,1);
  assert.equal(isCurrentMarketResponse("BTC:1m","ETH:1m"),false);
});

test("series sync only uses full data for initial, market, or historical corrections",()=>{
  assert.equal(classifySeriesSync([], [candle(1)]),"initial");
  assert.equal(classifySeriesSync([candle(1)],[candle(1),candle(2)]),"append");
  assert.equal(classifySeriesSync([candle(1)],[candle(1,2)]),"replace-latest");
  assert.equal(requiresSetData(classifySeriesSync([candle(1),candle(2)],[candle(1,2),candle(2)])),true);
  assert.equal(requiresSetData(classifySeriesSync([candle(1)],[candle(1),candle(2)])),false);
});

const summary={initialEquity:1000,endingEquity:1010,returnPct:1,maxDrawdownPct:1,trades:1,wins:1,winRatePct:100,profitFactor:null,closedTrades:[{id:"x",direction:"long",signalTime:1,entryTime:2,exitTime:3,entry:100,exit:105,stop:95,pnl:10,pnlPct:1,result:"win",exitReason:"MARK",remainingQuantity:2,realisedPnl:0}]};
test("live MTM marks an existing confirmed position but SIM OFF retains confirmed results",()=>{
  const live=livePaperSnapshot(summary,110,true); assert.equal(live.endingEquity,1020); assert.equal(live.liveMtm,true);
  const off=livePaperSnapshot(summary,110,false); assert.equal(off.endingEquity,1010); assert.equal(off.liveMtm,false); assert.equal(off.trades,1);
});
test("paper formatting is signed and MARK is accessible",()=>{assert.equal(formatSignedMoney(2),"+$2.00");assert.equal(formatSignedMoney(-2),"-$2.00");assert.equal(tradeExitLabel("MARK"),"Open / MTM");});
test("existing profiles default simulation toolbar on",()=>assert.equal(sanitiseTerminalSettings({view:{}}).view.showSimulationPerformance,true));
