import test from "node:test";
import assert from "node:assert/strict";
import { aggregatePerformanceDashboard, journalPerformanceFacts } from "../app/lib/performance-dashboard.ts";

const entry=(id,{pnl,close,open="2026-01-01T00:00:00.000Z",symbol="BTC_USDT",timeframe="15m",direction="long",closeReason="target",fees=1,r=1,archived=false}={})=>({id,schemaVersion:5,type:"trade-review",createdAt:close,editedAt:close,title:"",archived,archivedAt:archived?close:null,notes:"",tags:[],dismissedPrompts:[],quality:null,planDiscipline:null,mood:null,marketContext:null,trade:{tradeId:id,symbol,market:symbol,timeframe,direction,entry:100,exit:101,stop:null,target:null,positionSize:null,riskPct:null,leverage:null,marginMode:null,fees,pnl,pnlPct:pnl,rMultiple:r,openTime:open,closeTime:close,closeReason,strategyVersion:null,replay:null,brain:null,signal:null,dizyBrainReview:{available:false,reviewId:null,engineVersion:null,generatedAt:null,generatedFromHash:null,reviewConfidence:null},historicalDizyFlow:{available:false,memoryId:null,captureStartMs:null,captureEndMs:null,sampleCount:0,eventCount:0,averageConfidence:null,coveragePct:null,limitations:["capture-unavailable"]}}});

const entries=[
 entry("later-win",{pnl:50,close:"2026-01-04T00:00:00.000Z",symbol:"ETH_USDT",timeframe:"1h",direction:"short",closeReason:"manual",fees:null,r:null}),
 entry("first-win",{pnl:100,close:"2026-01-01T01:00:00.000Z",open:"2026-01-01T00:00:00.000Z",fees:1,r:2}),
 entry("loss-one",{pnl:-40,close:"2026-01-02T00:00:00.000Z",fees:1,r:-1}),
 entry("loss-two",{pnl:-80,close:"2026-01-03T00:00:00.000Z",symbol:"ETH_USDT",timeframe:"1h",direction:"short",closeReason:"stop",fees:1,r:-2}),
];

test("performance facts are chronological and exclude archived by default",()=>{
 const facts=journalPerformanceFacts([...entries,entry("archived",{pnl:999,close:"2026-01-05T00:00:00.000Z",archived:true})]);
 assert.deepEqual(facts.map(item=>item.tradeId),["first-win","loss-one","loss-two","later-win"]);
 assert.equal(journalPerformanceFacts([...entries,entry("archived",{pnl:999,close:"2026-01-05T00:00:00.000Z",archived:true})],true).length,5);
});

test("dashboard computes realised curve, drawdown, expectancy and streaks",()=>{
 const result=aggregatePerformanceDashboard(entries,{generatedAt:"2026-02-01T00:00:00.000Z"});
 assert.equal(result.reviewedTrades,4);
 assert.equal(result.netPnl,30);
 assert.equal(result.grossProfit,150);
 assert.equal(result.grossLoss,120);
 assert.equal(result.profitFactor,1.25);
 assert.equal(result.payoffRatio,1.25);
 assert.equal(result.expectancy,7.5);
 assert.equal(result.maximumDrawdown,120);
 assert.equal(result.maximumWinStreak,1);
 assert.equal(result.maximumLossStreak,2);
 assert.deepEqual(result.curve.map(point=>point.cumulativePnl),[100,60,-20,30]);
 assert.equal(result.curve[2].drawdown,120);
});

test("fees, R and holding coverage remain explicit",()=>{
 const result=aggregatePerformanceDashboard(entries);
 assert.equal(result.totalFees,3);
 assert.equal(result.feeSampleSize,3);
 assert.equal(result.feeCoveragePct,75);
 assert.equal(result.rSampleSize,3);
 assert.equal(result.averageR,-1/3);
 assert.equal(result.medianR,-1);
 assert.equal(result.holdingSampleSize,4);
 assert.ok(result.warnings.some(warning=>warning.code==="PARTIAL_FEES"));
 assert.ok(result.warnings.some(warning=>warning.code==="PARTIAL_R"));
 assert.ok(result.warnings.some(warning=>warning.code==="CURVE_BOUNDARY"));
});

test("breakdowns are deterministic and preserve sample warnings",()=>{
 const result=aggregatePerformanceDashboard(entries);
 assert.deepEqual(result.bySymbol.map(bucket=>bucket.label),["BTC_USDT","ETH_USDT"]);
 assert.equal(result.bySymbol.find(bucket=>bucket.key==="BTC_USDT").netPnl,60);
 assert.equal(result.byDirection.find(bucket=>bucket.key==="short").netPnl,-30);
 assert.equal(result.byCloseReason.find(bucket=>bucket.key==="stop").trades,1);
 assert.equal(result.byTimeframe.find(bucket=>bucket.key==="1h").sampleLevel,"very-small");
});

test("R distribution counts each recorded sample exactly once",()=>{
 const result=aggregatePerformanceDashboard(entries);
 assert.equal(result.rDistribution.reduce((sum,bucket)=>sum+bucket.trades,0),result.rSampleSize);
 assert.equal(result.rDistribution.find(bucket=>bucket.key==="lt-minus-2").trades,1);
 assert.equal(result.rDistribution.find(bucket=>bucket.key==="one-two").trades,1);
});

test("empty dashboard is honest and finite",()=>{
 const result=aggregatePerformanceDashboard([]);
 assert.equal(result.reviewedTrades,0);
 assert.equal(result.netPnl,0);
 assert.equal(result.maximumDrawdown,0);
 assert.equal(result.profitFactor,null);
 assert.deepEqual(result.curve,[]);
 assert.ok(result.warnings.some(warning=>warning.code==="NO_DATA"));
});
