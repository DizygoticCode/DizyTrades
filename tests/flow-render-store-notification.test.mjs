import assert from "node:assert/strict";
import test from "node:test";

import { FlowRenderStore } from "../app/lib/order-flow/render-store.ts";
import { DEFAULT_ORDER_FLOW_SETTINGS } from "../app/lib/order-flow/settings.ts";

test("render-store notifications leave the current animation frame before requesting chart work", async () => {
  const originalAnimationFrame = globalThis.requestAnimationFrame;
  let animationFrameCalls = 0;
  globalThis.requestAnimationFrame = () => {
    animationFrameCalls += 1;
    return 1;
  };

  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  try {
    store.update({ enabled: true });
    store.update({ generation: "BTC_USDT" });
    assert.equal(notifications, 0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(notifications, 1);
    assert.equal(animationFrameCalls, 0);
    assert.equal(store.getSnapshot().enabled, true);
    assert.equal(store.getSnapshot().generation, "BTC_USDT");
  } finally {
    unsubscribe();
    store.destroy();
    if (originalAnimationFrame === undefined)
      delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalAnimationFrame;
  }
});

test("destroy cancels a queued render-store notification", async () => {
  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });
  store.update({ enabled: true });
  store.destroy();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(notifications, 0);
});
