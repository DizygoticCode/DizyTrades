export type {
  CompactLiquidityChange,
  LiquidityCoverage,
  HistoryPage,
} from "./liquidity-tape-impl.ts";

type LiquidityModule = typeof import("./liquidity-tape-impl.ts");
type LiquidityRuntimeHolder = { modulePromise: Promise<LiquidityModule> };

const TAPE_RUNTIME = Symbol.for("dizyflow.liquidity-tape.runtime.v1");
const host = globalThis as typeof globalThis & { [key: symbol]: unknown };
let runtime = host[TAPE_RUNTIME] as LiquidityRuntimeHolder | undefined;
if (!runtime) {
  runtime = { modulePromise: import("./liquidity-tape-impl.ts") };
  host[TAPE_RUNTIME] = runtime;
}
const implementation = await runtime.modulePromise;

export const HEATMAP_RETENTION_MINUTES = implementation.HEATMAP_RETENTION_MINUTES;
export const HEATMAP_SAMPLE_MS = implementation.HEATMAP_SAMPLE_MS;
export const HEATMAP_MAX_MEMORY_RECORDS = implementation.HEATMAP_MAX_MEMORY_RECORDS;
export const HEATMAP_MAX_DISK_MB = implementation.HEATMAP_MAX_DISK_MB;
export const HEATMAP_TOTAL_DISK_MB = implementation.HEATMAP_TOTAL_DISK_MB;
export const MAX_TAPES = implementation.MAX_TAPES;
export const HISTORY_MAX_BYTES = implementation.HISTORY_MAX_BYTES;
export type LiquidityTape = InstanceType<LiquidityModule["LiquidityTape"]>;
export const LiquidityTape = implementation.LiquidityTape;
export const pruneIdleTapes = implementation.pruneIdleTapes;
export const getLiquidityTape = implementation.getLiquidityTape;
export const acquireLiquidityTape = implementation.acquireLiquidityTape;
export const releaseLiquidityTape = implementation.releaseLiquidityTape;
export const liquidityTapeDiagnostics = implementation.liquidityTapeDiagnostics;
