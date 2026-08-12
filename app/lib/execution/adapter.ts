import "server-only";

import type { ExecutionIntent, ExecutionResult } from "./types";

export interface ExecutionAdapter {
  readonly kind: "non-executing";
  prepare(intent: ExecutionIntent, reason: ExecutionResult["reason"]): ExecutionResult;
}

/** The only adapter in this repository. It has no transport or network dependency. */
export class NonExecutingExecutionAdapter implements ExecutionAdapter {
  readonly kind = "non-executing" as const;

  prepare(intent: ExecutionIntent, reason: ExecutionResult["reason"]): ExecutionResult {
    return Object.freeze({
      intentId: intent.intentId,
      idempotencyKey: intent.idempotencyKey,
      state: "blocked" as const,
      executed: false as const,
      duplicate: false,
      reason,
      preview: Object.freeze({
        symbol: intent.symbol,
        side: intent.side,
        orderType: intent.orderType,
        quantity: intent.quantity,
        ...(intent.price === undefined ? {} : { price: intent.price }),
        leverage: intent.leverage,
        reduceOnly: intent.reduceOnly,
      }),
    });
  }
}
