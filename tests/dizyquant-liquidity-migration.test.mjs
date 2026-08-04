import assert from"node:assert/strict";
import test from"node:test";
import{buildDizyQuantLiquidityMigrationSnapshot,calculateDizyQuantLiquidityMigration,DIZYQUANT_LIQUIDITY_MIGRATION_FORMULA_VERSION,DIZYQUANT_LIQUIDITY_MIGRATION_WINDOW_MS}from"../app/lib/dizyquant/liquidity-migration.ts";

const FROM=3_000_000,TO=FROM+DIZYQUANT_LIQUIDITY_MIGRATION_WINDOW_MS;
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const level=(priceTick,bidContracts=0,askContracts=0)=>({priceTick,bidContracts,askContracts});
const frames=()=>[
 {timestampMs:FROM,midpoint:100,levels:[level(999,10),level(998,5),level(1001,0,8),level(1002,0,4)]},
 {timestampMs:FROM+10_000,midpoint:100,levels:[level(999,6),level(998,9),level(997,4),level(1001,0,5),level(1002,0,8),level(1003,0,2)]},
 {timestampMs:FROM+20_000,midpoint:100,levels:[level(999,4),level(998,7),level(997,8),level(1001,0,4),level(1002,0,7),level(1003,0,6)]},
 {timestampMs:TO,midpoint:100,levels:[level(999,5),level(998,6),level(997,7),level(1001,0,3),level(1002,0,6),level(1003,0,8)]},
];
const input=(overrides={})=>({frames:frames(),windowFromMs:FROM,windowToMs:TO,priceStep:.1,contractSize:1,sequenceContinuous:true,hasGaps:false,sourceKind:"retained-liquidity",...overrides});
const metric=(snapshot,id)=>snapshot.metrics.find(value=>value.id===id)?.value;

test("liquidity migration formulas measure turnover, persistence and centre movement",()=>{
 const state=calculateDizyQuantLiquidityMigration(input());
 assert.equal(state.valid,true);assert.equal(state.complete,true);assert.equal(state.formulaVersion,DIZYQUANT_LIQUIDITY_MIGRATION_FORMULA_VERSION);assert.equal(state.frameCount,4);
 close(state.openingDepthNotional,2699.6);close(state.closingDepthNotional,3500.1);
 close(state.bidAddedNotional,1296.7);close(state.askAddedNotional,1203.2);close(state.bidRemovedNotional,998.5);close(state.askRemovedNotional,700.9);
 close(state.addedNotional,2499.9);close(state.removedNotional,1699.4);close(state.turnoverNotional,4199.3);close(state.turnoverVsOpeningDepthPct,155.55267447029192);
 close(state.bidSamePricePersistencePct,66.65554072096128);close(state.askSamePricePersistencePct,58.347203728362175);close(state.samePricePersistencePct,62.95747518150837);
 assert.equal(state.openingClusterCount,2);assert.equal(state.survivingOpeningClusterCount,1);close(state.openingClusterSurvivalPct,50);
 close(state.signedCentreShiftBps,1.80197402145219);close(state.absoluteDistanceShiftBps,8.668285006221167);close(state.bidDistanceShiftBps,7.773445914375939);close(state.askDistanceShiftBps,9.611216580057045);close(state.nearDepthConcentrationShiftPctPoints,-42.864489586011835);
 assert.ok(Object.isFrozen(state));assert.ok(Object.isFrozen(state.values));assert.ok(Object.isFrozen(state.limitations));
});

test("snapshot wrapper preserves exact coverage and informational isolation",()=>{
 const snapshot=buildDizyQuantLiquidityMigrationSnapshot({...input(),symbol:"BTC_USDT",evaluatedAtMs:TO+500,maxAgeMs:2_000});
 assert.equal(snapshot.availability,"fresh");assert.equal(snapshot.evidenceGrade,"continuous-stream-grade");assert.equal(snapshot.sequenceContinuous,true);assert.equal(snapshot.hasGaps,false);assert.deepEqual(snapshot.sourceKinds,["retained-liquidity"]);assert.deepEqual(snapshot.coverage,{fromMs:FROM,toMs:TO});assert.equal(snapshot.decisionEligible,false);assert.equal(snapshot.signalInfluence,"forbidden");
 close(metric(snapshot,"liquidity-turnover-30s"),4199.3);close(metric(snapshot,"same-price-liquidity-persistence-30s"),62.95747518150837);close(metric(snapshot,"near-depth-concentration-shift-25-of-100bps-30s"),-42.864489586011835);
});

test("unproven or explicitly broken continuity retains values but remains gapped",()=>{
 for(const overrides of[{sequenceContinuous:null},{sequenceContinuous:false},{hasGaps:true}]){
  const state=calculateDizyQuantLiquidityMigration(input(overrides));assert.equal(state.valid,true);assert.equal(state.complete,false);
  const snapshot=buildDizyQuantLiquidityMigrationSnapshot({...input(overrides),symbol:"BTC_USDT",evaluatedAtMs:TO+500,maxAgeMs:2_000});assert.equal(snapshot.availability,"gapped");close(metric(snapshot,"liquidity-added-30s"),2499.9);assert.ok(snapshot.limitations.some(value=>/continuity/.test(value)));
 }
});

test("an unchanged complete book records zero turnover and full persistence",()=>{
 const opening=frames()[0],stable=[opening,{...structuredClone(opening),timestampMs:TO}];const state=calculateDizyQuantLiquidityMigration(input({frames:stable,sourceKind:"depth-stream"}));
 assert.equal(state.valid,true);assert.equal(state.turnoverNotional,0);assert.equal(state.addedNotional,0);assert.equal(state.removedNotional,0);close(state.bidSamePricePersistencePct,100);close(state.askSamePricePersistencePct,100);close(state.samePricePersistencePct,100);close(state.openingClusterSurvivalPct,100);close(state.signedCentreShiftBps,0);close(state.absoluteDistanceShiftBps,0);close(state.nearDepthConcentrationShiftPctPoints,0);
});

test("invalid endpoints, ordering, levels and arithmetic fail unavailable",()=>{
 const source=frames();const variants=[
  input({windowToMs:TO+1}),input({frames:source.slice(1)}),input({frames:[source[0],{...source[1],timestampMs:FROM},source[3]]}),
  input({frames:[{...source[0],levels:[level(999,10),level(999,5),level(1001,0,8)]},source[3]]}),
  input({frames:[{...source[0],levels:[level(999,1,1),level(1001,0,8)]},source[3]]}),
  input({frames:[{...source[0],levels:[level(1001,10),level(1002,0,8)]},source[3]]}),
  input({frames:[{...source[0],levels:[level(999,-1),level(1001,0,8)]},source[3]]}),
  input({frames:[{...source[0],levels:[level(999,10)]},source[3]]}),input({priceStep:0}),input({contractSize:Number.MAX_VALUE}),
 ];
 for(const value of variants){const state=calculateDizyQuantLiquidityMigration(value);assert.equal(state.valid,false);assert.equal(Object.keys(state.values).length,0);assert.ok(state.limitations.length)}
});

test("calculation does not mutate retained liquidity evidence",()=>{
 const source=input(),before=structuredClone(source);calculateDizyQuantLiquidityMigration(source);assert.deepEqual(source,before);
});
