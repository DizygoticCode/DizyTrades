import "server-only";

export const EXECUTION_CONTRACT_VERSION = "execution-airlock/1.0.0" as const;

export type ExecutionState =
  | "received"
  | "rejected"
  | "validated"
  | "blocked"
  | "prepared"
  | "submitted"
  | "acknowledged"
  | "reconciled"
  | "failed"
  | "cancelled";

export type ExecutionIntent = Readonly<{
  contractVersion: typeof EXECUTION_CONTRACT_VERSION;
  intentId: string;
  idempotencyKey: string;
  userId: string;
  accountId: string;
  symbol: string;
  marketType: "futures";
  side: "long" | "short";
  orderType: "market" | "limit";
  quantity: number;
  price?: number;
  leverage: number;
  reduceOnly: boolean;
  source: "manual" | "signal";
  createdAt: string;
}>;

export type ExecutionRejectionCode =
  | "INVALID_IDENTITY"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_SYMBOL"
  | "UNKNOWN_SYMBOL"
  | "INVALID_SIDE"
  | "INVALID_ORDER_TYPE"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "INVALID_LEVERAGE"
  | "INVALID_REDUCE_ONLY"
  | "INVALID_SOURCE"
  | "INVALID_TIMESTAMP"
  | "PREREQUISITE_STATE_STALE"
  | "POLICY_SYMBOL_DENIED"
  | "POLICY_LEVERAGE_EXCEEDED"
  | "POLICY_NOTIONAL_EXCEEDED"
  | "REFERENCE_PRICE_MISSING"
  | "REFERENCE_PRICE_STALE"
  | "ACCOUNT_STATE_MISSING"
  | "ACCOUNT_STATE_STALE"
  | "REDUCE_ONLY_VIOLATION";

export type ExecutionRejection = Readonly<{
  code: ExecutionRejectionCode;
  field: string;
  message: string;
}>;

export type ExecutionValidationResult =
  | Readonly<{ ok: true; intent: ExecutionIntent; rejections: readonly [] }>
  | Readonly<{ ok: false; intent: null; rejections: readonly ExecutionRejection[] }>;

export type ExecutionBlockCode =
  | "GLOBAL_EXECUTION_DISABLED"
  | "USER_EXECUTION_DISABLED"
  | "ACCOUNT_EXECUTION_DISABLED"
  | "PROVIDER_STATE_STALE"
  | "MAINTENANCE_STOP"
  | "EMERGENCY_STOP"
  | "DUPLICATE_INTENT"
  | "ADAPTER_UNAVAILABLE";

export type ExecutionResult = Readonly<{
  intentId: string;
  idempotencyKey: string;
  state: "blocked" | "rejected";
  executed: false;
  duplicate: boolean;
  reason: ExecutionBlockCode | ExecutionRejectionCode;
  preview: Readonly<{
    symbol: string;
    side: "long" | "short";
    orderType: "market" | "limit";
    quantity: number;
    normalizedContractVolume: number;
    referencePrice: number;
    estimatedNotional: number;
    estimatedMargin: number;
    policyVersion: string;
    price?: number;
    leverage: number;
    reduceOnly: boolean;
  }> | null;
}>;
