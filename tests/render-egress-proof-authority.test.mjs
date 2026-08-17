import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  beginMfaEnrollment, closeAuthDatabaseForTests, confirmMfaEnrollment, createAccount, createDatabaseSession,
  createEmailVerificationTokenForUser, getAuthDatabase, revokeDatabaseSession, verifyEmailToken,
} from "../app/lib/auth-db.ts";
import {
  ExecutionRenderEgressProofError, RENDER_DEDICATED_EGRESS_ATTESTATION,
  SqliteRenderEgressProofStore, attestMexcEgressAllowlisted, canonicalDedicatedIpv4s, declareRenderDedicatedEgress,
  isPublicIpv4, observeRenderDedicatedEgress, probeProductionRenderEgressIpv4, renderDedicatedIpSetDigestSha256,
  renderRuntimeEvidenceFromEnvironment, revokeRenderEgressProof,
} from "../app/lib/execution/internal/render-egress-proof-authority.ts";
import { MEXC_WRITE_EGRESS_ATTESTATION } from "../app/lib/execution/internal/write-credential-authority-store.ts";

const ips=Object.freeze(["1.1.1.1"]), canonical=Object.freeze(["1.1.1.1"]);
const serviceId="srv-aaaaaaaaaaaaaaaaaaaa", at=i=>new Date(1_780_100_000_000+i*60_000).toISOString();
const id=g=>({userId:"rob",accountId:"account-1",writeCredentialGeneration:g});
const conflict=e=>e instanceof ExecutionRenderEgressProofError&&e.code==="EXECUTION_RENDER_EGRESS_PROOF_CONFLICT";
const invalid=e=>e instanceof ExecutionRenderEgressProofError&&e.code==="EXECUTION_RENDER_EGRESS_PROOF_INVALID";

test("dedicated IPv4 proof is exactly one canonical public address (/32)",()=>{
  assert.deepEqual(canonicalDedicatedIpv4s(ips),canonical);
  assert.equal(renderDedicatedIpSetDigestSha256(ips),"f1412386aa8db2579aff2636cb9511cacc5fd9880ecab60c048508fbe26ee4d9");
  assert.equal(renderDedicatedIpSetDigestSha256([]),null);
  assert.equal(renderDedicatedIpSetDigestSha256(["1.1.1.1","8.8.8.8"]),null);
  assert.equal(renderDedicatedIpSetDigestSha256(["10.0.0.1"]),null);
  assert.equal(isPublicIpv4("192.168.1.1"),false); assert.equal(isPublicIpv4("203.0.113.8"),false); assert.equal(isPublicIpv4("1.1.1.1"),true);
});

test("egress proof is exact-generation, CAS revisioned, twice-observed, allowlisted and sticky-revoked",()=>{
  const s=new SqliteRenderEgressProofStore(":memory:");try{
    const identity=id("generation-1"); assert.equal(s.read(identity).status,"unknown");
    let state=s.declare(identity,serviceId,"oregon",ips,at(0),0);
    assert.equal(state.revision,1);assert.deepEqual(state.dedicatedIpv4s,canonical);
    assert.throws(()=>s.declare(identity,serviceId,"oregon",ips,at(1),0),conflict);
    state=s.observe(identity,serviceId,"1.1.1.1","a".repeat(40),"instance-1",at(1),1);assert.equal(state.observationCount,1);
    assert.throws(()=>s.allowlist(identity,state.ipSetDigestSha256,at(2),2),conflict);
    assert.throws(()=>s.observe(identity,serviceId,"1.1.1.1","b".repeat(40),"instance-2",new Date(Date.parse(at(1))+30_000).toISOString(),2),conflict);
    state=s.observe(identity,serviceId,"1.1.1.1","b".repeat(40),"instance-2",at(2),2);assert.equal(state.observationCount,2);
    state=s.allowlist(identity,state.ipSetDigestSha256,new Date(Date.parse(at(2))+30_000).toISOString(),3);
    assert.equal(state.status,"allowlisted");assert.equal(state.mexcAllowlistAttestation,MEXC_WRITE_EGRESS_ATTESTATION);
    state=s.observe(identity,serviceId,"1.1.1.1","c".repeat(40),"instance-3",at(3),4);assert.equal(state.status,"allowlisted");assert.equal(state.observationCount,3);
    state=s.revoke(identity,at(4),5);assert.equal(state.status,"revoked");assert.equal(s.revoke(identity,at(5),6).revision,6);
    assert.throws(()=>s.observe(identity,serviceId,"1.1.1.1","d".repeat(40),"instance-4",at(5),6),conflict);
    assert.deepEqual(s.events(identity).map(e=>e.kind),["declared","observed","observed","allowlisted","observed","revoked"]);
  }finally{s.close();}
});

