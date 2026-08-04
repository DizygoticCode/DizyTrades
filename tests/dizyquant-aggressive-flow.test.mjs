import assert from"node:assert/strict";
import test from"node:test";
import{buildDizyQuantAggressiveFlowSnapshot,calculateDizyQuantAggressiveFlow,DIZYQUANT_AGGRESSIVE_FLOW_FORMULA_VERSION,DIZYQUANT_AGGRESSIVE_FLOW_WINDOW_MS}from"../app/lib/dizyquant/aggressive-flow.ts";

const FROM=1_000_000,TO=FROM+DIZYQUANT_AGGRESSIVE_FLOW_WINDOW_MS;
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const trades=()=>[
 {tradeId:"buy-1",timestampMs:FROM,price:100,quantity:2_000,notional:200_000,side:"buy"},
 {tradeId:"buy-2",timestampMs:FROM+2_000,price:100.1,quantity:3_000,notional:300_000,side:"buy"},
 {tradeId:"sell-1",timestampMs:FROM+5_000,price:99.9,quantity:1_000,notional:100_000,side:"sell"},
 {tradeId:"sell-2",timestampMs:TO-1,price:100,quantity:1_000,notional:100_000,side:"sell"},
];
const input=(overrides={})=>({trades:trades(),windowFromMs:FROM,windowToMs:TO,sequenceContinuous:true,hasGaps:false,openingMidpoint:100,closingMidpoint:100.2,openingBidDepth25Bps:400_000,openingAskDepth25Bps:1_000_000,...overrides});
const metric=(snapshot,id)=>snapshot.metrics.find(value=>value.id===id)?.value;

test("aggressive-flow formulas aggregate one deterministic event window",()=>{
 const state=calculateDizyQuantAggressiveFlow(input());
 assert.equal(state.valid,true);
 assert.equal(state.complete,true);
 assert.equal(state.formulaVersion,DIZYQUANT_AGGRESSIVE_FLOW_FORMULA_VERSION);
 assert.equal(state.tradeCount,4);
 assert.equal(state.buyTradeCount,2);
 assert.equal(state.sellTradeCount,2);
 assert.equal(state.buyNotional,500_000);
 assert.equal(state.sellNotional,200_000);
 assert.equal(state.grossNotional,700_000);
 assert.equal(state.netNotional,300_000);
 close(state.flowImbalancePct,42.857142857142854);
 close(state.tradeCountImbalancePct,0);
 close(state.buyFlowVsOpeningAskDepth25BpsPct,50);
 close(state.sellFlowVsOpeningBidDepth25BpsPct,50);
 close(state.midpointChangeBps,20);
 close(state.flowAlignedResponseBps,20);
 close(state.flowEfficiencyBpsPerMillion,28.571428571428573);
 assert.ok(Object.isFrozen(state));
 assert.ok(Object.isFrozen(state.values));
 assert.ok(Object.isFrozen(state.limitations));
});

test("continuous snapshot remains informational and exposes exact coverage",()=>{
 const snapshot=buildDizyQuantAggressiveFlowSnapshot({...input(),symbol:"BTC_USDT",evaluatedAtMs:TO+500,maxAgeMs:2_000});
 assert.equal(snapshot.availability,"fresh");
 assert.equal(snapshot.evidenceGrade,"continuous-stream-grade");
 assert.equal(snapshot.sequenceContinuous,true);
 assert.equal(snapshot.hasGaps,false);
 assert.deepEqual(snapshot.sourceKinds,["public-trades","depth-snapshot"]);
 assert.deepEqual(snapshot.coverage,{fromMs:FROM,toMs:TO});
 assert.equal(snapshot.decisionEligible,false);
 assert.equal(snapshot.signalInfluence,"forbidden");
 close(metric(snapshot,"aggressive-buy-notional-10s"),500_000);
 close(metric(snapshot,"aggressive-flow-imbalance-10s"),42.857142857142854);
 close(metric(snapshot,"flow-efficiency-bps-per-million-10s"),28.571428571428573);
});

