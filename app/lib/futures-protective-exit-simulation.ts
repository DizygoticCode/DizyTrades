import {
  applyPendingOrderEvent,
  nextPendingOrderSequence,
  type PendingOrderFill,
  type PendingOrderState,
  type PendingOrderTimeInForce,
} from "./pending-order-lifecycle";
import {
  alignedToFuturesStep,
  futuresLimitRejectionReason,
  futuresQuantityRejectionReason,
  simulateFuturesLimitOrder,
  validateFuturesInstrumentRules,
  validateFuturesOrderBookSnapshot,
  type FuturesInstrumentRules,
} from "./futures-limit-order-simulation";
import type {FuturesConditionalMarketSnapshot} from "./futures-conditional-order-simulation";

export type FuturesProtectivePositionSide = "long" | "short";
export type FuturesProtectiveExitIntent = "take-profit" | "stop-loss";
export type FuturesProtectiveExitExecution = "market" | "limit";

export type FuturesProtectivePosition = Readonly<{
  tradeId: string;
  marketKey: string;
  symbol: string;
  side: FuturesProtectivePositionSide;
  remainingQuantity: number;
}>;

export type FuturesProtectiveExitObservation = Readonly<{
  observationId: string;
  sequence: number;
  observedAt: number;
  bookSequence: number;
  referencePrice: number;
  priceSource: FuturesConditionalMarketSnapshot["priceSource"];
  action: "waiting" | "triggered" | "resting-match" | "rejected";
  lifecycleEventFrom: number | null;
  lifecycleEventTo: number | null;
}>;

export type FuturesProtectiveExitState = Readonly<{
  order: PendingOrderState;
  target: FuturesProtectivePosition;
  intent: FuturesProtectiveExitIntent;
  execution: FuturesProtectiveExitExecution;
  requestedQuantity: number;
  acceptedQuantity: number;
  capped: boolean;
  observations: readonly FuturesProtectiveExitObservation[];
}>;

export type CreateFuturesProtectiveExitInput = Readonly<{
  orderId: string;
  ownerId: string;
  clientOrderId?: string;
  position: FuturesProtectivePosition;
  intent: FuturesProtectiveExitIntent;
  execution: FuturesProtectiveExitExecution;
  requestedQuantity: number;
  triggerPrice: number;
  limitPrice?: number;
  timeInForce?: PendingOrderTimeInForce;
  submittedAt: number;
}>;

export class FuturesProtectiveExitSimulationError extends Error {
  code: string;
  field: string;

  constructor(code: string, field: string, message: string) {
    super(message);
    this.name = "FuturesProtectiveExitSimulationError";
    this.code = code;
    this.field = field;
  }
}

const fail = (code: string, field: string, message: string): never => {
  throw new FuturesProtectiveExitSimulationError(code, field, message);
};

const positive = (value: number, field: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    fail("INVALID_PROTECTIVE_EXIT_VALUE", field, `${field} must be finite and greater than zero.`);
  }
};

const text = (value: string, field: string) => {
  if (!value.trim()) fail("INVALID_PROTECTIVE_EXIT_TEXT", field, `${field} is required.`);
};

const freezePosition = (position: FuturesProtectivePosition) => Object.freeze({...position});
const freezeObservations = (observations: readonly FuturesProtectiveExitObservation[]) =>
  Object.freeze(observations.map((observation) => Object.freeze({...observation})));
const freezeState = (
  state: Omit<FuturesProtectiveExitState, "target" | "observations"> & {
    target: FuturesProtectivePosition;
    observations: readonly FuturesProtectiveExitObservation[];
  },
): FuturesProtectiveExitState =>
  Object.freeze({
    ...state,
    target: freezePosition(state.target),
    observations: freezeObservations(state.observations),
  });

const exitSide = (positionSide: FuturesProtectivePositionSide) =>
  positionSide === "long" ? "sell" as const : "buy" as const;

