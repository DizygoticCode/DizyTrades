import assert from "node:assert/strict";
import test from "node:test";

import { FlowRenderStore } from "../app/lib/order-flow/render-store.ts";
import { DEFAULT_ORDER_FLOW_SETTINGS } from "../app/lib/order-flow/settings.ts";

const viewport = {
  from: 1_000,
  to: 61_000,
  minPrice: 63_000,
  maxPrice: 65_000,
  effectiveTimeBucketMs: 5_000,
  effectivePriceStep: 10,
};

test("new render-store subscribers receive the current committed snapshot after attachment", async () => {
  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  store.update({ enabled: true, generation: "BTC_USDT" });
  const snapshots = [];
  const unsubscribe = store.subscribe(() => {
    snapshots.push({
      enabled: store.getSnapshot().enabled,
      generation: store.getSnapshot().generation,
    });
  });

  try {
    assert.deepEqual(snapshots, []);
    await Promise.resolve();
    assert.deepEqual(snapshots, [{ enabled: true, generation: "BTC_USDT" }]);
  } finally {
    unsubscribe();
    store.destroy();
  }
});

test("a synchronous update suppresses the queued current-snapshot replay", async () => {
  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  const snapshots = [];
  const unsubscribe = store.subscribe(() => {
    snapshots.push({
      enabled: store.getSnapshot().enabled,
      generation: store.getSnapshot().generation,
    });
  });

  try {
    store.update({ enabled: true });
    assert.deepEqual(snapshots, [{ enabled: true, generation: "" }]);
    await Promise.resolve();
    assert.deepEqual(snapshots, [{ enabled: true, generation: "" }]);
  } finally {
    unsubscribe();
    store.destroy();
  }
});

test("unsubscribing before the attachment replay suppresses it", async () => {
  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });
  unsubscribe();
  await Promise.resolve();
  assert.equal(notifications, 0);
  store.destroy();
});

test("render-store subscribers observe committed snapshots synchronously without animation frames", () => {
  const originalAnimationFrame = globalThis.requestAnimationFrame;
  let animationFrameCalls = 0;
  globalThis.requestAnimationFrame = () => {
    animationFrameCalls += 1;
    return 1;
  };

  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  const snapshots = [];
  const unsubscribe = store.subscribe(() => {
    snapshots.push({
      enabled: store.getSnapshot().enabled,
      generation: store.getSnapshot().generation,
    });
  });

  try {
    store.update({ enabled: true });
    assert.deepEqual(snapshots, [{ enabled: true, generation: "" }]);
    store.update({ generation: "BTC_USDT" });
    assert.deepEqual(snapshots, [
      { enabled: true, generation: "" },
      { enabled: true, generation: "BTC_USDT" },
    ]);
    assert.equal(animationFrameCalls, 0);
  } finally {
    unsubscribe();
    store.destroy();
    if (originalAnimationFrame === undefined)
      delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalAnimationFrame;
  }
});

test("destroy removes synchronous render-store subscribers", () => {
  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });
  store.destroy();
  store.update({ enabled: true });
  assert.equal(notifications, 0);
});

test("an empty heatmap revision retries the same viewport once and then deduplicates it", () => {
  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  const requests = [];
  store.update({ generation: "BTC_USDT", enabled: true });
  store.subscribeViewport((range) => requests.push(range));

  store.requestHistory(viewport);
  store.requestHistory(viewport);
  assert.equal(requests.length, 1);

  store.update({ heatmapTiles: [] });
  store.requestHistory(viewport);
  store.requestHistory(viewport);
  assert.equal(requests.length, 2);

  store.update({ trades: [] });
  store.requestHistory(viewport);
  assert.equal(requests.length, 2);
  store.destroy();
});
