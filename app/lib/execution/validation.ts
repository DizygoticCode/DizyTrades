import "server-only";

import {
  isMexcStepAligned,
  type MexcContractMetadata,
} from "../mexc-contract-metadata";
import {
  EXECUTION_CONTRACT_VERSION,
  type ExecutionIntent,
  type ExecutionRejection,
  type ExecutionRejectionCode,
  type ExecutionValidationResult,
} from "./types";

export type ExecutionIntentInput = Readonly<Record<string, unknown>>;
export type ExecutionPrerequisites = Readonly<{
  contracts: ReadonlyMap<string, MexcContractMetadata>;
  accountStateFresh: boolean;
}>;

const identityPattern = /^[a-z0-9_-]{1,120}$/i;
const keyPattern = /^[a-zA-Z0-9_-]{8,120}$/;
const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;

export function validateExecutionIntent(
  input: ExecutionIntentInput,
  prerequisites: ExecutionPrerequisites,
): ExecutionValidationResult {
  const rejections: ExecutionRejection[] = [];
  const reject = (code: ExecutionRejectionCode, field: string, message: string) =>
    rejections.push(Object.freeze({ code, field, message }));
  const userId = typeof input.userId === "string" ? input.userId : "";
  const accountId = typeof input.accountId === "string" ? input.accountId : "";
  const intentId = typeof input.intentId === "string" ? input.intentId : "";
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
  const symbol = typeof input.symbol === "string" ? input.symbol : "";
  const quantity = typeof input.quantity === "number" ? input.quantity : NaN;
  const leverage = typeof input.leverage === "number" ? input.leverage : NaN;
  const price = typeof input.price === "number" ? input.price : undefined;
  const contract = prerequisites.contracts.get(symbol);

  if (![userId, accountId, intentId].every((value) => identityPattern.test(value))) reject("INVALID_IDENTITY", "identity", "User, account and intent identities are required.");
  if (!keyPattern.test(idempotencyKey)) reject("INVALID_IDEMPOTENCY_KEY", "idempotencyKey", "Idempotency key is invalid.");
  if (!symbolPattern.test(symbol)) reject("INVALID_SYMBOL", "symbol", "Symbol format is invalid.");
  else if (!contract) reject("UNKNOWN_SYMBOL", "symbol", "Symbol is not present in current contract metadata.");
  if (input.marketType !== "futures") reject("INVALID_SYMBOL", "marketType", "Only the current futures capability is represented.");
  if (input.side !== "long" && input.side !== "short") reject("INVALID_SIDE", "side", "Side must be long or short.");
  if (input.orderType !== "market" && input.orderType !== "limit") reject("INVALID_ORDER_TYPE", "orderType", "Order type must be market or limit.");
  if (!Number.isFinite(quantity) || quantity <= 0) reject("INVALID_QUANTITY", "quantity", "Quantity must be positive and finite.");
  else if (contract) {
    const contractVolume = quantity / contract.contractSize;
    if (
      !Number.isFinite(contractVolume)
      || contractVolume < contract.minVol
      || contractVolume > contract.maxVol
      || !isMexcStepAligned(contractVolume, contract.volUnit)
    ) reject("INVALID_QUANTITY", "quantity", "Quantity must satisfy current contract volume limits and step size.");
  }
  if (input.orderType === "limit" && (!Number.isFinite(price) || price! <= 0)) reject("INVALID_PRICE", "price", "A positive finite price is required for a limit intent.");
  else if (input.orderType === "limit" && contract && !isMexcStepAligned(price!, contract.priceUnit)) reject("INVALID_PRICE", "price", "Limit price must align with the current contract price step.");
  if (input.orderType === "market" && input.price !== undefined) reject("INVALID_PRICE", "price", "Market intents cannot specify a price.");
  if (!Number.isInteger(leverage) || !contract || leverage < contract.minLeverage || leverage > contract.maxLeverage) reject("INVALID_LEVERAGE", "leverage", "Leverage is outside current contract metadata limits.");
  if (typeof input.reduceOnly !== "boolean") reject("INVALID_REDUCE_ONLY", "reduceOnly", "Reduce-only intent must be explicit.");
  if (input.source !== "manual" && input.source !== "signal") reject("INVALID_SOURCE", "source", "Intent source is invalid.");
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : "";
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) reject("INVALID_TIMESTAMP", "createdAt", "Creation timestamp is invalid.");
  if (!prerequisites.accountStateFresh) reject("PREREQUISITE_STATE_STALE", "accountState", "Fresh prerequisite account state is required.");
  if (rejections.length) return Object.freeze({ ok: false, intent: null, rejections: Object.freeze(rejections) });

  const intent: ExecutionIntent = Object.freeze({
    contractVersion: EXECUTION_CONTRACT_VERSION,
    intentId, idempotencyKey, userId, accountId, symbol,
    marketType: "futures", side: input.side as "long" | "short",
    orderType: input.orderType as "market" | "limit", quantity,
    ...(price === undefined ? {} : { price }), leverage,
    reduceOnly: input.reduceOnly as boolean,
    source: input.source as "manual" | "signal", createdAt,
  });
  return Object.freeze({ ok: true, intent, rejections: Object.freeze([] as const) });
}
