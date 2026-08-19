#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import os from "node:os";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { getHeapStatistics } from "node:v8";

export const DEFAULT_CAPACITY_STAGES = Object.freeze([50, 100, 250, 500, 1000]);

const MiB = 1024 * 1024;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finiteNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const integer = (value, fallback, min, max) =>
  clamp(Math.floor(finiteNumber(value, fallback)), min, max);
const fraction = (value, fallback, min, max) =>
  clamp(finiteNumber(value, fallback), min, max);

export function parseCapacityStages(value) {
  if (!value) return [...DEFAULT_CAPACITY_STAGES];
  const stages = String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isSafeInteger(item) && item > 0 && item <= 10_000);
  return [...new Set(stages)].sort((a, b) => a - b);
}

const argMap = (argv) => {
  const result = new Map();
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [key, ...rest] = raw.slice(2).split("=");
    result.set(key, rest.length ? rest.join("=") : "true");
  }
  return result;
};

export function parseCapacityConfig(env = process.env, argv = []) {
  const args = argMap(argv),
    read = (arg, envName, fallback) => args.get(arg) ?? env[envName] ?? fallback,
    stages = parseCapacityStages(read("stages", "DIZY_CAPACITY_STAGES", ""));
  if (!stages.length) throw Error("DIZY capacity stages must contain at least one positive integer");
  return {
    stages,
    stageMs: integer(read("stage-ms", "DIZY_CAPACITY_STAGE_MS", 15_000), 15_000, 250, 3_600_000),
    tickMs: integer(read("tick-ms", "DIZY_CAPACITY_TICK_MS", 250), 250, 10, 5_000),
    levelsPerSide: integer(read("levels", "DIZY_CAPACITY_LEVELS_PER_SIDE", 500), 500, 1, 2_000),
    historySamples: integer(read("history", "DIZY_CAPACITY_HISTORY_SAMPLES", 60), 60, 0, 10_000),
    historySampleMs: integer(read("history-ms", "DIZY_CAPACITY_HISTORY_SAMPLE_MS", 2_000), 2_000, 50, 60_000),
    updatesPerSymbolPerSecond: fraction(read("update-hz", "DIZY_CAPACITY_UPDATE_HZ", 4), 4, 0.1, 100),
    mutationLevels: integer(read("mutation-levels", "DIZY_CAPACITY_MUTATION_LEVELS", 8), 8, 1, 500),
    maxHeapFraction: fraction(read("max-heap-fraction", "DIZY_CAPACITY_MAX_HEAP_FRACTION", 0.72), 0.72, 0.25, 0.95),
    maxRssMb: integer(read("max-rss-mb", "DIZY_CAPACITY_MAX_RSS_MB", 0), 0, 0, 1_048_576),
    output: String(read("json", "DIZY_CAPACITY_JSON", "")).trim(),
  };
}

export function captureMemory() {
  const memory = process.memoryUsage(),
    heap = getHeapStatistics(),
    availableMemory = typeof process.availableMemory === "function" ? process.availableMemory() : null;
  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    heapLimit: heap.heap_size_limit,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
    availableSystem: availableMemory,
  };
}

export function memoryGuardReason(memory, config) {
  if (memory.heapLimit > 0 && memory.heapUsed / memory.heapLimit >= config.maxHeapFraction)
    return `heap ${(100 * memory.heapUsed / memory.heapLimit).toFixed(1)}% >= ${(100 * config.maxHeapFraction).toFixed(1)}% guard`;
  if (config.maxRssMb > 0 && memory.rss / MiB >= config.maxRssMb)
    return `rss ${(memory.rss / MiB).toFixed(1)} MiB >= ${config.maxRssMb} MiB guard`;
  return null;
}

const memoryMiB = (memory) => ({
  rssMb: Number((memory.rss / MiB).toFixed(1)),
  heapUsedMb: Number((memory.heapUsed / MiB).toFixed(1)),
  heapTotalMb: Number((memory.heapTotal / MiB).toFixed(1)),
  heapLimitMb: Number((memory.heapLimit / MiB).toFixed(1)),
  heapFraction: Number((memory.heapUsed / memory.heapLimit).toFixed(4)),
  externalMb: Number((memory.external / MiB).toFixed(1)),
  arrayBuffersMb: Number((memory.arrayBuffers / MiB).toFixed(1)),
  availableSystemMb: memory.availableSystem == null ? null : Number((memory.availableSystem / MiB).toFixed(1)),
});

