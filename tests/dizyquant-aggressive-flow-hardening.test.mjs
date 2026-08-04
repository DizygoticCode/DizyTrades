import assert from"node:assert/strict";
import test from"node:test";
import{calculateDizyQuantAggressiveFlow,DIZYQUANT_AGGRESSIVE_FLOW_WINDOW_MS}from"../app/lib/dizyquant/aggressive-flow.ts";

const fromMs=2_000_000,toMs=fromMs+DIZYQUANT_AGGRESSIVE_FLOW_WINDOW_MS;
const baseTrade={tradeId:"trade-1",timestampMs:fromMs,price:100,quantity:1,notional:100,side:"buy"};
const input=overrides=>({trades:[baseTrade],windowFromMs:fromMs,windowToMs:toMs,sequenceContinuous:true,hasGaps:false,openingMidpoint:100,closingMidpoint:100,openingBidDepth25Bps:1_000,openingAskDepth25Bps:1_000,...overrides});

test("normalised public trade identity rejects whitespace duplicate aliases",()=>{
 const state=calculateDizyQuantAggressiveFlow(input({trades:[baseTrade,{...baseTrade,tradeId:" trade-1 ",timestampMs:fromMs+1}]}));
 assert.equal(state.valid,false);
 assert.match(state.limitations[0],/identity/);
});

test("event windows and trade times require safe integer milliseconds",()=>{
 const fractionalWindow=calculateDizyQuantAggressiveFlow(input({windowFromMs:fromMs+.5,windowToMs:toMs+.5}));
 const fractionalTrade=calculateDizyQuantAggressiveFlow(input({trades:[{...baseTrade,timestampMs:fromMs+.5}]}));
 const unsafeTrade=calculateDizyQuantAggressiveFlow(input({trades:[{...baseTrade,timestampMs:Number.MAX_SAFE_INTEGER+1}]}));
 for(const state of[fractionalWindow,fractionalTrade,unsafeTrade]){
  assert.equal(state.valid,false);
  assert.equal(Object.keys(state.values).length,0);
 }
});

test("derived ratios fail closed when finite inputs overflow",()=>{
 const state=calculateDizyQuantAggressiveFlow(input({trades:[{...baseTrade,notional:Number.MAX_VALUE}],openingAskDepth25Bps:Number.MIN_VALUE}));
 assert.equal(state.valid,false);
 assert.match(state.limitations[0],/arithmetic|overflow/);
});
