import assert from"node:assert/strict";
import test from"node:test";
import{buildDizyQuantResilienceSnapshot,calculateDizyQuantResilience,DIZYQUANT_RESILIENCE_FORMULA_VERSION,DIZYQUANT_RESILIENCE_WINDOW_MS}from"../app/lib/dizyquant/resilience.ts";

const FROM=1_000_000,SHOCK=FROM+20_000,RECOVERY=FROM+30_000,TO=FROM+DIZYQUANT_RESILIENCE_WINDOW_MS;
const levels=(bidNear=1_000,bidFar=1_000,askNear=1_000,askFar=1_000)=>[
 {priceTick:999,bidContracts:bidNear,askContracts:0},
 {priceTick:998,bidContracts:bidFar,askContracts:0},
 {priceTick:1001,bidContracts:0,askContracts:askNear},
 {priceTick:1002,bidContracts:0,askContracts:askFar},
];
const frames=()=>[
 {timestampMs:FROM,midpoint:100,levels:levels()},
 {timestampMs:SHOCK,midpoint:100,levels:levels(0,200,1_000,1_000)},
 {timestampMs:RECOVERY,midpoint:100,levels:levels(900,900,1_000,1_000)},
 {timestampMs:TO,midpoint:100.01,levels:levels()},
];
const input=(overrides={})=>({frames:frames(),windowFromMs:FROM,windowToMs:TO,shockTimestampMs:SHOCK,priceStep:.1,contractSize:1,sequenceContinuous:true,hasGaps:false,sourceKind:"depth-stream",...overrides});
const close=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const metric=(snapshot,id)=>snapshot.metrics.find(value=>value.id===id)?.value;

test("resilience formulas measure shock, recovery and same-price replenishment",()=>{
 const state=calculateDizyQuantResilience(input());
 assert.equal(state.valid,true);
 assert.equal(state.complete,true);
 assert.equal(state.formulaVersion,DIZYQUANT_RESILIENCE_FORMULA_VERSION);
 assert.equal(state.spreadShock,true);
 assert.equal(state.bidDepthShock,true);
 assert.equal(state.askDepthShock,false);
 assert.equal(state.shockComponentCount,2);
 assert.equal(state.recoveredComponentCount,2);
 assert.equal(state.spreadRecoveryMs,10_000);
 assert.equal(state.bidDepthRecoveryMs,10_000);
 assert.equal(state.resilienceRecoveryMs,10_000);
 assert.ok(state.shockLossNotional>0);
 close(state.replenishmentVsShockLossPct,100);
 close(state.samePriceReplenishmentSharePct,100);
 assert.equal(state.absorptionCandidateFlag,1);
 assert.equal(state.exhaustionCandidateFlag,0);
 assert.equal(state.candidateLabel,"absorption");
 assert.ok(Object.isFrozen(state));
 assert.ok(Object.isFrozen(state.values));
 assert.ok(Object.isFrozen(state.limitations));
});

test("research snapshot preserves coverage and remains signal forbidden",()=>{
 const snapshot=buildDizyQuantResilienceSnapshot({...input(),symbol:"BTC_USDT",evaluatedAtMs:TO+500,maxAgeMs:2_000});
 assert.equal(snapshot.availability,"fresh");
 assert.equal(snapshot.evidenceGrade,"continuous-stream-grade");
 assert.deepEqual(snapshot.coverage,{fromMs:FROM,toMs:TO});
 assert.deepEqual(snapshot.sourceKinds,["depth-stream"]);
 assert.equal(snapshot.decisionEligible,false);
 assert.equal(snapshot.signalInfluence,"forbidden");
 assert.equal(metric(snapshot,"resilience-recovery-ms"),10_000);
 assert.equal(metric(snapshot,"absorption-candidate-flag"),1);
});

test("weak replenishment plus directional continuation is an exhaustion candidate",()=>{
 const weak=[
  {timestampMs:FROM,midpoint:100,levels:levels()},
  {timestampMs:SHOCK,midpoint:100,levels:levels(0,200,1_000,1_000)},
  {timestampMs:RECOVERY,midpoint:99.98,levels:levels(0,200,1_000,1_000)},
  {timestampMs:TO,midpoint:99.95,levels:levels(0,200,1_000,1_000)},
 ];
 const state=calculateDizyQuantResilience(input({frames:weak}));
 assert.equal(state.valid,true);
 assert.equal(state.resilienceRecoveryMs,null);
 assert.equal(state.replenishmentVsShockLossPct,0);
 assert.equal(state.continuationFlag,1);
 assert.equal(state.exhaustionCandidateFlag,1);
 assert.equal(state.absorptionCandidateFlag,0);
 assert.equal(state.candidateLabel,"exhaustion");
});

test("two-sided depth shock keeps directional outcomes unavailable",()=>{
 const both=[
  {timestampMs:FROM,midpoint:100,levels:levels()},
  {timestampMs:SHOCK,midpoint:100,levels:levels(100,100,100,100)},
  {timestampMs:RECOVERY,midpoint:100,levels:levels(900,900,900,900)},
  {timestampMs:TO,midpoint:100,levels:levels()},
 ];
 const state=calculateDizyQuantResilience(input({frames:both}));
 assert.equal(state.valid,true);
 assert.equal(state.bidDepthShock,true);
 assert.equal(state.askDepthShock,true);
 assert.equal(state.continuationFlag,null);
 assert.equal(state.reversalFlag,null);
 assert.equal(state.absorptionCandidateFlag,null);
 assert.equal(state.exhaustionCandidateFlag,null);
 assert.ok(state.limitations.some(value=>/directionally unique/.test(value)));
});

test("unproven continuity retains values but classifies the snapshot as gapped",()=>{
 const snapshot=buildDizyQuantResilienceSnapshot({...input({sequenceContinuous:null}),symbol:"BTC_USDT",evaluatedAtMs:TO+500,maxAgeMs:2_000});
 assert.equal(snapshot.availability,"gapped");
 assert.equal(metric(snapshot,"resilience-shocked-component-count"),2);
 assert.ok(snapshot.limitations.some(value=>/continuity/.test(value)));
});

test("calculator does not mutate source liquidity frames",()=>{
 const source=input(),before=structuredClone(source);
 calculateDizyQuantResilience(source);
 assert.deepEqual(source,before);
});