test("proof rejects undeclared service/IP, stale allowlisting and private addresses",()=>{
  const s=new SqliteRenderEgressProofStore(":memory:");try{
    const identity=id("generation-2");let state=s.declare(identity,serviceId,"oregon",ips,at(0),0);
    assert.throws(()=>s.observe(identity,"srv-bbbbbbbbbbbbbbbbbbbb","1.1.1.1","a".repeat(40),"i1",at(1),state.revision),conflict);
    assert.throws(()=>s.observe(identity,serviceId,"4.2.2.1","a".repeat(40),"i1",at(1),state.revision),conflict);
    state=s.observe(identity,serviceId,"1.1.1.1","a".repeat(40),"i1",at(1),1);
    state=s.observe(identity,serviceId,"1.1.1.1","b".repeat(40),"i2",at(2),2);
    assert.throws(()=>s.allowlist(identity,state.ipSetDigestSha256,new Date(Date.parse(at(2))+10*60_000+1).toISOString(),3),conflict);
    assert.throws(()=>s.declare(id("bad"),serviceId,"oregon",["10.0.0.1"],at(0),0),invalid);
  }finally{s.close();}
});

test("same generation is isolated by exact account identity and survives restart",()=>{
  const root=mkdtempSync(join(tmpdir(),"render-egress-proof-")),path=join(root,"proof.sqlite");try{
    const first=id("generation-1"),other={...first,accountId:"account-2"};let s=new SqliteRenderEgressProofStore(path);
    s.declare(first,serviceId,"oregon",ips,at(0),0);
    s.declare(other,"srv-bbbbbbbbbbbbbbbbbbbb","ohio",["4.2.2.1"],at(0),0);s.close();
    s=new SqliteRenderEgressProofStore(path);assert.equal(s.read(first).renderRegion,"oregon");assert.equal(s.read(other).renderRegion,"ohio");
    renameSync(path,`${path}.detached`);writeFileSync(path,"replacement");
    assert.throws(()=>s.read(first),e=>e instanceof ExecutionRenderEgressProofError&&e.code==="EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");
    assert.throws(()=>s.read(first),e=>e instanceof ExecutionRenderEgressProofError&&e.code==="EXECUTION_RENDER_EGRESS_PROOF_UNAVAILABLE");s.close();
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("production runtime evidence rejects previews and wrong repo/branch",()=>{
  const env={RENDER:"true",IS_PULL_REQUEST:"false",RENDER_SERVICE_TYPE:"web",RENDER_SERVICE_ID:serviceId,RENDER_GIT_COMMIT:"a".repeat(40),
    RENDER_INSTANCE_ID:"instance-1",RENDER_GIT_REPO_SLUG:"DizygoticCode/DizyTrades",RENDER_GIT_BRANCH:"main",NODE_ENV:"production"};
  assert.equal(renderRuntimeEvidenceFromEnvironment(env)?.serviceId,serviceId);
  assert.equal(renderRuntimeEvidenceFromEnvironment({...env,IS_PULL_REQUEST:"true"}),null);
  assert.equal(renderRuntimeEvidenceFromEnvironment({...env,RENDER_GIT_BRANCH:"feature"}),null);
  assert.equal(renderRuntimeEvidenceFromEnvironment({...env,RENDER_GIT_REPO_SLUG:"other/repo"}),null);
});

test("production probe requires two fixed HTTPS observers to agree",async()=>{
  const calls=[];const same=async url=>(calls.push(url),{ok:true,status:200,text:async()=>"1.1.1.1\n"});
  assert.equal(await probeProductionRenderEgressIpv4(same),"1.1.1.1");
  assert.deepEqual(calls,["https://api4.ipify.org","https://checkip.amazonaws.com"]);
  let n=0;const mismatch=async()=>({ok:true,status:200,text:async()=>(++n===1?"1.1.1.1":"8.8.8.8")});
  assert.equal(await probeProductionRenderEgressIpv4(mismatch),null);
});

function decodeBase32(v){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits=0,acc=0;const bytes=[];for(const c of v.replace(/=+$/g,"").toUpperCase()){
  const i=alphabet.indexOf(c);if(i<0)throw new Error("bad base32");acc=(acc<<5)|i;bits+=5;if(bits>=8)bytes.push((acc>>>(bits-=8))&255);}return Buffer.from(bytes);}
function totp(secret,time){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/30_000)));
  const mac=createHmac("sha1",decodeBase32(secret)).update(counter).digest(),o=mac[19]&15;return ((mac.readUInt32BE(o)&0x7fffffff)%1_000_000).toString().padStart(6,"0");}

