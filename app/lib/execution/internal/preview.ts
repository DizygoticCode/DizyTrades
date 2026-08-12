import "server-only";

import type { ExecutionIntent, ExecutionResult } from "../types";
import { quantizeMexcStep } from "../../mexc-contract-metadata";
import type { ExecutionPrerequisites } from "../types";
import { serverExecutionPolicy } from "./policy";

export type ExecutionPreview = NonNullable<ExecutionResult["preview"]>;

export function createExecutionPreview(intent: ExecutionIntent, prerequisites: ExecutionPrerequisites): ExecutionPreview {
  const contract = prerequisites.contracts!.get(intent.symbol)!;
  const referencePrice = prerequisites.referencePrices!.get(intent.symbol)!.price;
  const normalizedContractVolume = quantizeMexcStep(
    intent.quantity / contract.contractSize,
    contract.volUnit,
    "nearest",
  );
  const quantity = Number((normalizedContractVolume * contract.contractSize).toPrecision(15));
  const valuationPrice = intent.orderType === "limit"
    ? Math.max(referencePrice, intent.price!)
    : referencePrice;
  const estimatedNotional = quantity * valuationPrice;
  return Object.freeze({
    symbol: intent.symbol, side: intent.side, orderType: intent.orderType,
    quantity, ...(intent.price === undefined ? {} : { price: intent.price }),
    leverage: intent.leverage, reduceOnly: intent.reduceOnly,
    normalizedContractVolume,
    referencePrice, estimatedNotional,
    estimatedMargin: estimatedNotional / intent.leverage,
    policyVersion: serverExecutionPolicy().version,
  });
}
