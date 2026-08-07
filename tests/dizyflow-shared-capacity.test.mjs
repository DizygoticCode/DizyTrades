import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const envValue = (source, key) => {
  const match = source.match(new RegExp(`- key: ${key}\\n\\s+value: ["']?([^"'\\n]+)`));
  return match?.[1]?.trim() ?? null;
};

test("production DizyFlow budget leaves two live-symbol slots beside the archive", async () => {
  const render = await readFile("render.yaml", "utf8");
  const example = await readFile(".env.example", "utf8");
  const registry = await readFile("app/lib/order-flow/depth-collector.ts", "utf8");
  const tapes = await readFile("app/lib/order-flow/liquidity-tape.ts", "utf8");

  const maxCollectors = Number(envValue(render, "DIZYFLOW_MAX_COLLECTORS"));
  const maxTapes = Number(envValue(render, "DIZYFLOW_MAX_TAPES"));
  const archiveSymbols = String(envValue(render, "DIZYFLOW_ARCHIVE_SYMBOLS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  assert.equal(maxCollectors, 3);
  assert.equal(maxTapes, 3);
  assert.deepEqual(archiveSymbols, ["BTC_USDT"]);
  assert.ok(maxCollectors - archiveSymbols.length >= 2, "archive must leave two live collector slots");
  assert.ok(maxTapes - archiveSymbols.length >= 2, "archive must leave two live tape slots");

  assert.match(example, /^DIZYFLOW_MAX_COLLECTORS=3$/m);
  assert.match(example, /^DIZYFLOW_MAX_TAPES=3$/m);
  assert.match(registry, /process\.env\.DIZYFLOW_MAX_COLLECTORS/);
  assert.match(registry, /throw Error\("DizyFlow collector capacity reached"\)/);
  assert.match(tapes, /DIZYFLOW_MAX_TAPES/);
  assert.match(tapes, /throw Error\("DizyFlow tape capacity reached"\)/);
});
