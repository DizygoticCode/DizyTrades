import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source=readFileSync(new URL("../app/lib/execution/internal/render-egress-proof-authority.ts",import.meta.url),"utf8");
const production=readFileSync(new URL("../app/lib/execution/internal/production-write-composition.ts",import.meta.url),"utf8");

test("Render egress proof is server-only, secret-free and disconnected from production writer composition",()=>{
  assert.match(source,/^import "server-only";/);
  for(const required of ["databaseSession","verifyAccountPassword","verifyFreshTotp","RENDER_SERVICE_ID","RENDER_GIT_COMMIT","RENDER_INSTANCE_ID",
    "render-dedicated-outbound-ip-set/v1","dual-https-egress-observation/v1","MEXC_WRITE_EGRESS_ATTESTATION","payload_json","observationCount"])
    assert.match(source,new RegExp(required.replaceAll("/","\\/")));
  for(const forbidden of ["MEXC_EXECUTION_ACCESS_KEY","MEXC_EXECUTION_SECRET_KEY","MEXC_READONLY_ACCESS_KEY","MEXC_READONLY_SECRET_KEY",
    "ModernMexcReduceOnlyWriter","ProductionMexcWriteComposition","mexc-execution-writer","production-write-composition","credential-custody"])
    assert.equal(source.includes(forbidden),false,`must not contain ${forbidden}`);
  assert.doesNotMatch(source,/\bPOST\b|method:\s*"POST"/);
  assert.doesNotMatch(production,/render-egress-proof-authority/);
});

test("production probe destinations are fixed HTTPS observers",()=>{
  assert.match(source,/"https:\/\/api4\.ipify\.org"/);
  assert.match(source,/"https:\/\/checkip\.amazonaws\.com"/);
  assert.match(source,/redirect:"error"/);
  assert.match(source,/AbortSignal\.timeout\(5_000\)/);
  assert.doesNotMatch(source,/probeUrl|observerUrl|egressUrl/i);
});

test("durable schema persists bounded proof metadata and no owner proof or credential material",()=>{
  const schema=source.slice(source.indexOf("CREATE TABLE render_egress_proof("),source.indexOf("CREATE TABLE render_egress_proof_events("));
  assert.match(schema,/user_id/);assert.match(schema,/account_id/);assert.match(schema,/write_generation/);assert.match(schema,/payload_json/);
  assert.doesNotMatch(schema,/password|totp|session|secret|access_key|secret_key/i);
});
