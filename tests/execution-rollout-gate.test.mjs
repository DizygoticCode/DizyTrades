import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { EXECUTION_ROLLOUT_POLICY_VERSION, ExecutionRolloutStoreError, SqliteExecutionRolloutStore, validateRestrictedRolloutPolicy } from "../app/lib/execution/internal/rollout-store.ts";
import { restrictedRolloutPreSubmissionPolicy } from "../app/lib/execution/internal/boundary-service.ts";
import { policyWithinRisk } from "../app/lib/execution/internal/rollout-authority.ts";

const id=Object.freeze({userId:"rob",accountId:"owner-mexc-1"}), other=Object.freeze({userId:"rob",accountId:"other"});
const digest="a".repeat(64), at="2026-08-14T01:00:00.000Z";
const policy=Object.freeze({policyVersion:EXECUTION_ROLLOUT_POLICY_VERSION,allowedSymbols:Object.freeze(["BTC_USDT"]),maximumOrderNotional:50,maximumLeverage:1,maximumDailyLoss:25,reduceOnly:true});
const directory=()=>mkdtempSync(join(tmpdir(),"execution-rollout-"));

test("rollout defaults deny and exact accounts remain isolated",()=>{const store=new SqliteExecutionRolloutStore(":memory:");assert.deepEqual(store.read(id).status,"unknown");store.approve(id,digest,1,policy,at,0);assert.equal(store.read(other).status,"unknown")});
test("approval and arming are separate CAS transitions",()=>{const store=new SqliteExecutionRolloutStore(":memory:");const approved=store.approve(id,digest,3,policy,at,0);assert.equal(approved.status,"approved");assert.equal(approved.armedAt,null);assert.throws(()=>store.arm(id,at,0),e=>e.code==="EXECUTION_ROLLOUT_CONFLICT");const armed=store.arm(id,at,approved.revision);assert.equal(armed.status,"armed");assert.deepEqual(store.events(id).map(e=>e.kind),["approved","armed"])});
test("disarm and revoke are sticky terminal states",()=>{for(const terminal of ["disarm","revoke"]){const store=new SqliteExecutionRolloutStore(":memory:");const a=store.approve(id,digest,1,policy,at,0), armed=store.arm(id,at,a.revision), stopped=store[terminal](id,at,armed.revision);assert.equal(stopped.status,terminal==="disarm"?"disarmed":"revoked");assert.throws(()=>store.arm(id,at,stopped.revision),e=>e.code==="EXECUTION_ROLLOUT_CONFLICT");assert.equal(store[terminal](id,at,stopped.revision).revision,stopped.revision)}});
test("conservative rollout policy rejects widened limits and unknown fields",()=>{for(const candidate of [{...policy,maximumOrderNotional:101},{...policy,maximumLeverage:3},{...policy,maximumDailyLoss:51},{...policy,reduceOnly:false},{...policy,secret:"no"},{...policy,allowedSymbols:["BTC_USDT","ETH_USDT","SOL_USDT"]}])assert.throws(()=>validateRestrictedRolloutPolicy(candidate),e=>e.code==="EXECUTION_ROLLOUT_INVALID")});
test("pre-submission rollout policy denies notional and daily loss narrower than broader risk",()=>{
  const decide=restrictedRolloutPreSubmissionPolicy(policy);
  const intent=Object.freeze({userId:"rob",accountId:"owner-mexc-1",symbol:"BTC_USDT",leverage:1,reduceOnly:true});
  const prerequisites=Object.freeze({riskSnapshot:Object.freeze({userId:"rob",accountId:"owner-mexc-1",observedAt:at,equity:10_000,dayStartEquity:10_000,availableMargin:9_000})});
  assert.equal(decide(intent,prerequisites,Object.freeze({estimatedNotional:50})),null);
  assert.equal(decide(intent,prerequisites,Object.freeze({estimatedNotional:50.01})),"EXECUTION_ROLLOUT_POLICY_DENIED");
  assert.equal(decide(intent,{...prerequisites,riskSnapshot:{...prerequisites.riskSnapshot,equity:9_974}},Object.freeze({estimatedNotional:25})),"EXECUTION_ROLLOUT_POLICY_DENIED");
  assert.equal(decide(intent,{...prerequisites,riskSnapshot:null},Object.freeze({estimatedNotional:25})),"EXECUTION_ROLLOUT_POLICY_DENIED");
});
test("fraction-only risk policy cannot prove a USDT rollout daily-loss ceiling",()=>{
  const risk={allowedSymbols:["BTC_USDT"],maximumLeverage:20,maximumOrderNotional:10_000,maximumDailyDrawdownFraction:0.1};
  assert.equal(policyWithinRisk(policy,risk),false);
  assert.equal(policyWithinRisk(policy,{...risk,maximumDailyDrawdownUsdt:1_000}),true);
  assert.equal(policyWithinRisk(policy,{...risk,maximumDailyDrawdownUsdt:20}),false);
});
test("state and secret-free audit survive restart",()=>{const dir=directory(),path=join(dir,"rollout.sqlite");try{let store=new SqliteExecutionRolloutStore(path);store.approve(id,digest,2,policy,at,0);store.close();store=new SqliteExecutionRolloutStore(path);assert.equal(store.read(id).status,"approved");const serialized=JSON.stringify({state:store.read(id),events:store.events(id)});assert.doesNotMatch(serialized,/api.?key|secret|credential|token|password|totp/i);store.close()}finally{rmSync(dir,{recursive:true,force:true})}});
test("backing replacement and semantic corruption fail closed",()=>{const dir=directory(),path=join(dir,"rollout.sqlite");try{const store=new SqliteExecutionRolloutStore(path);store.read(id);const replacement=join(dir,"replacement");writeFileSync(replacement,"invalid");renameSync(replacement,path);assert.throws(()=>store.read(id),e=>e instanceof ExecutionRolloutStoreError&&e.code==="EXECUTION_ROLLOUT_UNAVAILABLE")}finally{rmSync(dir,{recursive:true,force:true})}const dir2=directory(),path2=join(dir2,"rollout.sqlite");try{let store=new SqliteExecutionRolloutStore(path2);store.approve(id,digest,1,policy,at,0);store.close();const db=new DatabaseSync(path2);db.exec("UPDATE rollout_state SET status='armed', armed_at=NULL");db.close();store=new SqliteExecutionRolloutStore(path2);assert.throws(()=>store.read(id),e=>e.code==="EXECUTION_ROLLOUT_INVALID")}finally{rmSync(dir2,{recursive:true,force:true})}});
