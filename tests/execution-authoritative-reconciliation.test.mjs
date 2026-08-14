import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { reconcileAuthoritativeMexcReadback } from "../app/lib/execution/internal/authoritative-reconciliation.ts";
import { ExecutionReconciliationStoreError, SqliteExecutionReconciliationStore } from "../app/lib/execution/internal/reconciliation-store.ts";
import { createProductionReconciliationOrchestrator } from "../app/lib/execution/internal/production-reconciliation.ts";

const id={userId:"user-1",accountId:"account-1"};
const at="2026-08-13T12:00:00.000Z";
const observation=(positions=[],overrides={})=>({version:"mexc-provider-readback/1.0.0",provider:"mexc",...id,observedAt:at,settlementCurrency:"USDT",equity:100,availableMargin:100,positions,...overrides});
const position=(overrides={})=>({symbol:"BTC_USDT",side:"long",contractVolume:10,...overrides});
const directory=()=>mkdtempSync(join(tmpdir(),"execution-reconciliation-"));

test("empty and exact authoritative state reconcile without execution",()=>{
  const store=new SqliteExecutionReconciliationStore(":memory:");
  assert.deepEqual(reconcileAuthoritativeMexcReadback(store,id,observation(),new Date(at)),{status:"clean",reason:"CLEAN",revision:1,executed:false});
  const exact=new SqliteExecutionReconciliationStore(":memory:");
  exact.setExpected(id,[position()],0);
  assert.equal(reconcileAuthoritativeMexcReadback(exact,id,observation([position()]),new Date(at)).status,"clean");
});

test("divergence matrix quarantines and never adopts provider state",()=>{
  const cases=[
    [[],[position()],"UNEXPECTED_PROVIDER_POSITION"],
    [[position()],[],"EXPECTED_POSITION_MISSING"],
    [[position()],[position({side:"short"})],"POSITION_SIDE_MISMATCH"],
    [[position()],[position({contractVolume:11})],"POSITION_QUANTITY_MISMATCH"],
    [[position()],[position(),position({contractVolume:12})],"POSITION_AMBIGUOUS"],
  ];
  for(const [expected,observed,reason] of cases){const store=new SqliteExecutionReconciliationStore(":memory:");if(expected.length)store.setExpected(id,expected,0);const result=reconcileAuthoritativeMexcReadback(store,id,observation(observed),new Date(at));assert.equal(result.reason,reason);assert.equal(result.status,"quarantined");assert.deepEqual(store.read(id).expected,expected);}
});

test("stale, malformed, and exact identity mismatch fail closed",()=>{
  for(const [value,reason] of [[observation([], {observedAt:"2020-01-01T00:00:00Z"}),"OBSERVATION_STALE"],[{bad:true},"IDENTITY_MISMATCH"],[observation([],{accountId:"other"}),"IDENTITY_MISMATCH"]]){const store=new SqliteExecutionReconciliationStore(":memory:");assert.equal(reconcileAuthoritativeMexcReadback(store,id,value,new Date(at)).reason,reason);}
});

test("exact account isolation and quarantine survive restart",()=>{const dir=directory(),path=join(dir,"r.sqlite");try{let store=new SqliteExecutionReconciliationStore(path);reconcileAuthoritativeMexcReadback(store,id,observation([position()]),new Date(at));assert.equal(store.read({userId:"user-1",accountId:"account-2"}).status,"unknown");store.close();store=new SqliteExecutionReconciliationStore(path);assert.equal(store.read(id).status,"quarantined");store.close();}finally{rmSync(dir,{recursive:true,force:true});}});

test("open backing-file deletion and atomic replacement fail closed",()=>{for(const attack of ["delete","replace"]){const dir=directory(),path=join(dir,"r.sqlite");try{const store=new SqliteExecutionReconciliationStore(path);store.read(id);if(attack==="delete")unlinkSync(path);else{const replacement=join(dir,"replacement");writeFileSync(replacement,"invalid");renameSync(replacement,path);}assert.throws(()=>store.read(id),e=>e instanceof ExecutionReconciliationStoreError&&e.code==="EXECUTION_RECONCILIATION_UNAVAILABLE");}finally{rmSync(dir,{recursive:true,force:true});}}});

test("unsupported or corrupt reconciliation schema fails closed",()=>{const dir=directory(),path=join(dir,"r.sqlite");try{let store=new SqliteExecutionReconciliationStore(path);store.read(id);store.close();const db=new DatabaseSync(path);db.exec("PRAGMA user_version=99");db.close();store=new SqliteExecutionReconciliationStore(path);assert.throws(()=>store.read(id),e=>e.code==="EXECUTION_RECONCILIATION_INVALID");}finally{rmSync(dir,{recursive:true,force:true});}});

test("semantically corrupt schema-v1 reconciliation rows fail closed",()=>{
  const corruptions=[
    ["status='clean', reason='OBSERVATION_INVALID'","inconsistent status and reason"],
    ["reason='NOT_A_REASON'","unknown reason"],
    ["updated_at='not-a-timestamp'","invalid timestamp"],
    [`expected_json='[{"symbol":"BTC_USDT","side":"long","contractVolume":1},{"symbol":"BTC_USDT","side":"short","contractVolume":2}]'`,"duplicate expected symbol"],
  ];
  for(const [mutation,label] of corruptions){
    const dir=directory(),path=join(dir,"r.sqlite");
    try{
      let store=new SqliteExecutionReconciliationStore(path);
      store.setExpected(id,[position()],0); store.close();
      const db=new DatabaseSync(path);
      db.exec(`UPDATE reconciliation_state SET ${mutation}`); db.close();
      store=new SqliteExecutionReconciliationStore(path);
      assert.throws(()=>store.read(id),error=>error.code==="EXECUTION_RECONCILIATION_INVALID",label);
      store.close();
    }finally{rmSync(dir,{recursive:true,force:true});}
  }
});

test("quarantine is sticky without a public clearing primitive",()=>{const store=new SqliteExecutionReconciliationStore(":memory:");reconcileAuthoritativeMexcReadback(store,id,observation([position()]),new Date(at));const result=reconcileAuthoritativeMexcReadback(store,id,observation(),new Date(at));assert.equal(result.status,"quarantined");assert.equal(result.reason,"UNEXPECTED_PROVIDER_POSITION");});

test("expected-state mutation cannot clear quarantine",()=>{const store=new SqliteExecutionReconciliationStore(":memory:");reconcileAuthoritativeMexcReadback(store,id,observation([position()]),new Date(at));const quarantined=store.read(id);const changed=store.setExpected(id,[position()],quarantined.revision);assert.equal(changed.status,"quarantined");assert.equal(changed.reason,"UNEXPECTED_PROVIDER_POSITION");assert.deepEqual(changed.expected,[position()]);assert.equal(reconcileAuthoritativeMexcReadback(store,id,observation([position()]),new Date(at)).status,"quarantined");});

test("production orchestration uses trusted empty expectation and quarantines Radar divergence",async()=>{const store=new SqliteExecutionReconciliationStore(":memory:");let calls=0;const orchestrate=createProductionReconciliationOrchestrator(store,async(identity)=>{calls++;assert.deepEqual(identity,id);return observation([position()]);},()=>new Date(at));await orchestrate(id);assert.equal(calls,1);const state=store.read(id);assert.equal(state.status,"quarantined");assert.equal(state.reason,"UNEXPECTED_PROVIDER_POSITION");assert.deepEqual(state.expected,[]);});
