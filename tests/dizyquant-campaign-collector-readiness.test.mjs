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

function fullDepth(version = 100, timestamp = 10_000) {
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

test("campaign readiness repairs a websocket-first partial-book seed race before research starts", async () => {
  let releaseInitial;
  let calls = 0;
  const initialResponse = new Promise((resolve) => {
    releaseInitial = () => resolve(response(fullDepth(10, 2_000)));
  });
  const collector = new DepthCollector(
    "BTC_USDT",
    async () => {
      calls += 1;
      if (calls === 1) return initialResponse;
      return response(fullDepth(20, 3_000));
    },
    () => 4_000,
    undefined,
    { transport: "ws", maxLevels: 100, historySampleMs: 10_000 },
  );

  const initialPoll = collector.poll();
  collector.applyWsUpdate({
    symbol: "BTC_USDT",
    version: 1,
    engineTimeMs: 1_500,
    bids: [{ price: 99.99, orderCount: 1, contractQuantity: 2 }],
    asks: [{ price: 100.01, orderCount: 1, contractQuantity: 3 }],
  });
  await new Promise((resolve) => setTimeout(resolve, 160));

  let readiness = readDizyQuantCampaignCollectorReadiness(collector);
  assert.equal(readiness.sourceMode, "FULL DEPTH WS");
  assert.equal(readiness.sequenceContinuous, true);
  assert.equal(readiness.coverageComplete, false);
  assert.equal(dizyQuantCampaignCollectorPublicationReady(readiness), false);

  releaseInitial();
  assert.equal(await initialPoll, true);
  assert.equal(collector.diagnostic().bids, 1);
  assert.equal(collector.diagnostic().asks, 1);

  assert.equal(await ensureDizyQuantCampaignCollectorSeed(collector), true);
  readiness = readDizyQuantCampaignCollectorReadiness(collector);
  assert.equal(readiness.coverageComplete, true);
  assert.ok(readiness.bids >= 25);
  assert.ok(readiness.asks >= 25);
  assert.ok(readiness.restRecoveries >= 1);
  assert.equal(calls, 2);
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
