import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DepthCollector } from "../app/lib/order-flow/depth-collector.ts";
import {
  dizyQuantCampaignCollectorPublicationReady,
  ensureDizyQuantCampaignCollectorSeed,
  readDizyQuantCampaignCollectorReadiness,
} from "../app/lib/dizyquant/campaign-collector-readiness.ts";

const response = (value) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function fullDepth(version = 10, timestamp = 10_000) {
  const bids = Array.from({ length: 80 }, (_, index) => [
    Number((99.99 - index * 0.01).toFixed(2)),
    1,
    10 + index,
  ]);
  const asks = Array.from({ length: 80 }, (_, index) => [
    Number((100.01 + index * 0.01).toFixed(2)),
    1,
    10 + index,
  ]);
  return { version, timestamp, bids, asks };
}

test("campaign collection refuses pre-seed websocket increments and becomes ready only after authoritative depth", async () => {
  let calls = 0;
  let now = 10_000;
  const collector = new DepthCollector(
    "BTC_USDT",
    async () => {
      calls += 1;
      return response(fullDepth(10, 9_900));
    },
    () => now,
    undefined,
    { transport: "ws", maxLevels: 100, historySampleMs: 10_000 },
  );

  collector.applyWsUpdate({
    symbol: "BTC_USDT",
    version: 9,
    engineTimeMs: 9_800,
    bids: [{ price: 99.99, orderCount: 1, contractQuantity: 2 }],
    asks: [{ price: 100.01, orderCount: 1, contractQuantity: 3 }],
  });
  await new Promise((resolve) => setTimeout(resolve, 160));

  let readiness = readDizyQuantCampaignCollectorReadiness(collector);
  assert.equal(readiness.authoritativeSnapshotSeeded, false);
  assert.equal(readiness.sourceMode, "NO VALID BOOK");
  assert.equal(readiness.snapshotComplete, false);
  assert.equal(readiness.coverageComplete, null);
  assert.equal(dizyQuantCampaignCollectorPublicationReady(readiness), false);

  assert.equal(await ensureDizyQuantCampaignCollectorSeed(collector), true);
  readiness = readDizyQuantCampaignCollectorReadiness(collector);
  assert.equal(readiness.authoritativeSnapshotSeeded, true);
  assert.equal(readiness.coverageComplete, true);
  assert.ok(readiness.bids >= 25);
  assert.ok(readiness.asks >= 25);
  assert.equal(dizyQuantCampaignCollectorPublicationReady(readiness), false);
  assert.equal(calls, 1);

  now += 100;
  collector.applyWsUpdate({
    symbol: "BTC_USDT",
    version: 11,
    engineTimeMs: 10_050,
    bids: [{ price: 99.99, orderCount: 1, contractQuantity: 12 }],
    asks: [{ price: 100.01, orderCount: 1, contractQuantity: 13 }],
  });
  await new Promise((resolve) => setTimeout(resolve, 160));
  readiness = readDizyQuantCampaignCollectorReadiness(collector);
  assert.equal(readiness.sourceMode, "FULL DEPTH WS");
  assert.equal(readiness.sequenceContinuous, true);
  assert.equal(readiness.coverageComplete, true);
  assert.equal(dizyQuantCampaignCollectorPublicationReady(readiness), true);
  collector.stop();
});

test("campaign service exposes the live collector boundary and waits instead of pretending an unseeded book is collecting", async () => {
  const service = await readFile("app/lib/dizyquant/campaign-recorder-service.ts", "utf8");
  assert.match(service, /ensureDizyQuantCampaignCollectorSeed\(collector\)/);
  assert.match(service, /phase = "waiting-depth-seed"/);
  assert.match(service, /readDizyQuantCampaignCollectorReadiness\(this\.collector\)/);
  assert.match(service, /lastPublicationBoundaryMs/);
  assert.match(service, /lastTargetPublicationBoundaryMs/);
  assert.doesNotMatch(service, /DIZYFLOW_MAX_COLLECTORS|MAX_COLLECTORS\s*=/);
});
