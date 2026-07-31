import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ORDER_FLOW_SETTINGS } from "../app/lib/order-flow/settings.ts";
import { FlowRenderStore } from "../app/lib/order-flow/render-store.ts";

test("heatmap visibility participates in retained render invalidation", () => {
  const hidden = {
    ...DEFAULT_ORDER_FLOW_SETTINGS,
    enabled: true,
    heatmapVisible: false,
  };
  const store = new FlowRenderStore(hidden);

  store.updateSettings(hidden);
  const hiddenSignature = JSON.stringify(store.getSnapshot().settings.heatmap);
  assert.match(hiddenSignature, /"renderVisible":false/);

  store.updateSettings({ ...hidden, heatmapVisible: true });
  const visibleSignature = JSON.stringify(store.getSnapshot().settings.heatmap);
  assert.match(visibleSignature, /"renderVisible":true/);
  assert.notEqual(visibleSignature, hiddenSignature);

  store.destroy();
});
