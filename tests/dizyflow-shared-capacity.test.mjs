import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const envValue = (source, key) => {
  const match = source.match(new RegExp(`- key: ${key}\\n\\s+value: ["']?([^"'\\n]+)`));
  return match?.[1]?.trim() ?? null;
};

test("production Render profile preserves two live DizyFlow slots without background capture", async () => {
  const render = await readFile("render.yaml", "utf8");
  const example = await readFile(".env.example", "utf8");
  const instrumentation = await readFile("instrumentation.ts", "utf8");
  const registry = await readFile("app/lib/order-flow/depth-collector-impl.ts", "utf8");
  const tapes = await readFile("app/lib/order-flow/liquidity-tape-impl.ts", "utf8");

  const maxCollectors = Number(envValue(render, "DIZYFLOW_MAX_COLLECTORS"));
  const maxTapes = Number(envValue(render, "DIZYFLOW_MAX_TAPES"));

  assert.equal(envValue(render, "DIZYFLOW_ARCHIVE_ENABLED"), "false");
  assert.equal(envValue(render, "DIZYQUANT_CAMPAIGN_RECORDER_ENABLED"), "false");
  assert.equal(maxCollectors, 2);
  assert.equal(maxTapes, 2);
  assert.ok(maxCollectors >= 2, "Render must retain two live collector slots");
  assert.ok(maxTapes >= 2, "Render must retain two live tape slots");

  assert.match(example, /^DIZYFLOW_ARCHIVE_ENABLED=true$/m);
  assert.match(example, /^DIZYQUANT_CAMPAIGN_RECORDER_ENABLED=true$/m);
  assert.match(example, /^DIZYFLOW_MAX_COLLECTORS=3$/m);
  assert.match(example, /^DIZYFLOW_MAX_TAPES=3$/m);
  assert.match(instrumentation, /DIZYFLOW_ARCHIVE_ENABLED/);
  assert.match(instrumentation, /DIZYQUANT_CAMPAIGN_RECORDER_ENABLED/);
  assert.match(registry, /process\.env\.DIZYFLOW_MAX_COLLECTORS/);
  assert.match(registry, /throw Error\("DizyFlow collector capacity reached"\)/);
  assert.match(tapes, /DIZYFLOW_MAX_TAPES/);
  assert.match(tapes, /throw Error\("DizyFlow tape capacity reached"\)/);
});
