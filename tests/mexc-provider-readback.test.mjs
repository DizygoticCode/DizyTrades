import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MexcProviderReadbackError,
  createMexcProviderReadTransport,
  readAuthoritativeMexcAccountRisk,
  translateMexcReadback,
} from "../app/lib/mexc-provider-readback.ts";

const credentials = { apiKey: "readonly-key", apiSecret: "readonly-secret-123" };
const environment = {
  LIVE_TRADING_ENABLED: "false",
  OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "true",
  OWNER_MEXC_READONLY_API_KEY: credentials.apiKey,
  OWNER_MEXC_READONLY_API_SECRET: credentials.apiSecret,
  OWNER_MEXC_READONLY_PERMISSION_ATTESTATION: "account-read+trade-read;no-write/v1",
};
const success = (data, headers) => new Response(JSON.stringify({ success: true, code: 0, data }), { status: 200, headers });

test("provider transport exposes only explicit reads and always performs allowlisted GETs", async () => {
  const calls = [];
  const transport = createMexcProviderReadTransport(credentials, { now: () => 1_700_000_000_000, fetch: async (url, init) => { calls.push({url:String(url),init}); return success([]); } });
  assert.deepEqual(Object.keys(transport).sort(), ["readAssets", "readOpenPositions", "readRiskLimits"]);
  assert.equal("request" in transport, false);
  await transport.readAssets(); await transport.readOpenPositions(); await transport.readRiskLimits();
  assert.deepEqual(calls.map((call) => [call.init.method, new URL(call.url).pathname]), [
    ["GET", "/api/v1/private/account/assets"], ["GET", "/api/v1/private/position/open_positions"], ["GET", "/api/v1/private/account/risk_limit"],
  ]);
  for (const call of calls) {
    assert.equal(call.init.body, undefined);
    assert.equal(call.init.headers.ApiKey, credentials.apiKey);
    assert.match(call.init.headers.Signature, /^[a-f0-9]{64}$/);
  }
});

