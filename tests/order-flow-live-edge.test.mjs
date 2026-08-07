import assert from "node:assert/strict";
import test from "node:test";

import { FlowRenderStore } from "../app/lib/order-flow/render-store.ts";
import { DEFAULT_ORDER_FLOW_SETTINGS } from "../app/lib/order-flow/settings.ts";

test("rendered live heatmap cells advance captureEnded beyond historical archive coverage", () => {
  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  store.update({
    captureStarted: 1_000,
    captureEnded: 5_000,
    heatmapTiles: [
      { fromMs: 1_000, toMs: 5_000, price: 64_000, bidQuantity: 5, askQuantity: 0 },
      { fromMs: 5_000, toMs: 95_000, price: 64_020, bidQuantity: 0, askQuantity: 7 },
    ],
  });
  assert.equal(store.getSnapshot().captureEnded, 95_000);
  assert.equal(store.getSnapshot().captureStarted, 1_000);
});

test("unrelated DOM or trade updates cannot move the retained heatmap live edge backwards", () => {
  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  store.update({
    captureEnded: 95_000,
    heatmapTiles: [
      { fromMs: 90_000, toMs: 95_000, price: 64_000, bidQuantity: 5, askQuantity: 0 },
    ],
  });
  store.update({ captureEnded: 5_000, trades: [] });
  assert.equal(store.getSnapshot().captureEnded, 95_000);
});

test("explicit heatmap replacement can reset the retained edge", () => {
  const store = new FlowRenderStore(DEFAULT_ORDER_FLOW_SETTINGS);
  store.update({
    heatmapTiles: [
      { fromMs: 90_000, toMs: 95_000, price: 64_000, bidQuantity: 5, askQuantity: 0 },
    ],
  });
  store.update({
    captureEnded: 5_000,
    heatmapTiles: [
      { fromMs: 1_000, toMs: 5_000, price: 64_000, bidQuantity: 5, askQuantity: 0 },
    ],
  });
  assert.equal(store.getSnapshot().captureEnded, 5_000);
});
