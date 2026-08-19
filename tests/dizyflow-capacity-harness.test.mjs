import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_CAPACITY_STAGES,
  memoryGuardReason,
  parseCapacityConfig,
  parseCapacityStages,
} from "../scripts/dizyflow-capacity-harness.mjs";

test("capacity harness defaults to the agreed 50 -> 100 -> 250 -> 500 -> 1000 ladder", () => {
  assert.deepEqual(DEFAULT_CAPACITY_STAGES, [50, 100, 250, 500, 1000]);
  assert.deepEqual(parseCapacityStages(), [50, 100, 250, 500, 1000]);
});

test("capacity harness accepts bounded deterministic overrides", () => {
  const config = parseCapacityConfig(
    {},
    [
      "--stages=3,1,3,2",
      "--stage-ms=500",
      "--tick-ms=50",
      "--levels=25",
      "--history=4",
      "--history-ms=100",
      "--update-hz=8",
      "--mutation-levels=2",
      "--max-heap-fraction=0.65",
      "--max-rss-mb=512",
      "--json=/tmp/dizy-capacity.json",
    ],
  );
  assert.deepEqual(config.stages, [1, 2, 3]);
  assert.equal(config.stageMs, 500);
  assert.equal(config.tickMs, 50);
  assert.equal(config.levelsPerSide, 25);
  assert.equal(config.historySamples, 4);
  assert.equal(config.historySampleMs, 100);
  assert.equal(config.updatesPerSymbolPerSecond, 8);
  assert.equal(config.mutationLevels, 2);
  assert.equal(config.maxHeapFraction, 0.65);
  assert.equal(config.maxRssMb, 512);
  assert.equal(config.output, "/tmp/dizy-capacity.json");
});

test("capacity harness stops before the V8 heap limit instead of benchmarking through OOM", () => {
  const config = { maxHeapFraction: 0.72, maxRssMb: 0 };
  assert.equal(
    memoryGuardReason(
      {
        rss: 200 * 1024 * 1024,
        heapUsed: 180 * 1024 * 1024,
        heapLimit: 250 * 1024 * 1024,
      },
      config,
    ),
    "heap 72.0% >= 72.0% guard",
  );
  assert.equal(
    memoryGuardReason(
      {
        rss: 200 * 1024 * 1024,
        heapUsed: 100 * 1024 * 1024,
        heapLimit: 250 * 1024 * 1024,
      },
      config,
    ),
    null,
  );
});

test("capacity harness can enforce an explicit host RSS budget as a second guard", () => {
  assert.match(
    memoryGuardReason(
      {
        rss: 513 * 1024 * 1024,
        heapUsed: 100 * 1024 * 1024,
        heapLimit: 1024 * 1024 * 1024,
      },
      { maxHeapFraction: 0.72, maxRssMb: 512 },
    ),
    /^rss 513\.0 MiB >= 512 MiB guard$/,
  );
});

test("capacity harness is synthetic-only and records the required host/process evidence", async () => {
  const source = await readFile(new URL("../scripts/dizyflow-capacity-harness.mjs", import.meta.url), "utf8");
  for (const required of [
    "monitorEventLoopDelay",
    "process.memoryUsage()",
    "process.cpuUsage",
    "getHeapStatistics",
    "heap_size_limit",
    "arrayBuffers",
    "external",
    "updatesPerSecond",
    "retainedAfterGc",
    "networkRequests: false",
    "exchangeCredentials: false",
    "exchangeWrites: false",
    "productionHeapLimitChanged: false",
  ])
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bWebSocket\b/);
  assert.doesNotMatch(source, /https?:\/\//);
});

test("capacity harness has an explicit manual npm entrypoint with GC visibility", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    packageJson.scripts["dizyflow:capacity"],
    "node --expose-gc scripts/dizyflow-capacity-harness.mjs",
  );
});