const maxMemory = (peak, next) => ({
  rss: Math.max(peak.rss, next.rss),
  heapUsed: Math.max(peak.heapUsed, next.heapUsed),
  heapTotal: Math.max(peak.heapTotal, next.heapTotal),
  heapLimit: next.heapLimit,
  external: Math.max(peak.external, next.external),
  arrayBuffers: Math.max(peak.arrayBuffers, next.arrayBuffers),
  availableSystem: next.availableSystem,
});

class SyntheticDepthWorkload {
  constructor(index, config, now) {
    this.symbol = `LOAD${String(index + 1).padStart(4, "0")}_USDT`;
    this.levelsPerSide = config.levelsPerSide;
    this.history = new Array(config.historySamples);
    this.historyStart = 0;
    this.historyCount = 0;
    this.nextHistoryAt = now + config.historySampleMs;
    this.version = 0;
    this.carry = 0;
    this.bids = new Map();
    this.asks = new Map();
    this.bidPrices = new Array(this.levelsPerSide);
    this.askPrices = new Array(this.levelsPerSide);
    const center = 100_000 + index * 10;
    for (let level = 0; level < this.levelsPerSide; level += 1) {
      const bidPrice = center - level,
        askPrice = center + level + 1;
      this.bidPrices[level] = bidPrice;
      this.askPrices[level] = askPrice;
      this.bids.set(bidPrice, { price: bidPrice, orderCount: 1, contractQuantity: 1 });
      this.asks.set(askPrice, { price: askPrice, orderCount: 1, contractQuantity: 1 });
    }
    this.latest = this.materialize(now);
  }

  materialize(now) {
    return {
      symbol: this.symbol,
      version: this.version,
      engineTimeMs: now,
      bids: [...this.bids.values()].sort((a, b) => b.price - a.price).slice(0, this.levelsPerSide),
      asks: [...this.asks.values()].sort((a, b) => a.price - b.price).slice(0, this.levelsPerSide),
    };
  }

  appendHistory(snapshot) {
    if (!this.history.length) return;
    const index = (this.historyStart + this.historyCount) % this.history.length;
    this.history[index] = snapshot;
    if (this.historyCount < this.history.length) this.historyCount += 1;
    else this.historyStart = (this.historyStart + 1) % this.history.length;
  }

  update(now, config) {
    this.version += 1;
    for (let offset = 0; offset < config.mutationLevels; offset += 1) {
      const level = (this.version * 17 + offset * 31) % this.levelsPerSide,
        bidPrice = this.bidPrices[level],
        askPrice = this.askPrices[level],
        quantity = 1 + ((this.version + offset) % 20);
      this.bids.set(bidPrice, { price: bidPrice, orderCount: 1 + (offset % 4), contractQuantity: quantity });
      this.asks.set(askPrice, { price: askPrice, orderCount: 1 + ((offset + 1) % 4), contractQuantity: quantity + 1 });
    }
    this.latest = this.materialize(now);
    let sampled = 0;
    while (now >= this.nextHistoryAt) {
      this.appendHistory(this.latest);
      this.nextHistoryAt += config.historySampleMs;
      sampled += 1;
    }
    return sampled;
  }
}

const delayMetrics = (histogram) => ({
  meanMs: Number((histogram.mean / 1e6).toFixed(3)),
  maxMs: Number((histogram.max / 1e6).toFixed(3)),
  p50Ms: Number((histogram.percentile(50) / 1e6).toFixed(3)),
  p95Ms: Number((histogram.percentile(95) / 1e6).toFixed(3)),
  p99Ms: Number((histogram.percentile(99) / 1e6).toFixed(3)),
});

const hostSummary = () => ({
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  logicalCpus: os.cpus().length,
  totalSystemMemoryMb: Number((os.totalmem() / MiB).toFixed(1)),
  gcExposed: typeof globalThis.gc === "function",
});

