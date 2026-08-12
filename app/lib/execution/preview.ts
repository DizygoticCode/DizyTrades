import "server-only";

import type { ExecutionIntent, ExecutionResult } from "./types";
import type { ExecutionPrerequisites } from "./validation";
import { serverExecutionPolicy } from "./policy";

export type ExecutionPreview = NonNullable<ExecutionResult["preview"]>;

export function createExecutionPreview(intent: ExecutionIntent, prerequisites: ExecutionPrerequisites): ExecutionPreview {
  const contract = prerequisites.contracts!.get(intent.symbol)!;
  const referencePrice = prerequisites.referencePrices!.get(intent.symbol)!.price;
  const estimatedNotional = intent.quantity * referencePrice;
  return Object.freeze({
    symbol: intent.symbol, side: intent.side, orderType: intent.orderType,
    quantity: intent.quantity, ...(intent.price === undefined ? {} : { price: intent.price }),
    leverage: intent.leverage, reduceOnly: intent.reduceOnly,
    normalizedContractVolume: intent.quantity / contract.contractSize,
    referencePrice, estimatedNotional,
    estimatedMargin: estimatedNotional / intent.leverage,
    policyVersion: serverExecutionPolicy().version,
  });
}
