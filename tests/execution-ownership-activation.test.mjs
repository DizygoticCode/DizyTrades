import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MEXC_PROVIDER_READBACK_VERSION } from "../app/lib/mexc-provider-readback.ts";
import { ExecutionOwnershipStoreError, SqliteExecutionOwnershipStore, proveExecutionOwnership } from "../app/lib/execution/internal/ownership-store.ts";

const identity = Object.freeze({ callerId:"execution-internal", userId:"rob", accountId:"mexc-main" });
const now = new Date("2026-08-14T12:00:00.000Z");
const observation = (overrides={}) => Object.freeze({
  version:MEXC_PROVIDER_READBACK_VERSION, provider:"mexc", userId:"rob", accountId:"mexc-main",
  observedAt:now.toISOString(), settlementCurrency:"USDT", equity:100, availableMargin:90,
  positions:Object.freeze([]), ...overrides,
});

test("proof and activation are distinct, exact-account, durable CAS transitions", async (t) => {
  const root=mkdtempSync(join(tmpdir(),"execution-ownership-")); t.after(()=>rmSync(root,{recursive:true,force:true}));
  const path=join(root,"ownership.sqlite"); let store=new SqliteExecutionOwnershipStore(path);
  assert.equal(store.read(identity).status,"unknown");
  const proved=await proveExecutionOwnership(store,identity,async()=>observation(),0,now);
  assert.equal(proved.status,"proved"); assert.equal(store.read({...identity,accountId:"other"}).status,"unknown");
  const active=store.activate(identity,proved.revision,now); assert.equal(active.status,"active");
  assert.throws(()=>store.activate(identity,proved.revision,now),ExecutionOwnershipStoreError);
  store.close(); store=new SqliteExecutionOwnershipStore(path); assert.equal(store.read(identity).status,"active");
  assert.equal(statSync(path).mode&0o777,0o600);
  const revoked=store.revoke(identity,active.revision,now); assert.equal(revoked.status,"revoked");
  assert.throws(()=>store.activate(identity,revoked.revision,now),ExecutionOwnershipStoreError);
  store.close();
});

test("proof rejects mismatched and stale Radar observations", async () => {
  const store=new SqliteExecutionOwnershipStore(":memory:");
  await assert.rejects(()=>proveExecutionOwnership(store,identity,async()=>observation({accountId:"other"}),0,now),ExecutionOwnershipStoreError);
  await assert.rejects(()=>proveExecutionOwnership(store,identity,async()=>observation({observedAt:new Date(now.getTime()-15_001).toISOString()}),0,now),ExecutionOwnershipStoreError);
  assert.equal(store.read(identity).status,"unknown"); store.close();
});

test("backing file replacement fails closed", async (t) => {
  const root=mkdtempSync(join(tmpdir(),"execution-ownership-")); t.after(()=>rmSync(root,{recursive:true,force:true}));
  const path=join(root,"ownership.sqlite"), replacement=join(root,"replacement.sqlite");
  const store=new SqliteExecutionOwnershipStore(path); await proveExecutionOwnership(store,identity,async()=>observation(),0,now);
  const other=new SqliteExecutionOwnershipStore(replacement); other.read(identity); other.close();
  renameSync(replacement,path); chmodSync(path,0o600);
  assert.throws(()=>store.read(identity),(error)=>error instanceof ExecutionOwnershipStoreError&&error.code==="EXECUTION_OWNERSHIP_UNAVAILABLE");
});
