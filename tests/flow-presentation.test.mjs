import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { flowPresentation } from "../app/lib/order-flow/presentation.ts";

test("live DizyFlow shows evidence confidence", () => {
  assert.deepEqual(
    flowPresentation({
      enabled: true,
      status: "Live",
      confidence: 99.6,
      hasValidBook: true,
      lastValidUpdate: 1000,
    }),
    { statusLabel: "Live", metricLabel: "100%", recovering: false },
  );
});

test("a retained valid book presents transport recovery instead of zero confidence", () => {
  for (const status of ["Delayed", "Stale", "Recovering", "Offline"]) {
    assert.deepEqual(
      flowPresentation({
        enabled: true,
        status,
        confidence: 0,
        hasValidBook: true,
        lastValidUpdate: 1000,
      }),
      { statusLabel: "Recovering", metricLabel: "SYNC", recovering: true },
    );
  }
});

test("cold starts and hard failures remain distinct from retained-book recovery", () => {
  assert.deepEqual(
    flowPresentation({
      enabled: true,
      status: "Connecting",
      confidence: null,
      hasValidBook: false,
      lastValidUpdate: null,
    }),
    { statusLabel: "Connecting", metricLabel: "WARM", recovering: false },
  );
  assert.deepEqual(
    flowPresentation({
      enabled: true,
      status: "Offline",
      confidence: null,
      hasValidBook: false,
      lastValidUpdate: null,
    }),
    { statusLabel: "Offline", metricLabel: "WAIT", recovering: false },
  );
});

test("toolbar and DOM share the same recovery presentation contract", async () => {
  const [toolbar, dom] = await Promise.all([
    readFile(new URL("../app/order-flow-toolbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dizyflow-dom.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(toolbar, /flowPresentation\(/);
  assert.match(toolbar, /presentation\.metricLabel/);
  assert.match(toolbar, /presentation\.statusLabel/);
  assert.match(dom, /flowPresentation\(/);
  assert.match(dom, /presentation\.statusLabel\.toUpperCase\(\)/);
});