async function addWorkloads(workloads, target, config, guard) {
  while (workloads.length < target) {
    workloads.push(new SyntheticDepthWorkload(workloads.length, config, Date.now()));
    if (workloads.length % 10 === 0 || workloads.length === target) {
      const reason = guard(captureMemory());
      if (reason) return reason;
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return null;
}

async function runStage(workloads, target, config) {
  globalThis.gc?.();
  await new Promise((resolve) => setImmediate(resolve));
  const baseline = captureMemory(),
    delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  delay.reset();
  const cpuStart = process.cpuUsage(),
    started = performance.now(),
    deadline = started + config.stageMs,
    perTick = config.updatesPerSymbolPerSecond * config.tickMs / 1000;
  let peak = baseline,
    updates = 0,
    historySamples = 0,
    ticks = 0,
    guardReason = null,
    nextMemoryCheck = started;

  while (performance.now() < deadline && !guardReason) {
    const tickStarted = performance.now(),
      now = Date.now();
    for (let index = 0; index < target; index += 1) {
      const workload = workloads[index];
      workload.carry += perTick;
      while (workload.carry >= 1) {
        historySamples += workload.update(now, config);
        workload.carry -= 1;
        updates += 1;
      }
      if (index % 25 === 0 && performance.now() >= nextMemoryCheck) {
        const memory = captureMemory();
        peak = maxMemory(peak, memory);
        guardReason = memoryGuardReason(memory, config);
        nextMemoryCheck = performance.now() + 100;
        if (guardReason) break;
      }
    }
    ticks += 1;
    const memory = captureMemory();
    peak = maxMemory(peak, memory);
    guardReason ||= memoryGuardReason(memory, config);
    const wait = config.tickMs - (performance.now() - tickStarted);
    if (!guardReason && wait > 0) await sleep(wait);
    else await new Promise((resolve) => setImmediate(resolve));
  }

  const ended = performance.now(),
    cpu = process.cpuUsage(cpuStart),
    beforeGc = captureMemory(),
    eventLoop = delayMetrics(delay);
  delay.disable();
  globalThis.gc?.();
  await new Promise((resolve) => setImmediate(resolve));
  const afterGc = captureMemory(),
    elapsedMs = Math.max(1, ended - started),
    cpuMs = (cpu.user + cpu.system) / 1000;
  return {
    targetSymbols: target,
    completed: !guardReason,
    guardReason,
    elapsedMs: Number(elapsedMs.toFixed(1)),
    ticks,
    updates,
    updatesPerSecond: Number((updates * 1000 / elapsedMs).toFixed(1)),
    historySamples,
    cpuPercentOfOneCore: Number((cpuMs * 100 / elapsedMs).toFixed(1)),
    eventLoop,
    baseline: memoryMiB(baseline),
    peak: memoryMiB(peak),
    beforeGc: memoryMiB(beforeGc),
    retainedAfterGc: memoryMiB(afterGc),
  };
}

export async function runCapacityHarness(config = parseCapacityConfig()) {
  const workloads = [],
    startedAt = new Date().toISOString(),
    stages = [];
  let guardedStop = null;
  const guard = (memory) => memoryGuardReason(memory, config);

  for (const target of config.stages) {
    const allocationGuard = await addWorkloads(workloads, target, config, guard);
    if (allocationGuard) {
      guardedStop = `while allocating stage ${target}: ${allocationGuard}`;
      stages.push({ targetSymbols: target, completed: false, guardReason: guardedStop });
      break;
    }
    const stage = await runStage(workloads, target, config);
    stages.push(stage);
    console.info("Dizy capacity stage", stage);
    if (!stage.completed) {
      guardedStop = `during stage ${target}: ${stage.guardReason}`;
      break;
    }
  }

  const report = {
    schemaVersion: 1,
    kind: "dizyflow-synthetic-capacity",
    safety: {
      networkRequests: false,
      exchangeCredentials: false,
      exchangeWrites: false,
      productionHeapLimitChanged: false,
      guardedStop,
    },
    host: hostSummary(),
    config,
    startedAt,
    finishedAt: new Date().toISOString(),
    stages,
  };
  if (config.output) await writeFile(config.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.info("Dizy capacity result", JSON.stringify(report));
  return report;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    const config = parseCapacityConfig(process.env, process.argv.slice(2)),
      report = await runCapacityHarness(config);
    if (report.safety.guardedStop) process.exitCode = 2;
  } catch (error) {
    console.error("Dizy capacity harness failed", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
