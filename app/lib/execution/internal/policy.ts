import "server-only";

export const EXECUTION_POLICY_VERSION = "execution-preview-policy/1.0.0" as const;

export type ExecutionPolicy = Readonly<{
  version: typeof EXECUTION_POLICY_VERSION;
  allowedSymbols: readonly string[];
  maximumLeverage: number;
  maximumOrderNotional: number;
  maximumReferencePriceAgeMs: number;
  maximumAccountStateAgeMs: number;
}>;

/** Server-owned, deliberately narrow preview policy. No caller values are read. */
export function serverExecutionPolicy(): ExecutionPolicy {
  return Object.freeze({
    version: EXECUTION_POLICY_VERSION,
    allowedSymbols: Object.freeze(["BTC_USDT", "ETH_USDT"]),
    maximumLeverage: 20,
    maximumOrderNotional: 50_000,
    maximumReferencePriceAgeMs: 30_000,
    maximumAccountStateAgeMs: 30_000,
  });
}