const isTerminal = (order: PendingOrderState) =>
  order.status === "filled" ||
  order.status === "cancelled" ||
  order.status === "expired" ||
  order.status === "rejected" ||
  order.status === "replaced";

const eventId = (
  order: PendingOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
  label: string,
  index = 0,
) => `${order.spec.orderId}:protective-book-${snapshot.sequence}:${label}:${index}`;

const accept = (order: PendingOrderState, snapshot: FuturesConditionalMarketSnapshot) =>
  applyPendingOrderEvent(order, {
    type: "accepted",
    eventId: eventId(order, snapshot, "accepted"),
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at: snapshot.observedAt,
  });

const reject = (
  order: PendingOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
  reason: string,
) =>
  applyPendingOrderEvent(order, {
    type: "rejected",
    eventId: eventId(order, snapshot, "rejected"),
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at: snapshot.observedAt,
    reason,
  });

const activate = (order: PendingOrderState, snapshot: FuturesConditionalMarketSnapshot) =>
  applyPendingOrderEvent(order, {
    type: "activated",
    eventId: eventId(order, snapshot, "activated"),
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at: snapshot.observedAt,
  });

const cancelRemainder = (
  order: PendingOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
  reason: string,
) =>
  applyPendingOrderEvent(order, {
    type: "cancelled",
    eventId: eventId(order, snapshot, "cancelled"),
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at: snapshot.observedAt,
    reason,
  });

const validatePosition = (
  state: FuturesProtectiveExitState,
  position: FuturesProtectivePosition,
) => {
  text(position.tradeId, "position.tradeId");
  text(position.marketKey, "position.marketKey");
  text(position.symbol, "position.symbol");
  positive(position.remainingQuantity, "position.remainingQuantity");
  if (position.tradeId !== state.target.tradeId) {
    fail("STALE_PROTECTIVE_EXIT_TARGET", "position.tradeId", "Protective exit targets a different trade.");
  }
  if (position.side !== state.target.side) {
    fail("PROTECTIVE_EXIT_SIDE_MISMATCH", "position.side", "Protective exit targets a different position side.");
  }
  if (position.marketKey !== state.target.marketKey || position.symbol !== state.target.symbol) {
    fail("PROTECTIVE_EXIT_MARKET_MISMATCH", "position.marketKey", "Protective exit targets a different market.");
  }
  if (state.order.remainingQuantity - position.remainingQuantity > Math.max(1e-12, position.remainingQuantity * 1e-10)) {
    fail(
      "PROTECTIVE_EXIT_EXCEEDS_POSITION",
      "position.remainingQuantity",
      "Protective exit remainder exceeds the current position and could reverse it.",
    );
  }
  if (
    !state.order.spec.reduceOnly ||
    state.order.spec.parentOrderId !== position.tradeId ||
    state.order.spec.side !== exitSide(position.side)
  ) {
    fail("INVALID_REDUCE_ONLY_BINDING", "order.spec", "Protective exit is not bound reduce-only to the target position.");
  }
};

const validateContinuity = (
  state: FuturesProtectiveExitState,
  snapshot: FuturesConditionalMarketSnapshot,
) => {
  const previous = state.observations.at(-1);
  if (!previous) return;
  if (snapshot.sequence <= previous.bookSequence) {
    fail("NON_MONOTONIC_BOOK_SEQUENCE", "snapshot.sequence", "Protective exit observations require increasing book sequence.");
  }
  if (snapshot.observedAt < previous.observedAt) {
    fail("NON_MONOTONIC_OBSERVATION_TIME", "snapshot.observedAt", "Protective exit observation time cannot move backwards.");
  }
};

const rejectionReason = (state: FuturesProtectiveExitState, rules: FuturesInstrumentRules) => {
  const quantityReason = futuresQuantityRejectionReason(state.order.spec.quantity, rules);
  if (quantityReason) return quantityReason;
  if (!alignedToFuturesStep(state.order.spec.triggerPrice as number, rules.priceTick)) {
    return "TRIGGER_PRICE_PRECISION";
  }
  if (state.execution === "limit") {
    const limitReason = futuresLimitRejectionReason(state.order, rules);
    if (limitReason) return limitReason;
  }
  return null;
};

