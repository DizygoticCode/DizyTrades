import type { BacktestSummary } from "./backtest.ts";
import type { RiskSettings } from "./config.ts";
import type { Candle, StrategySettings } from "./strategy.ts";

export type SimulationStatus = "idle" | "calculating" | "ready" | "updating" | "error" | "insufficient-history";

export type SimulationState = {
  status: SimulationStatus;
  result: BacktestSummary | null;
  error: string | null;
  requestId: number;
  fingerprint: string | null;
};

export type SimulationAction =
  | { type: "awaiting-input" }
  | { type: "start"; requestId: number; fingerprint: string }
  | { type: "success"; requestId: number; fingerprint: string; result: BacktestSummary }
  | { type: "failure"; requestId: number; message: string }
  | { type: "insufficient"; requestId: number };

export const initialSimulationState: SimulationState = {
  status: "idle", result: null, error: null, requestId: 0, fingerprint: null,
};

/** Request ids make aborts and late scheduled work harmless: only the newest run settles. */
export function simulationReducer(state: SimulationState, action: SimulationAction): SimulationState {
  if (action.type === "awaiting-input") return state.result ? { ...state, status: "updating", error: null } : { ...state, status: "idle", error: null };
  if (action.type === "start") return { ...state, status: state.result ? "updating" : "calculating", error: null, requestId: action.requestId, fingerprint: action.fingerprint };
  if (action.requestId !== state.requestId) return state;
  if (action.type === "success") return { ...state, status: "ready", result: action.result, error: null, fingerprint: action.fingerprint };
  if (action.type === "insufficient") return { ...state, status: "insufficient-history", error: null };
  return { ...state, status: "error", error: action.message };
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${key}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
};

// Include confirmed OHLCV values so exchange corrections recalculate, but never the live candle or ticker.
export function simulationFingerprint(input: { marketKey: string; timeframe: string; strategy: StrategySettings; risk: RiskSettings; candles: Candle[] }): string {
  let candleHash = 2166136261;
  for (const candle of input.candles) {
    for (const value of [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume]) {
      const text = String(value);
      for (let index = 0; index < text.length; index += 1) candleHash = Math.imul(candleHash ^ text.charCodeAt(index), 16777619);
    }
  }
  return [input.marketKey, input.timeframe, stable(input.strategy), stable(input.risk), input.candles.at(-1)?.time ?? "none", input.candles.length, candleHash >>> 0].join("|");
}
