import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const text = (path) => readFileSync(path, "utf8");

test("production owns durable controls and uses the internal caller verifier", () => {
  const composition = text("app/lib/execution/internal/composition.ts");
  assert.match(composition, /createProductionExecutionControlStore/);
  assert.match(composition, /authenticateInternalCaller: verifyProductionExecutionCaller/);
  assert.match(text("app/lib/execution/internal/control-store.ts"), /execution-control\.sqlite/);
  assert.doesNotMatch(text("app/lib/execution/internal/control-store.ts"), /LIVE_TRADING_ENABLED|MEXC|fetch\(|credential|private.?key/i);
});

test("no route imports guarded execution or exposes order-write mechanics", () => {
  const routes = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path); else if (entry.name === "route.ts") routes.push(path);
    }
  };
  walk("app");
  for (const route of routes) {
    const source = text(route);
    assert.doesNotMatch(source, /lib\/execution|executionBoundary|placeOrder|submitOrder|cancelOrder|amendOrder|signRequest/i, route);
  }
  const adapter = text("app/lib/execution/internal/adapter.ts");
  assert.doesNotMatch(adapter, /fetch\(|https?:|MEXC|sign|credential|place|cancel|amend/i);
  assert.match(adapter, /executed: false/);
  assert.match(text("render.yaml"), /key: LIVE_TRADING_ENABLED\s+value: "false"/);
});
