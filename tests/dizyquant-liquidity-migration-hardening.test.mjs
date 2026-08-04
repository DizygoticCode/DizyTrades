import assert from"node:assert/strict";
import test from"node:test";
import{calculateDizyQuantLiquidityMigration,DIZYQUANT_LIQUIDITY_MIGRATION_WINDOW_MS}from"../app/lib/dizyquant/liquidity-migration.ts";

const fromMs=4_000_000,toMs=fromMs+DIZYQUANT_LIQUIDITY_MIGRATION_WINDOW_MS;
const level=(priceTick,bidContracts=0,askContracts=0)=>({priceTick,bidContracts,askContracts});
const frame=(timestampMs,bid=10,ask=10)=>({timestampMs,midpoint:100,levels:[level(999,bid),level(1001,0,ask)]});
const input=overrides=>({frames:[frame(fromMs),frame(toMs)],windowFromMs:fromMs,windowToMs:toMs,priceStep:.1,contractSize:1,sequenceContinuous:true,hasGaps:false,sourceKind:"depth-stream",...overrides});

test("repeated removal and replacement remains turnover despite identical endpoints",()=>{
 const state=calculateDizyQuantLiquidityMigration(input({frames:[frame(fromMs),frame(fromMs+15_000,5,5),frame(toMs)]}));
 assert.equal(state.valid,true);assert.equal(state.openingDepthNotional,state.closingDepthNotional);assert.equal(state.samePricePersistencePct,100);assert.equal(state.removedNotional,1000);assert.equal(state.addedNotional,1000);assert.equal(state.turnoverNotional,2000);
});

test("absent one-hundred-bps coverage leaves concentration shift unavailable",()=>{
 const far={timestampMs:fromMs,midpoint:100,levels:[level(980,10),level(1020,0,10)]},closing={...far,timestampMs:toMs};const state=calculateDizyQuantLiquidityMigration(input({frames:[far,closing]}));
 assert.equal(state.valid,true);assert.equal(state.nearDepthConcentrationShiftPctPoints,null);assert.equal(state.values["near-depth-concentration-shift-25-of-100bps-30s"],null);assert.ok(state.limitations.some(value=>/one hundred/.test(value)));
});

test("malformed runtime arrays fail unavailable rather than throwing",()=>{
 const variants=[input({frames:{length:2}}),input({frames:[{...frame(fromMs),levels:{length:2}},frame(toMs)]}),input({frames:[{...frame(fromMs),levels:[null,level(1001,0,10)]},frame(toMs)]})];
 for(const value of variants){assert.doesNotThrow(()=>calculateDizyQuantLiquidityMigration(value));const state=calculateDizyQuantLiquidityMigration(value);assert.equal(state.valid,false);assert.equal(Object.keys(state.values).length,0)}
});

test("a post-window frame cannot alter or extend the defined research interval",()=>{
 const state=calculateDizyQuantLiquidityMigration(input({frames:[frame(fromMs),frame(toMs),frame(toMs+1)]}));assert.equal(state.valid,false);assert.match(state.limitations[0],/outside coverage|endpoints|ordered/);
});
