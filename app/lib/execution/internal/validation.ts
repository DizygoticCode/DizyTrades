import "server-only";

import {
  isMexcStepAligned,
  quantizeMexcStep,
} from "../../mexc-contract-metadata";
import {
  EXECUTION_CONTRACT_VERSION,
  type ExecutionIntent,
  type ExecutionRejection,
  type ExecutionRejectionCode,
  type ExecutionPrerequisites,
  type ExecutionValidationResult,
} from "../types";
import { serverExecutionPolicy } from "./policy";

export type ExecutionIntentInput = Readonly<Record<string, unknown>>;
const identityPattern = /^[a-z0-9_-]{1,120}$/i;
const keyPattern = /^[a-zA-Z0-9_-]{8,120}$/;
const symbolPattern = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/;

export function validateExecutionIntent(
  input: ExecutionIntentInput,
  prerequisites: ExecutionPrerequisites,
  now: Date = new Date(),
): ExecutionValidationResult {
  const rejections: ExecutionRejection[] = [];
  const reject = (code: ExecutionRejectionCode, field: string, message: string) =>
    rejections.push(Object.freeze({ code, field, message }));
  const userId = typeof input.userId === "string" ? input.userId : "";
  const accountId = typeof input.accountId === "string" ? input.accountId : "";
  const intentId = typeof input.intentId === "string" ? input.intentId : "";
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
  const symbol = typeof input.symbol === "string" ? input.symbol : "";
  const requestedQuantity = typeof input.quantity === "number" ? input.quantity : NaN;
  const leverage = typeof input.leverage === "number" ? input.leverage : NaN;
  const price = typeof input.price === "number" ? input.price : undefined;
  const contract = prerequisites.contracts?.get(symbol);
  const policy = serverExecutionPolicy();
  const reference = prerequisites.referencePrices?.get(symbol);
  let quantity = requestedQuantity;

  if (![userId, accountId, intentId].every((value) => identityPattern.test(value))) reject("INVALID_IDENTITY", "identity", "User, account and intent identities are required.");
  if (!keyPattern.test(idempotencyKey)) reject("INVALID_IDEMPOTENCY_KEY", "idempotencyKey", "Idempotency key is invalid.");
  if (!symbolPattern.test(symbol)) reject("INVALID_SYMBOL", "symbol", "Symbol format is invalid.");
  else if (!contract) reject("UNKNOWN_SYMBOL", "symbol", "Symbol is not present in current contract metadata.");
  else if (!policy.allowedSymbols.includes(symbol)) reject("POLICY_SYMBOL_DENIED", "symbol", "Symbol is not allowed by server policy.");
  if (input.marketType !== "futures") reject("INVALID_SYMBOL", "marketType", "Only the current futures capability is represented.");
  if (input.side !== "long" && input.side !== "short") reject("INVALID_SIDE", "side", "Side must be long or short.");
  if (input.orderType !== "market" && input.orderType !== "limit") reject("INVALID_ORDER_TYPE", "orderType", "Order type must be market or limit.");
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) reject("INVALID_QUANTITY", "quantity", "Quantity must be positive and finite.");
  else if (contract) {
    const contractVolume = requestedQuantity / contract.contractSize;
    if (
      !Number.isFinite(contractVolume)
      || contractVolume < contract.minVol
      || contractVolume > contract.maxVol
      || !isMexcStepAligned(contractVolume, contract.volUnit)
    ) reject("INVALID_QUANTITY", "quantity", "Quantity must satisfy current contract volume limits and step size.");
    else {
      const normalizedVolume = quantizeMexcStep(contractVolume, contract.volUnit, "nearest");
      quantity = Number((normalizedVolume * contract.contractSize).toPrecision(15));
    }
  }
  if (input.orderType === "limit" && (!Number.isFinite(price) || price! <= 0)) reject("INVALID_PRICE", "price", "A positive finite price is required for a limit intent.");
  else if (input.orderType === "limit" && contract && !isMexcStepAligned(price!, contract.priceUnit)) reject("INVALID_PRICE", "price", "Limit price must align with the current contract price step.");
  if (input.orderType === "market" && input.price !== undefined) reject("INVALID_PRICE", "price", "Market intents cannot specify a price.");
  if (!Number.isInteger(leverage) || !contract || leverage < contract.minLeverage || leverage > contract.maxLeverage) reject("INVALID_LEVERAGE", "leverage", "Leverage is outside current contract metadata limits.");
  else if (leverage > policy.maximumLeverage) reject("POLICY_LEVERAGE_EXCEEDED", "leverage", "Leverage exceeds server policy.");
  if (typeof input.reduceOnly !== "boolean") reject("INVALID_REDUCE_ONLY", "reduceOnly", "Reduce-only intent must be explicit.");
  if (input.source !== "manual" && input.source !== "signal") reject("INVALID_SOURCE", "source", "Intent source is invalid.");
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : "";
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) reject("INVALID_TIMESTAMP", "createdAt", "Creation timestamp is invalid.");
  const nowMs = now.getTime();
  if (!reference || !Number.isFinite(reference.price) || reference.price <= 0 || !Number.isFinite(Date.parse(reference.observedAt))) {
    reject("REFERENCE_PRICE_MISSING", "referencePrice", "An authoritative reference price is required.");
  } else if (nowMs - Date.parse(reference.observedAt) < 0 || nowMs - Date.parse(reference.observedAt) > policy.maximumReferencePriceAgeMs) {
    reject("REFERENCE_PRICE_STALE", "referencePrice", "The authoritative reference price is stale.");
  }
  const account = prerequisites.accountState;
  if (!account || !identityPattern.test(account.userId) || !identityPattern.test(account.accountId)
    || !Number.isFinite(Date.parse(account.observedAt)) || !Array.isArray(account.positions)
    || account.positions.some((position) => !symbolPattern.test(position.symbol)
      || (position.side !== "long" && position.side !== "short")
      || !Number.isFinite(position.quantity) || position.quantity <= 0)) reject("ACCOUNT_STATE_MISSING", "accountState", "Valid account and position state is required.");
  else if (account.userId !== userId || account.accountId !== accountId) reject("ACCOUNT_STATE_IDENTITY_MISMATCH", "accountState", "Account state must belong to the validated user and account.");
  else if (nowMs - Date.parse(account.observedAt) < 0 || nowMs - Date.parse(account.observedAt) > policy.maximumAccountStateAgeMs) reject("ACCOUNT_STATE_STALE", "accountState", "Account state is stale.");
  if (contract && reference && Number.isFinite(quantity) && quantity > 0) {
    const valuationPrice = input.orderType === "limit" && Number.isFinite(price)
      ? Math.max(reference.price, price!)
      : reference.price;
    const notional = quantity * valuationPrice;
    if (!Number.isFinite(notional) || notional > policy.maximumOrderNotional) reject("POLICY_NOTIONAL_EXCEEDED", "quantity", "Estimated notional exceeds server policy.");
  }
  if (input.reduceOnly === true && account && account.userId === userId && account.accountId === accountId) {
    const opposingSide = input.side === "long" ? "short" : "long";
    const position = account.positions.find((item) => item.symbol === symbol && item.side === opposingSide);
    if (!position || !Number.isFinite(position.quantity) || position.quantity <= 0 || quantity > position.quantity) {
      reject("REDUCE_ONLY_VIOLATION", "reduceOnly", "Reduce-only intent must decrease an opposing supplied position without crossing zero.");
    }
  }
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
