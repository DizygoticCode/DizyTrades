import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ORDER_FLOW_SETTINGS } from "../app/lib/order-flow/settings.ts";

test("order-flow overlays default behind primary candle information", () => {
  assert.equal(DEFAULT_ORDER_FLOW_SETTINGS.heatmap.opacity, 0.42);
  assert.equal(DEFAULT_ORDER_FLOW_SETTINGS.bubbles.opacity, 0.18);
});
