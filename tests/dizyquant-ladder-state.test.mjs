import assert from"node:assert/strict";
import test from"node:test";
import{buildDizyQuantLadderSnapshot,calculateDizyQuantLadderState,DIZYQUANT_DEPTH_BANDS_BPS,DIZYQUANT_LADDER_FORMULA_VERSION}from"../app/lib/dizyquant/ladder-state.ts";

const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const book=(overrides={})=>({valid:true,version:7,bids:[{price:99.9,orderCount:2,contractQuantity:2},{price:99.8,orderCount:1,contractQuantity:1},{price:99.5,orderCount:3,contractQuantity:3},{price:99,orderCount:4,contractQuantity:4}],asks:[{price:100.1,orderCount:1,contractQuantity:1},{price:100.2,orderCount:2,contractQuantity:2},{price:100.5,orderCount:1,contractQuantity:1},{price:101,orderCount:5,contractQuantity:5}],...overrides});

function metric(snapshot,id){return snapshot.metrics.find(value=>value.id===id)?.value}

test("ladder-state formulas calculate fixed depth bands deterministically",()=>{
 const state=calculateDizyQuantLadderState(book(),1,.1);
 assert.equal(state.valid,true);
 assert.equal(state.formulaVersion,DIZYQUANT_LADDER_FORMULA_VERSION);
 assert.deepEqual(DIZYQUANT_DEPTH_BANDS_BPS,[10,25,50,100]);
 close(state.midpoint,100);
 close(state.spreadPrice,.2);
 close(state.spreadTicks,2);
 close(state.spreadBps,20);
 const expected=[[10,199.8,100.1,33.24441480493498],[25,299.6,300.5,-.14997500416596854],[50,598.1,300.5,33.11818384153128],[100,994.1,906,4.636598073785592]];
 for(const [index,[bps,bid,ask,imbalance]]of expected.entries()){
  const band=state.bands[index];
  assert.equal(band.bps,bps);close(band.bidNotional,bid);close(band.askNotional,ask);close(band.imbalancePct,imbalance);
 }
 close(state.weightedDistanceBps100,62.65617599073729);
 close(state.nearDepthConcentrationPct,31.582548286932273);
 assert.equal(state.values["spread-bps"],state.spreadBps);
 assert.equal(state.values["depth-imbalance-25bps"],state.bands[1].imbalancePct);
 assert.ok(Object.isFrozen(state));
 assert.ok(Object.isFrozen(state.bands));
 assert.ok(Object.isFrozen(state.values));
});

test("contract size scales notional without changing dimensionless metrics",()=>{
 const one=calculateDizyQuantLadderState(book(),1,.1),ten=calculateDizyQuantLadderState(book(),10,.1);
 for(let index=0;index<one.bands.length;index++){
  close(ten.bands[index].bidNotional,one.bands[index].bidNotional*10);
  close(ten.bands[index].askNotional,one.bands[index].askNotional*10);
  close(ten.bands[index].imbalancePct,one.bands[index].imbalancePct);
 }
 close(ten.weightedDistanceBps100,one.weightedDistanceBps100);
 close(ten.nearDepthConcentrationPct,one.nearDepthConcentrationPct);
 close(ten.spreadBps,one.spreadBps);
});

test("snapshot wrapper emits fresh informational research without sequence claims",()=>{
 const snapshot=buildDizyQuantLadderSnapshot({symbol:"BTC_USDT",book:book(),contractSize:1,priceStep:.1,sourceTimeMs:1_000_000,evaluatedAtMs:1_000_500,maxAgeMs:2_000});
 assert.equal(snapshot.availability,"fresh");
 assert.equal(snapshot.evidenceGrade,"snapshot-grade");
 assert.equal(snapshot.sequenceContinuous,null);
 assert.equal(snapshot.decisionEligible,false);
 assert.equal(snapshot.signalInfluence,"forbidden");
 close(metric(snapshot,"spread-ticks"),2);
 close(metric(snapshot,"bid-depth-100bps"),994.1);
 close(metric(snapshot,"near-depth-concentration-25-of-100bps"),31.582548286932273);
});

test("staleness changes live availability without changing metric values",()=>{
 const fresh=buildDizyQuantLadderSnapshot({symbol:"BTC_USDT",book:book(),contractSize:1,priceStep:.1,sourceTimeMs:1_000_000,evaluatedAtMs:1_000_500,maxAgeMs:2_000});
 const stale=buildDizyQuantLadderSnapshot({symbol:"BTC_USDT",book:book(),contractSize:1,priceStep:.1,sourceTimeMs:1_000_000,evaluatedAtMs:1_010_000,maxAgeMs:2_000});
 assert.equal(stale.availability,"stale");
 assert.deepEqual(stale.metrics,fresh.metrics);
});

test("invalid, incomplete, unsorted and crossed books remain unavailable",()=>{
 const variants=[
  book({valid:false}),book({bids:[]}),book({asks:[]}),book({bids:[{price:100.2,orderCount:1,contractQuantity:1}],asks:[{price:100.1,orderCount:1,contractQuantity:1}]}),
  book({bids:[{price:99.8,orderCount:1,contractQuantity:1},{price:99.9,orderCount:1,contractQuantity:1}]}),book({bids:[{price:99.9,orderCount:1,contractQuantity:-1}]}),
 ];
 for(const value of variants){
  const state=calculateDizyQuantLadderState(value,1,.1);assert.equal(state.valid,false);assert.equal(state.values["spread-bps"],undefined);assert.ok(state.limitations.length);
  const snapshot=buildDizyQuantLadderSnapshot({symbol:"BTC_USDT",book:value,contractSize:1,priceStep:.1,sourceTimeMs:1_000_000,evaluatedAtMs:1_000_500,maxAgeMs:2_000});
  assert.equal(snapshot.availability,"unavailable");assert.equal(snapshot.availableMetricCount,0);
 }
 assert.equal(calculateDizyQuantLadderState(book(),0,.1).valid,false);
 assert.equal(calculateDizyQuantLadderState(book(),1,0).valid,false);
});

test("wide valid books preserve spread while nearby-depth metrics remain empty",()=>{
 const wide=book({bids:[{price:98,orderCount:1,contractQuantity:2}],asks:[{price:102,orderCount:1,contractQuantity:2}]});
 const state=calculateDizyQuantLadderState(wide,1,.1);
 assert.equal(state.valid,true);close(state.spreadBps,400);
 assert.equal(state.bands[3].bidNotional,0);assert.equal(state.bands[3].askNotional,0);assert.equal(state.bands[3].imbalancePct,null);
 assert.equal(state.weightedDistanceBps100,null);assert.equal(state.nearDepthConcentrationPct,null);
 const snapshot=buildDizyQuantLadderSnapshot({symbol:"BTC_USDT",book:wide,contractSize:1,priceStep:.1,sourceTimeMs:1_000_000,evaluatedAtMs:1_000_500,maxAgeMs:2_000});
 assert.equal(snapshot.availability,"fresh");close(metric(snapshot,"spread-bps"),400);assert.equal(metric(snapshot,"depth-imbalance-100bps"),null);
});

test("calculation does not mutate the provider book",()=>{
 const source=book(),before=structuredClone(source);
 calculateDizyQuantLadderState(source,1,.1);
 assert.deepEqual(source,before);
});
