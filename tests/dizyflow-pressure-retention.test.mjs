import test from "node:test";
import assert from "node:assert/strict";
import { DepthCollector } from "../app/lib/order-flow/depth-collector.ts";

const response = (version, receivedAt) =>
  new Response(JSON.stringify({
    version,
    timestamp: receivedAt,
    bids: [[100, 1, 2]],
    asks: [[101, 1, 2]],
  }), { status: 200, headers: { "content-type": "application/json" } });

test("memory-pressure shedding permanently bounds the active collector ring once", async () => {
  let time = 1000, version = 0;
  const collector = new DepthCollector(
    "BTC_USDT",
    async () => response(++version, time),
    () => time,
    undefined,
    { transport: "rest", maxHistory: 8, historySampleMs: 250 },
  );
  try {
    for (let i = 0; i < 10; i++) {
      await collector.poll();
      time += 250;
    }
    assert.equal(collector.getHistory().length, 8);
    const retained = collector.getHistory().slice(-4).map((s) => s.snapshot.version);
    collector.halveHistory();
    assert.deepEqual(collector.getHistory().map((s) => s.snapshot.version), retained);

    for (let i = 0; i < 16; i++) {
      await collector.poll();
      time += 250;
    }
    const afterRefill = collector.getHistory().map((s) => s.snapshot.version);
    assert.equal(afterRefill.length, 4, "the original eight-slot maximum must not refill");
    assert.deepEqual(afterRefill, [version - 3, version - 2, version - 1, version]);

    collector.halveHistory();
    assert.deepEqual(collector.getHistory().map((s) => s.snapshot.version), afterRefill,
      "repeated memory warnings must not halve the same collector repeatedly");
    collector.stop();
    assert.deepEqual(collector.getHistory(), []);
  } finally {
    collector.stop();
  }
});

test("one-record histories never become zero-capacity rings under pressure", async () => {
  let now = 1000;
  const collector = new DepthCollector(
    "ETH_USDT", async () => response(1, now), () => now, undefined,
    { transport: "rest", maxHistory: 1, historySampleMs: 250 },
  );
  try {
    await collector.poll();
    collector.halveHistory();
    collector.halveHistory();
    now += 250;
    await collector.poll();
    assert.equal(collector.getHistory().length, 1);
    assert.equal(collector.diagnostic().historySamples, 1);
  } finally {
    collector.stop();
  }
});
