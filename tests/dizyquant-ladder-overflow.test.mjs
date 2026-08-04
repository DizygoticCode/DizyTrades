import assert from"node:assert/strict";
import test from"node:test";
import{buildDizyQuantLadderSnapshot,calculateDizyQuantLadderState}from"../app/lib/dizyquant/ladder-state.ts";

const hugeBook={valid:true,version:1,bids:[{price:1e200,orderCount:1,contractQuantity:1e200}],asks:[{price:1.0001e200,orderCount:1,contractQuantity:1e200}]};

test("derived notional overflow becomes unavailable rather than Infinity",()=>{
 const state=calculateDizyQuantLadderState(hugeBook,1,1e190);
 assert.equal(state.valid,false);
 assert.match(state.limitations[0],/numeric boundary/);
 assert.deepEqual(state.values,{});
 const snapshot=buildDizyQuantLadderSnapshot({symbol:"BTC_USDT",book:hugeBook,contractSize:1,priceStep:1e190,sourceTimeMs:1_000_000,evaluatedAtMs:1_000_100,maxAgeMs:2_000});
 assert.equal(snapshot.availability,"unavailable");
 assert.equal(snapshot.availableMetricCount,0);
 assert.equal(snapshot.metrics.some(value=>value.value===Infinity),false);
});

test("derived spread overflow becomes unavailable",()=>{
 const state=calculateDizyQuantLadderState({valid:true,version:1,bids:[{price:1,orderCount:1,contractQuantity:1}],asks:[{price:Number.MAX_VALUE,orderCount:1,contractQuantity:1}]},1,Number.MIN_VALUE);
 assert.equal(state.valid,false);
 assert.match(state.limitations[0],/numeric boundary/);
});