test("production readback source has no mutation path, method, generic request export, or route dependency", async () => {
  const source = await readFile(new URL("../app/lib/mexc-provider-readback.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /private\/order|order\/submit|batch_submit|change_leverage|change_margin|cancel_all|withdraw|transfer/i);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(source, /export\s+(?:async\s+)?function\s+(?:request|post|submit|cancel|amend)/i);
  assert.doesNotMatch(source, /execution\/boundary|caller-assertion|control-store|risk-store|adapter/);
});

test("valid evidence preserves trusted identity, normalizes positions, and never invents day-start equity", async () => {
  let calls = 0;
  const readback = await readAuthoritativeMexcAccountRisk({userId:"trusted-user",accountId:"trusted-account",environment}, {
    now: () => 1_700_000_000_000,
    fetch: async (url) => {
      calls++;
      if (String(url).endsWith("/assets")) return success([{currency:"USDT",equity:"1250.5",availableBalance:"900"}], {"x-request-id":"safe-123"});
      return success([{symbol:"BTC_USDT",positionType:1,holdVol:"2",openType:2,leverage:"3",openAvgPrice:"30000",positionId:7,updateTime:1699999999000,userId:"evil"}]);
    },
  });
  assert.equal(calls, 2);
  assert.equal(readback.userId, "trusted-user"); assert.equal(readback.accountId, "trusted-account");
  assert.equal(readback.equity, 1250.5); assert.equal(readback.availableMargin, 900);
  assert.deepEqual(readback.positions[0], {symbol:"BTC_USDT",side:"long",contractVolume:2,openType:"cross",leverage:3,averageOpenPrice:30000,providerPositionId:"7",providerUpdatedAt:"2023-11-14T22:13:19.000Z"});
  assert.equal("dayStartEquity" in readback, false);
  const translated = translateMexcReadback(readback, [{symbol:"BTC_USDT",contractSize:0.0001}]);
  assert.deepEqual(translated.accountState.positions, [{symbol:"BTC_USDT",side:"long",quantity:0.0002}]);
  assert.equal(translated.riskSnapshot, null);
  assert.equal(translated.riskSnapshotUnavailableReason, "authoritative-day-start-equity-unavailable");
});

test("authoritative successful empty position response remains explicitly empty", async () => {
  const readback = await readAuthoritativeMexcAccountRisk({userId:"u",accountId:"a",environment}, { now:()=>1_700_000_000_000, fetch:async (url)=>String(url).endsWith("/assets")?success([{currency:"USDT",equity:1,availableBalance:0}]):success([]) });
  assert.deepEqual(readback.positions, []);
});

test("credentials and exact no-write attestation fail closed before network I/O", async () => {
  for (const env of [{}, {...environment, OWNER_MEXC_READONLY_API_SECRET:""}, {...environment, OWNER_MEXC_READONLY_PERMISSION_ATTESTATION:"trade-write"}]) {
    let calls = 0;
    await assert.rejects(() => readAuthoritativeMexcAccountRisk({userId:"u",accountId:"a",environment:env}, {fetch:async()=>{calls++;return success([])}}), MexcProviderReadbackError);
    assert.equal(calls, 0);
  }
});

test("sealed or integrity-invalid owner control blocks before credentials and network I/O", async () => {
  for (const contents of ["not-json", JSON.stringify({schemaVersion:"mexc-owner-connection-control/1.0.0",state:"sealed",generation:1,updatedAtMs:1,reason:"owner-emergency-shutdown",digest:"0".repeat(64)})]) {
    const rootDir = await mkdtemp(join(tmpdir(), "mexc-readback-control-"));
    try {
      await writeFile(join(rootDir, "mexc-owner-connection-control.json"), contents);
      let calls = 0;
      await assert.rejects(() => readAuthoritativeMexcAccountRisk({userId:"u",accountId:"a",environment:{...environment, OWNER_MEXC_READONLY_API_SECRET:""}}, {controlRootDir:rootDir,fetch:async()=>{calls++;return success([])}}), (error)=>error.code === "PROVIDER_DISABLED_OR_UNCONFIGURED");
      assert.equal(calls, 0);
    } finally { await rm(rootDir, {recursive:true,force:true}); }
  }
});

test("combined evidence is stamped with the oldest receipt time", async () => {
  const times = [1_000, 1_001, 2_000, 8_000, 8_001];
  const readback = await readAuthoritativeMexcAccountRisk({userId:"u",accountId:"a",environment}, {
    now:()=>times.shift(),
    fetch:async(url)=>String(url).endsWith("/assets")
      ? new Promise(resolve=>setTimeout(()=>resolve(success([{currency:"USDT",equity:10,availableBalance:5}])), 5))
      : success([]),
  });
  assert.equal(readback.observedAt, new Date(2_000).toISOString());
});

test("missing, duplicate, non-finite, negative, and impossible USDT evidence rejects", async () => {
  const bad = [[], [{currency:"USDT",equity:1,availableBalance:0},{currency:"USDT",equity:1,availableBalance:0}], [{currency:"USDT",equity:"NaN",availableBalance:0}], [{currency:"USDT",equity:-1,availableBalance:0}], [{currency:"USDT",equity:1,availableBalance:3}]];
  for (const assets of bad) await assert.rejects(() => readAuthoritativeMexcAccountRisk({userId:"u",accountId:"a",environment}, {now:()=>1_700_000_000_000,fetch:async(url)=>String(url).endsWith("/assets")?success(assets):success([])}), (error)=>error.code === "ASSET_DATA_INVALID");
});

test("malformed, unsupported, ambiguous, and oversized position evidence rejects", async () => {
  const oversized = Array.from({length:201}, (_,i)=>({symbol:`X${i}_USDT`,positionType:1,holdVol:1}));
  const bad = [[{symbol:"btc_usdt",positionType:1,holdVol:1}], [{symbol:"BTC_USDT",positionType:3,holdVol:1}], [{symbol:"BTC_USDT",positionType:1,holdVol:-1}], [{symbol:"BTC_USDT",positionType:1,holdVol:1},{symbol:"BTC_USDT",positionType:1,holdVol:2}], oversized];
  for (const positions of bad) await assert.rejects(() => readAuthoritativeMexcAccountRisk({userId:"u",accountId:"a",environment}, {now:()=>1_700_000_000_000,fetch:async(url)=>String(url).endsWith("/assets")?success([{currency:"USDT",equity:10,availableBalance:5}]):success(positions)}), MexcProviderReadbackError);
});

test("provider failures, malformed JSON, rate limiting, and oversized bodies never become empty success", async () => {
  const responses = [new Response("not-json"), new Response(JSON.stringify({success:false,code:510,data:[]})), new Response(JSON.stringify({success:true,code:0,data:[]})+"x".repeat(1_000_001))];
  for (const response of responses) await assert.rejects(() => readAuthoritativeMexcAccountRisk({userId:"u",accountId:"a",environment}, {now:()=>1_700_000_000_000,fetch:async()=>response}), MexcProviderReadbackError);
});

test("response limits reject Content-Length early and cancel an oversized stream at the cap", async () => {
  let pulls = 0;
  const oversizedStream = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(600_000)); },
    cancel() {},
  });
  const transport = createMexcProviderReadTransport(credentials, {now:()=>1,fetch:async()=>new Response(oversizedStream)});
  await assert.rejects(() => transport.readAssets(), (error)=>error.code === "RESPONSE_MALFORMED_OR_OVERSIZED");
  assert.ok(pulls >= 2 && pulls <= 3);

  let declaredPulls = 0;
  const declared = createMexcProviderReadTransport(credentials, {now:()=>1,fetch:async()=>new Response(new ReadableStream({pull(){declaredPulls++}}), {headers:{"content-length":"1000001"}})});
  await assert.rejects(() => declared.readAssets(), (error)=>error.code === "RESPONSE_MALFORMED_OR_OVERSIZED");
  assert.ok(declaredPulls <= 1);
});

test("translation fails closed without exact positive contract metadata", () => {
  const readback = {version:"mexc-provider-readback/1.0.0",provider:"mexc",userId:"u",accountId:"a",observedAt:new Date(0).toISOString(),settlementCurrency:"USDT",equity:1,availableMargin:1,positions:[{symbol:"BTC_USDT",side:"long",contractVolume:10}]};
  assert.throws(() => translateMexcReadback(readback, []), MexcProviderReadbackError);
  assert.throws(() => translateMexcReadback(readback, [{symbol:"BTC_USDT",contractSize:0}]), MexcProviderReadbackError);
});