const triggerReached = (state: FuturesProtectiveExitState, referencePrice: number) => {
  const triggerPrice = state.order.spec.triggerPrice as number;
  const triggersAbove =
    (state.intent === "take-profit" && state.target.side === "long") ||
    (state.intent === "stop-loss" && state.target.side === "short");
  return triggersAbove ? referencePrice >= triggerPrice : referencePrice <= triggerPrice;
};

const executeMarket = (
  state: FuturesProtectiveExitState,
  order: PendingOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
) => {
  let next = activate(order, snapshot);
  const levels = order.spec.side === "buy" ? snapshot.asks : snapshot.bids;
  let remaining = next.remainingQuantity;
  for (let index = 0; index < levels.length && remaining > 0; index += 1) {
    const level = levels[index];
    const quantity = Math.min(remaining, level.quantity);
    const fill: PendingOrderFill = {
      fillId: eventId(order, snapshot, "fill", index),
      quantity,
      price: level.price,
      liquidityRole: "taker",
      evidence: {
        source: "futures-protective-order-book",
        phase: "activation",
        intent: state.intent,
        execution: state.execution,
        targetTradeId: state.target.tradeId,
        bookSequence: snapshot.sequence,
        observedAt: snapshot.observedAt,
        referencePrice: snapshot.referencePrice,
        priceSource: snapshot.priceSource,
        levelIndex: index,
        availableQuantity: level.quantity,
        matchedQuantity: quantity,
        triggerPrice: order.spec.triggerPrice as number,
      },
    };
    next = applyPendingOrderEvent(next, {
      type: "filled",
      eventId: eventId(order, snapshot, "filled-event", index),
      orderId: order.spec.orderId,
      sequence: nextPendingOrderSequence(next),
      at: snapshot.observedAt,
      fill,
    });
    remaining = next.remainingQuantity;
  }
  if (next.status === "filled") return next;
  return cancelRemainder(
    next,
    snapshot,
    next.filledQuantity > 0 ? "INSUFFICIENT_VISIBLE_DEPTH" : "NO_VISIBLE_LIQUIDITY",
  );
};

const appendObservation = (
  previous: FuturesProtectiveExitState,
  order: PendingOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
  action: FuturesProtectiveExitObservation["action"],
) => {
  const before = previous.order.events.length;
  const after = order.events.length;
  return freezeState({
    ...previous,
    order,
    observations: [
      ...previous.observations,
      {
        observationId: `${order.spec.orderId}:protective-observation:${previous.observations.length + 1}`,
        sequence: previous.observations.length + 1,
        observedAt: snapshot.observedAt,
        bookSequence: snapshot.sequence,
        referencePrice: snapshot.referencePrice,
        priceSource: snapshot.priceSource,
        action,
        lifecycleEventFrom: after > before ? before + 1 : null,
        lifecycleEventTo: after > before ? after : null,
      },
    ],
  });
};

