import "server-only";

export type { CollectorDiagnostic } from "./depth-collector-impl.ts";

type DepthModule = typeof import("./depth-collector-impl.ts");
type DepthRuntimeHolder = { modulePromise: Promise<DepthModule> };

const DEPTH_RUNTIME = Symbol.for("dizyflow.depth-collector.runtime.v1");
const host = globalThis as typeof globalThis & { [key: symbol]: unknown };
let runtime = host[DEPTH_RUNTIME] as DepthRuntimeHolder | undefined;
if (!runtime) {
  runtime = { modulePromise: import("./depth-collector-impl.ts") };
  host[DEPTH_RUNTIME] = runtime;
}
const implementation = await runtime.modulePromise;

export const LOW_MEMORY_MODE = implementation.LOW_MEMORY_MODE;
export const DEPTH_TRANSPORT = implementation.DEPTH_TRANSPORT;
export const parseDepthPollMs = implementation.parseDepthPollMs;
export const DEPTH_POLL_MS = implementation.DEPTH_POLL_MS;
export const DEPTH_STALE_MS = implementation.DEPTH_STALE_MS;
export const WS_SILENCE_MS = implementation.WS_SILENCE_MS;
export const HISTORY_MINUTES = implementation.HISTORY_MINUTES;
export const HISTORY_SAMPLE_MS = implementation.HISTORY_SAMPLE_MS;
export const MAX_HISTORY_SAMPLES = implementation.MAX_HISTORY_SAMPLES;
export const MAX_LEVELS_PER_SIDE = implementation.MAX_LEVELS_PER_SIDE;
export const MAX_COLLECTORS = implementation.MAX_COLLECTORS;
export const COLLECTOR_IDLE_MS = implementation.COLLECTOR_IDLE_MS;
export const MAX_HEATMAP_RECORDS = implementation.MAX_HEATMAP_RECORDS;
export const parseMexcFuturesWsUrl = implementation.parseMexcFuturesWsUrl;
export const MEXC_FUTURES_WS_URL = implementation.MEXC_FUTURES_WS_URL;
export const DEPTH_PUBLICATION_MS = implementation.DEPTH_PUBLICATION_MS;
export const normalizeDepthSymbol = implementation.normalizeDepthSymbol;
export const websocketDepthFresh = implementation.websocketDepthFresh;
export const normalizeMexcSnapshot = implementation.normalizeMexcSnapshot;

export type DepthCollector = InstanceType<DepthModule["DepthCollector"]>;
export const DepthCollector = implementation.DepthCollector;
export type DepthRequestLimiter = InstanceType<DepthModule["DepthRequestLimiter"]>;
export const DepthRequestLimiter = implementation.DepthRequestLimiter;
export const depthRequestLimiter = implementation.depthRequestLimiter;
export const acquireDepthCollector = implementation.acquireDepthCollector;
export const releaseDepthCollector = implementation.releaseDepthCollector;
export const collectorRegistryDiagnostic = implementation.collectorRegistryDiagnostic;
export const pruneIdleCollectors = implementation.pruneIdleCollectors;
export const getDepthCollector = implementation.getDepthCollector;
export const startArchiveCollectors = implementation.startArchiveCollectors;
