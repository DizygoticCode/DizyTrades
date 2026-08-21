import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyConstrainedRenderMemoryProfile } from "../app/lib/render-memory-profile.ts";

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
  const tiles = await readFile("app/api/dizyflow/heatmap/tiles/route.ts", "utf8");

  const maxCollectors = Number(envValue(render, "DIZYFLOW_MAX_COLLECTORS"));
  const maxTapes = Number(envValue(render, "DIZYFLOW_MAX_TAPES"));

  assert.equal(envValue(render, "DIZYFLOW_RENDER_LOW_MEMORY_PROFILE"), "true");
  assert.equal(envValue(render, "DIZYFLOW_ARCHIVE_ENABLED"), "false");
  assert.equal(envValue(render, "DIZYQUANT_CAMPAIGN_RECORDER_ENABLED"), "false");
  assert.equal(maxCollectors, 2);
  assert.equal(maxTapes, 2);
  assert.equal(Number(envValue(render, "DIZYFLOW_MAX_HEATMAP_RECORDS")), 5_000);
  assert.equal(Number(envValue(render, "DIZYFLOW_HEATMAP_MAX_MEMORY_RECORDS")), 5_000);
  assert.equal(Number(envValue(render, "DIZYFLOW_HEATMAP_MAX_PENDING")), 2_000);
  assert.equal(Number(envValue(render, "DIZYFLOW_TILE_CACHE_MB")), 4);
  assert.equal(Number(envValue(render, "DIZYFLOW_MEMORY_WARN_MB")), 260);
  assert.equal(Number(envValue(render, "DIZYFLOW_MEMORY_SHED_MB")), 300);
  assert.equal(Number(envValue(render, "DIZYFLOW_MEMORY_HARD_MB")), 340);
  assert.equal(envValue(render, "NODE_OPTIONS"), "--max-old-space-size=300");
  assert.ok(maxCollectors >= 2, "Render must retain two live collector slots");
  assert.ok(maxTapes >= 2, "Render must retain two live tape slots");

  assert.match(example, /^DIZYFLOW_ARCHIVE_ENABLED=true$/m);
  assert.match(example, /^DIZYQUANT_CAMPAIGN_RECORDER_ENABLED=true$/m);
  assert.match(example, /^DIZYFLOW_MAX_COLLECTORS=3$/m);
  assert.match(example, /^DIZYFLOW_MAX_TAPES=3$/m);
  assert.match(instrumentation, /applyConstrainedRenderMemoryProfile\(\)/);
  assert.ok(
    instrumentation.indexOf("applyConstrainedRenderMemoryProfile()") <
      instrumentation.indexOf("migratePrivilegedAccounts"),
    "Render memory profile must apply before server runtimes are imported",
  );
  assert.match(registry, /process\.env\.DIZYFLOW_MAX_COLLECTORS/);
  assert.match(registry, /throw Error\("DizyFlow collector capacity reached"\)/);
  assert.match(tapes, /DIZYFLOW_MAX_TAPES/);
  assert.match(tapes, /throw Error\("DizyFlow tape capacity reached"\)/);
  assert.match(tiles, /process\.env\.DIZYFLOW_TILE_CACHE_MB/);
});

test("Render runtime enforcement defeats stale high dashboard values", () => {
  const env = {
    RENDER: "true",
    DIZYFLOW_LOW_MEMORY_MODE: "false",
    DIZYFLOW_ARCHIVE_ENABLED: "true",
    DIZYQUANT_CAMPAIGN_RECORDER_ENABLED: "true",
    DIZYFLOW_ARCHIVE_SYMBOLS: "BTC_USDT,ETH_USDT",
    DIZYFLOW_MAX_HISTORY_SAMPLES: "1800",
    DIZYFLOW_MAX_LEVELS_PER_SIDE: "500",
    DIZYFLOW_MAX_COLLECTORS: "8",
    DIZYFLOW_MAX_HEATMAP_RECORDS: "50000",
    DIZYFLOW_HEATMAP_MAX_MEMORY_RECORDS: "50000",
    DIZYFLOW_HEATMAP_MAX_PENDING: "50000",
    DIZYFLOW_MAX_TAPES: "20",
    DIZYFLOW_TILE_CACHE_MB: "12",
    DIZYFLOW_MEMORY_WARN_MB: "300",
    DIZYFLOW_MEMORY_SHED_MB: "340",
    DIZYFLOW_MEMORY_HARD_MB: "380",
    NODE_OPTIONS: "--max-old-space-size=300",
  };

  assert.equal(applyConstrainedRenderMemoryProfile(env), true);
  assert.equal(env.DIZYFLOW_LOW_MEMORY_MODE, "true");
  assert.equal(env.DIZYFLOW_ARCHIVE_ENABLED, "false");
  assert.equal(env.DIZYQUANT_CAMPAIGN_RECORDER_ENABLED, "false");
  assert.equal(env.DIZYFLOW_ARCHIVE_SYMBOLS, "");
  assert.equal(env.DIZYFLOW_MAX_HISTORY_SAMPLES, "60");
  assert.equal(env.DIZYFLOW_MAX_LEVELS_PER_SIDE, "100");
  assert.equal(env.DIZYFLOW_MAX_COLLECTORS, "2");
  assert.equal(env.DIZYFLOW_MAX_HEATMAP_RECORDS, "5000");
  assert.equal(env.DIZYFLOW_HEATMAP_MAX_MEMORY_RECORDS, "5000");
  assert.equal(env.DIZYFLOW_HEATMAP_MAX_PENDING, "2000");
  assert.equal(env.DIZYFLOW_MAX_TAPES, "2");
  assert.equal(env.DIZYFLOW_TILE_CACHE_MB, "4");
  assert.equal(env.DIZYFLOW_MEMORY_WARN_MB, "260");
  assert.equal(env.DIZYFLOW_MEMORY_SHED_MB, "300");
  assert.equal(env.DIZYFLOW_MEMORY_HARD_MB, "340");
  assert.equal(env.NODE_OPTIONS, "--max-old-space-size=300");
});

test("self-hosted and explicit Render opt-out environments are not rewritten", () => {
  const selfHosted = { DIZYFLOW_MAX_COLLECTORS: "6" };
  assert.equal(applyConstrainedRenderMemoryProfile(selfHosted), false);
  assert.deepEqual(selfHosted, { DIZYFLOW_MAX_COLLECTORS: "6" });

  const optedOut = {
    RENDER: "true",
    DIZYFLOW_RENDER_LOW_MEMORY_PROFILE: "false",
    DIZYFLOW_MAX_COLLECTORS: "6",
  };
  assert.equal(applyConstrainedRenderMemoryProfile(optedOut), false);
  assert.equal(optedOut.DIZYFLOW_MAX_COLLECTORS, "6");
});