export function createFuturesProtectiveExit(
  input: CreateFuturesProtectiveExitInput,
): FuturesProtectiveExitState {
  text(input.orderId, "orderId");
  text(input.ownerId, "ownerId");
  text(input.position.tradeId, "position.tradeId");
  text(input.position.marketKey, "position.marketKey");
  text(input.position.symbol, "position.symbol");
  positive(input.position.remainingQuantity, "position.remainingQuantity");
  positive(input.requestedQuantity, "requestedQuantity");
  positive(input.triggerPrice, "triggerPrice");
  if (input.execution === "limit") positive(input.limitPrice as number, "limitPrice");
  if (input.execution === "market" && input.limitPrice !== undefined) {
    fail("UNEXPECTED_LIMIT_PRICE", "limitPrice", "Market protective exits cannot carry a limit price.");
  }
  const acceptedQuantity = Math.min(input.requestedQuantity, input.position.remainingQuantity);
  const capped = acceptedQuantity < input.requestedQuantity;
  const timeInForce = input.execution === "market" ? "GTC" : input.timeInForce ?? "GTC";
  const kind = input.execution === "market" ? "trigger-market" : "trigger-limit";
  const spec = {
    orderId: input.orderId,
    ownerId: input.ownerId,
    marketKey: input.position.marketKey,
    marketType: "futures" as const,
    symbol: input.position.symbol,
    side: exitSide(input.position.side),
    kind,
    quantity: acceptedQuantity,
    timeInForce,
    reduceOnly: true,
    postOnly: false,
    submittedAt: input.submittedAt,
    clientOrderId: input.clientOrderId,
    parentOrderId: input.position.tradeId,
    triggerPrice: input.triggerPrice,
    limitPrice: input.execution === "limit" ? input.limitPrice : undefined,
  };
  const order = applyPendingOrderEvent(null, {
    type: "submitted",
    eventId: `${input.orderId}:submitted`,
    orderId: input.orderId,
    sequence: 1,
    at: input.submittedAt,
    spec,
  });
  return freezeState({
    order,
    target: input.position,
    intent: input.intent,
    execution: input.execution,
    requestedQuantity: input.requestedQuantity,
    acceptedQuantity,
    capped,
    observations: [],
  });
}

export function simulateFuturesProtectiveExit(
  state: FuturesProtectiveExitState,
  position: FuturesProtectivePosition,
  snapshot: FuturesConditionalMarketSnapshot,
  rules: FuturesInstrumentRules,
): FuturesProtectiveExitState {
  validatePosition(state, position);
  validateFuturesInstrumentRules(rules);
  validateFuturesOrderBookSnapshot(state.order, snapshot);
  validateContinuity(state, snapshot);
  if (!Number.isFinite(snapshot.referencePrice) || snapshot.referencePrice <= 0) {
    fail("INVALID_REFERENCE_PRICE", "snapshot.referencePrice", "Reference price must be finite and positive.");
  }
  if (isTerminal(state.order)) {
    fail("ORDER_ALREADY_TERMINAL", "order.status", "A terminal protective exit cannot consume another observation.");
  }
  if (state.order.status === "working" || state.order.status === "partially-filled") {
    if (state.execution !== "limit") {
      fail("INVALID_ACTIVE_STATE", "order.status", "Only limit protective exits may remain active.");
    }
    const next = simulateFuturesLimitOrder(state.order, snapshot, rules, "resting");
    return appendObservation(state, next, snapshot, "resting-match");
  }
  let order = state.order;
  if (order.status === "submitted") {
    const reason = rejectionReason(state, rules);
    if (reason) return appendObservation(state, reject(order, snapshot, reason), snapshot, "rejected");
    order = accept(order, snapshot);
  } else if (order.status !== "accepted") {
    fail("INVALID_PROTECTIVE_EXIT_STATE", "order.status", "Protective exit requires a submitted or accepted order.");
  }
  if (!triggerReached(state, snapshot.referencePrice)) {
    return appendObservation(state, order, snapshot, "waiting");
  }
  const next = state.execution === "limit"
    ? simulateFuturesLimitOrder(order, snapshot, rules, "activation")
    : executeMarket(state, order, snapshot);
  return appendObservation(state, next, snapshot, "triggered");
}

export function replayFuturesProtectiveExit(
  state: FuturesProtectiveExitState,
  position: FuturesProtectivePosition,
  snapshots: readonly FuturesConditionalMarketSnapshot[],
  rules: FuturesInstrumentRules,
) {
  if (snapshots.length === 0) {
    fail("MISSING_OBSERVATIONS", "snapshots", "At least one protective-exit observation is required.");
  }
  let next = state;
  for (const snapshot of snapshots) {
    next = simulateFuturesProtectiveExit(next, position, snapshot, rules);
  }
  return next;
}
