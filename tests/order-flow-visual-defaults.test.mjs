import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ORDER_FLOW_SETTINGS,
  sanitiseOrderFlowSettings,
} from "../app/lib/order-flow/settings.ts";

test("order-flow overlays default behind primary candle information", () => {
  assert.equal(DEFAULT_ORDER_FLOW_SETTINGS.heatmap.opacity, 0.42);
  assert.equal(DEFAULT_ORDER_FLOW_SETTINGS.bubbles.opacity, 0.14);
  assert.equal(DEFAULT_ORDER_FLOW_SETTINGS.bubbles.outlineOpacity, 0.24);
  assert.equal(DEFAULT_ORDER_FLOW_SETTINGS.bubbles.minimumRadius, 2);
  assert.equal(DEFAULT_ORDER_FLOW_SETTINGS.bubbles.maximumRadius, 15);
});

test("previous shipped bubble defaults migrate while custom values remain explicit", () => {
  const legacy = sanitiseOrderFlowSettings({
    bubbles: {
      opacity: 0.18,
      outlineOpacity: 0.33,
      minimumRadius: 3,
      maximumRadius: 20,
    },
  });
  assert.equal(legacy.bubbles.opacity, 0.14);
  assert.equal(legacy.bubbles.outlineOpacity, 0.24);
  assert.equal(legacy.bubbles.minimumRadius, 2);
  assert.equal(legacy.bubbles.maximumRadius, 15);

  const custom = sanitiseOrderFlowSettings({
    bubbles: {
      opacity: 0.2,
      outlineOpacity: 0.3,
      minimumRadius: 4,
      maximumRadius: 22,
    },
  });
  assert.equal(custom.bubbles.opacity, 0.2);
  assert.equal(custom.bubbles.outlineOpacity, 0.3);
  assert.equal(custom.bubbles.minimumRadius, 4);
  assert.equal(custom.bubbles.maximumRadius, 22);
});
