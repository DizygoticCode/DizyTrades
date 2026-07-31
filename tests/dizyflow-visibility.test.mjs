import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ORDER_FLOW_SETTINGS } from "../app/lib/order-flow/settings.ts";
import { FlowRenderStore } from "../app/lib/order-flow/render-store.ts";

test("heatmap visibility participates in retained render invalidation", () => {
  const hidden = {
    ...DEFAULT_ORDER_FLOW_SETTINGS,
    heatmap: { ...DEFAULT_ORDER_FLOW_SETTINGS.heatmap },
    enabled: true,
    heatmapVisible: false,
  };
  const store = new FlowRenderStore(hidden);

  store.updateSettings(hidden);
  assert.strictEqual(store.getSnapshot().settings, hidden);
  assert.equal(Object.prototype.hasOwnProperty.call(hidden.heatmap, "renderVisible"), false);
  const hiddenSignature = JSON.stringify(store.getSnapshot().settings.heatmap);
  assert.match(hiddenSignature, /"renderVisible":false/);

  const visible = { ...hidden, heatmapVisible: true };
  store.updateSettings(visible);
  assert.strictEqual(store.getSnapshot().settings, visible);
  assert.equal(Object.prototype.hasOwnProperty.call(visible.heatmap, "renderVisible"), false);
  const visibleSignature = JSON.stringify(store.getSnapshot().settings.heatmap);
  assert.match(visibleSignature, /"renderVisible":true/);
  assert.notEqual(visibleSignature, hiddenSignature);

  store.destroy();
});