test("unproven continuity retains values but classifies the research as gapped",()=>{
 const state=calculateDizyQuantAggressiveFlow(input({sequenceContinuous:null}));
 assert.equal(state.valid,true);
 assert.equal(state.complete,false);
 const snapshot=buildDizyQuantAggressiveFlowSnapshot({...input({sequenceContinuous:null}),symbol:"BTC_USDT",evaluatedAtMs:TO+500,maxAgeMs:2_000});
 assert.equal(snapshot.availability,"gapped");
 assert.equal(metric(snapshot,"aggressive-gross-notional-10s"),700_000);
 assert.ok(snapshot.limitations.some(value=>/continuity/.test(value)));
 const explicitGap=buildDizyQuantAggressiveFlowSnapshot({...input({hasGaps:true}),symbol:"BTC_USDT",evaluatedAtMs:TO+500,maxAgeMs:2_000});
 assert.equal(explicitGap.availability,"gapped");
});

test("a complete zero-trade window is fresh evidence rather than unavailable",()=>{
 const empty={trades:[],openingMidpoint:null,closingMidpoint:null,openingBidDepth25Bps:null,openingAskDepth25Bps:null};
 const state=calculateDizyQuantAggressiveFlow(input(empty));
 assert.equal(state.valid,true);
 assert.equal(state.tradeCount,0);
 assert.equal(state.grossNotional,0);
 assert.equal(state.flowImbalancePct,null);
 const snapshot=buildDizyQuantAggressiveFlowSnapshot({...input(empty),symbol:"BTC_USDT",evaluatedAtMs:TO+500,maxAgeMs:2_000});
 assert.equal(snapshot.availability,"fresh");
 assert.deepEqual(snapshot.sourceKinds,["public-trades"]);
 assert.equal(metric(snapshot,"aggressive-buy-notional-10s"),0);
 assert.equal(metric(snapshot,"aggressive-flow-imbalance-10s"),null);
});

test("missing depth or midpoint context only disables dependent metrics",()=>{
 const state=calculateDizyQuantAggressiveFlow(input({openingMidpoint:null,closingMidpoint:null,openingBidDepth25Bps:null,openingAskDepth25Bps:null}));
 assert.equal(state.valid,true);
 assert.equal(state.buyNotional,500_000);
 assert.equal(state.buyFlowVsOpeningAskDepth25BpsPct,null);
 assert.equal(state.sellFlowVsOpeningBidDepth25BpsPct,null);
 assert.equal(state.midpointChangeBps,null);
 assert.equal(state.flowAlignedResponseBps,null);
 assert.equal(state.flowEfficiencyBpsPerMillion,null);
});

test("net sell flow signs aligned response without claiming direction",()=>{
 const state=calculateDizyQuantAggressiveFlow(input({trades:[
  {tradeId:"buy",timestampMs:FROM,price:100,quantity:1,notional:100_000,side:"buy"},
  {tradeId:"sell",timestampMs:FROM+1,price:99.8,quantity:1,notional:400_000,side:"sell"},
 ],closingMidpoint:99.8}));
 assert.equal(state.netNotional,-300_000);
 close(state.midpointChangeBps,-20);
 close(state.flowAlignedResponseBps,20);
 close(state.flowEfficiencyBpsPerMillion,40);
});

test("invalid identity, ordering, bounds and context fail unavailable",()=>{
 const base=trades();
 const variants=[
  input({windowToMs:TO+1}),
  input({trades:[base[0],{...base[1],tradeId:"buy-1"}]}),
  input({trades:[base[1],base[0]]}),
  input({trades:[{...base[0],timestampMs:TO}]}),
  input({trades:[{...base[0],notional:0}]}),
  input({openingMidpoint:Number.NaN}),
 ];
 for(const value of variants){
  const state=calculateDizyQuantAggressiveFlow(value);
  assert.equal(state.valid,false);
  assert.equal(Object.keys(state.values).length,0);
  assert.ok(state.limitations.length);
 }
});

test("calculation does not mutate public trade evidence",()=>{
 const source=input(),before=structuredClone(source);
 calculateDizyQuantAggressiveFlow(source);
 assert.deepEqual(source,before);
});
