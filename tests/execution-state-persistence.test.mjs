import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createTestExecutionBoundary } from "../app/lib/execution/internal/testing.ts";

const observedAt = "2026-08-12T12:00:45.000Z";
const contract = Object.freeze({ symbol:"BTC_USDT",displayName:"BTC USDT",contractSize:.0001,minLeverage:1,maxLeverage:100,priceUnit:.1,volUnit:1,minVol:1,maxVol:100000,makerFeeRate:0,takerFeeRate:.0002,maintenanceMarginRate:.004,initialMarginRate:.01,positionOpenType:3,riskLimitType:"BY_VOLUME" });
const prerequisites = Object.freeze({ contracts:new Map([[contract.symbol,contract]]),referencePrices:new Map([[contract.symbol,{price:65000,observedAt}]]),accountState:{userId:"user-1",accountId:"account-1",observedAt,positions:[]} });
const valid = Object.freeze({ intentId:"intent-durable-1",idempotencyKey:"durable-key-0001",userId:"user-1",accountId:"account-1",symbol:"BTC_USDT",marketType:"futures",side:"long",orderType:"limit",quantity:.001,price:65000,leverage:10,reduceOnly:false,source:"manual",createdAt:"2026-08-12T12:00:00.000Z" });
const switches = Object.freeze({ globalDisabled:false,disabledUserIds:new Set(),disabledAccountIds:new Set(),providerStateFresh:true,maintenance:false,emergencyStop:false });

const boundary = (path, extra={}) => createTestExecutionBoundary({
  executionStatePath:path, environment:{LIVE_TRADING_ENABLED:"false"}, now:()=>new Date("2026-08-12T12:01:00Z"), readKillSwitches:()=>switches,
  authenticateInternalCaller:()=>({callerId:"server",userId:"user-1",accountId:"account-1"}), ...extra,
});
const request = (intent=valid) => ({callerAssertion:{callerId:"server",assertionId:"assertion"},userId:intent.userId,accountId:intent.accountId,intent,prerequisites:{...prerequisites,accountState:{...prerequisites.accountState,userId:intent.userId,accountId:intent.accountId}}});

test("durable result survives complete boundary reconstruction and remains synthetic", async () => {
  const root=await mkdtemp(join(tmpdir(),"dizy-execution-state-")),path=join(root,"state.sqlite");
  try {
    const first=boundary(path,{syntheticProviderScenario:"would-accept"}).preview(request());
    assert.equal(first.result.state,"prepared"); assert.equal(first.result.executed,false); assert.equal(first.result.providerResult.provenance,"deterministic-synthetic-fixture");
    const duplicate=boundary(path,{syntheticProviderScenario:"would-reject"}).preview(request());
    assert.equal(duplicate.result.reason,"DUPLICATE_INTENT"); assert.equal(duplicate.result.duplicate,true); assert.equal(duplicate.result.executed,false);
    assert.equal(duplicate.auditEvents.some(event=>event.kind==="provider-evaluated"),false);
    assert.equal((await stat(path)).mode & 0o777,0o600);
    const bytes=await readFile(path); assert.doesNotMatch(bytes.toString("utf8"),/api.?key|secret|password|totp|authorization|session.?token/i);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("provider failures, identity scope, and one authoritative record remain durable", async () => {
  const root=await mkdtemp(join(tmpdir(),"dizy-execution-fault-")),path=join(root,"state.sqlite");
  try {
    for (const [suffix,fault] of [["exception","exception"],["malformed","malformed-result"]]) {
      const intent={...valid,intentId:`intent-${suffix}`,idempotencyKey:`durable-${suffix}-key`};
      const first=boundary(path,{syntheticProviderScenario:"would-accept",syntheticProviderFault:fault}).preview(request(intent));
      assert.equal(first.result.executed,false);
      assert.equal(boundary(path,{syntheticProviderScenario:"would-accept"}).preview(request(intent)).result.reason,"DUPLICATE_INTENT");
    }
    const reused={...valid,intentId:"intent-account-2",accountId:"account-2"};
    assert.notEqual(boundary(path).preview(request(reused)).result.reason,"DUPLICATE_INTENT");
    const database=new DatabaseSync(path,{readOnly:true});
    assert.equal(database.prepare("SELECT count(*) AS count FROM execution_results WHERE user_id=? AND account_id=? AND idempotency_key=?").get(valid.userId,valid.accountId,"durable-exception-key").count,1);
    database.close();
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("malformed records and database open failures fail closed", async () => {
  const root=await mkdtemp(join(tmpdir(),"dizy-execution-malformed-")),path=join(root,"state.sqlite");
  try {
    boundary(path).preview(request());
    const database=new DatabaseSync(path);
    database.prepare("UPDATE execution_results SET result_json=? WHERE user_id=?").run('{"executed":true}',valid.userId); database.close();
    const malformed=boundary(path).preview(request());
    assert.equal(malformed.result.reason,"EXECUTION_STATE_UNAVAILABLE"); assert.equal(malformed.result.executed,false); assert.equal(malformed.result.preview,null);
    const unavailable=boundary(join("/dev/null","execution.sqlite")).preview(request({...valid,idempotencyKey:"another-durable-key"}));
    assert.equal(unavailable.result.reason,"EXECUTION_STATE_UNAVAILABLE"); assert.equal(unavailable.result.executed,false);
  } finally { await rm(root,{recursive:true,force:true}); }
});