test("mutations require owner DB session + current password + fresh non-replayable TOTP",async()=>{
  const root=mkdtempSync(join(tmpdir(),"render-egress-owner-")),prior=process.env.DATA_DIR;process.env.DATA_DIR=root;closeAuthDatabaseForTests();
  const store=new SqliteRenderEgressProofStore(join(root,"proof.sqlite"));try{
    const password="correct-horse-battery-staple",user=await createAccount({email:"owner-render-egress@example.test",password});
    verifyEmailToken(createEmailVerificationTokenForUser(user.id).token);getAuthDatabase().prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
    const secret=beginMfaEnrollment(user.id);assert.ok(secret);const base=Math.floor(Date.now()/30_000)*30_000;
    assert.ok(confirmMfaEnrollment(user.id,totp(secret,base),base));const session=createDatabaseSession(user,3600,"password");assert.ok(session);
    const identity={userId:user.id,accountId:"account-1",writeCredentialGeneration:"planned-generation-1"};
    const req=(time,revision,extra={})=>({...identity,expectedRevision:revision,ownerProof:{sessionToken:session,currentPassword:password,totp:totp(secret,time)},...extra});
    const t1=base+30_000;
    assert.equal(await declareRenderDedicatedEgress(store,req(t1,0,{renderServiceId:serviceId,renderRegion:"oregon",dedicatedIpv4s:ips,renderAttestation:RENDER_DEDICATED_EGRESS_ATTESTATION,
      ownerProof:{sessionToken:session,currentPassword:"wrong",totp:totp(secret,t1)}}),new Date(t1)),null);
    const declared=await declareRenderDedicatedEgress(store,req(t1,0,{renderServiceId:serviceId,renderRegion:"oregon",dedicatedIpv4s:ips,renderAttestation:RENDER_DEDICATED_EGRESS_ATTESTATION}),new Date(t1));
    assert.equal(declared?.status,"declared");
    const runtime={serviceId,gitCommit:"a".repeat(40),instanceId:"instance-1",serviceType:"web",repository:"DizygoticCode/DizyTrades",branch:"main"};
    assert.equal(await observeRenderDedicatedEgress(store,req(t1,1),runtime,"1.1.1.1",new Date(t1)),null);
    const t2=t1+60_000,first=await observeRenderDedicatedEgress(store,req(t2,1),runtime,"1.1.1.1",new Date(t2));assert.equal(first?.observationCount,1);
    const t3=t2+60_000,second=await observeRenderDedicatedEgress(store,req(t3,2),{...runtime,gitCommit:"b".repeat(40),instanceId:"instance-2"},"1.1.1.1",new Date(t3));assert.equal(second?.observationCount,2);
    const t4=t3+30_000,allowlisted=await attestMexcEgressAllowlisted(store,req(t4,3,{ipSetDigestSha256:second.ipSetDigestSha256,mexcAllowlistAttestation:MEXC_WRITE_EGRESS_ATTESTATION}),new Date(t4));
    assert.equal(allowlisted?.status,"allowlisted");const t5=t4+30_000;assert.equal((await revokeRenderEgressProof(store,req(t5,4),new Date(t5)))?.status,"revoked");
    revokeDatabaseSession(session);const t6=t5+30_000;assert.equal(await revokeRenderEgressProof(store,req(t6,5),new Date(t6)),null);
  }finally{store.close();closeAuthDatabaseForTests();if(prior===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior;rmSync(root,{recursive:true,force:true});}
});
