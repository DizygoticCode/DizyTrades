import assert from"node:assert/strict";
import test from"node:test";
import{canonicalDizyQuantReplayLabJson,runDizyQuantReplayLab,DIZYQUANT_LAB_FORMULA_VERSION,DIZYQUANT_LAB_SCHEMA_VERSION}from"../app/lib/dizyquant/lab.ts";

const observations=(count=80)=>Array.from({length:count},(_,index)=>{
 const predictor=index%10-4.5;
 const outcome=predictor+(index%3-1)*.2;
 return{observationId:`obs-${String(index).padStart(3,"0")}`,timestampMs:1_000_000+index*1_000,symbol:"BTC_USDT",regime:index%2?"trend":"range",metricId:"spread-bps",predictor,outcome};
});

test("Replay lab uses a training prefix, held-out evaluation, null rotations and walk-forward checks",()=>{
 const result=runDizyQuantReplayLab(observations(),{metricId:"spread-bps",nullRotations:16,walkForwardFolds:4});
 assert.equal(result.valid,true);
 assert.equal(result.status,"ready");
 assert.equal(result.schemaVersion,DIZYQUANT_LAB_SCHEMA_VERSION);
 assert.equal(result.formulaVersion,DIZYQUANT_LAB_FORMULA_VERSION);
 assert.equal(result.observationCount,80);
 assert.equal(result.trainingCount,56);
 assert.equal(result.holdoutCount,24);
 assert.ok(result.model);
 assert.ok(result.holdout);
 assert.ok(result.nullBaseline);
 assert.ok(result.walkForward);
 assert.ok(result.holdout.modelAccuracyPct>result.holdout.baselineAccuracyPct);
 assert.ok(result.walkForward.completedFolds>0);
 assert.equal(result.promotionEligible,false);
 assert.ok(["retain-experimental","reject-current-formula"].includes(result.decision));
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.model));
 assert.ok(Object.isFrozen(result.limitations));
});

test("held-out outcomes cannot alter the training threshold or direction",()=>{
 const source=observations(),first=runDizyQuantReplayLab(source,{metricId:"spread-bps"});
 const changed=source.map((value,index)=>index<56?value:{...value,outcome:-value.outcome});
 const second=runDizyQuantReplayLab(changed,{metricId:"spread-bps"});
 assert.deepEqual(first.model,second.model);
 assert.notDeepEqual(first.holdout,second.holdout);
});

test("lab output and canonical serialisation are deterministic",()=>{
 const first=runDizyQuantReplayLab(observations(),{metricId:"spread-bps",nullRotations:12,walkForwardFolds:3});
 const second=runDizyQuantReplayLab(structuredClone(observations()),{metricId:"spread-bps",nullRotations:12,walkForwardFolds:3});
 assert.deepEqual(first,second);
 assert.equal(canonicalDizyQuantReplayLabJson(first),canonicalDizyQuantReplayLabJson(second));
});

test("small valid samples report insufficient evidence instead of inventing statistics",()=>{
 const result=runDizyQuantReplayLab(observations(20),{metricId:"spread-bps"});
 assert.equal(result.valid,true);
 assert.equal(result.status,"insufficient-data");
 assert.equal(result.decision,"insufficient-evidence");
 assert.equal(result.model,null);
 assert.equal(result.promotionEligible,false);
});

test("malformed, duplicate, unordered and mixed-metric observations fail invalid",()=>{
 const base=observations();
 const variants=[
  null,
  [base[0],{...base[1],observationId:base[0].observationId}],
  [base[1],base[0],...base.slice(2)],
  [{...base[0],metricId:"absorption-candidate-flag"},...base.slice(1)],
  [{...base[0],predictor:Number.NaN},...base.slice(1)],
 ];
 for(const value of variants){
  const result=runDizyQuantReplayLab(value,{metricId:"spread-bps"});
  assert.equal(result.valid,false);
  assert.equal(result.status,"invalid");
  assert.equal(result.decision,"invalid-input");
 }
});

test("Replay lab does not mutate observations",()=>{
 const source=observations(),before=structuredClone(source);
 runDizyQuantReplayLab(source,{metricId:"spread-bps"});
 assert.deepEqual(source,before);
});
