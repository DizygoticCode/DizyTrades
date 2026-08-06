import {
  applyPendingOrderEvent,
  nextPendingOrderSequence,
  type PendingOrderFill,
  type PendingOrderState,
} from "./pending-order-lifecycle";
import {
  alignedToFuturesStep,
  futuresLimitRejectionReason,
  futuresQuantityRejectionReason,
  simulateFuturesLimitOrder,
  validateFuturesInstrumentRules,
  validateFuturesOrderBookSnapshot,
  type FuturesInstrumentRules,
  type FuturesOrderBookSnapshot,
} from "./futures-limit-order-simulation";

export type FuturesConditionalPriceSource = "last" | "fair" | "mark";

export type FuturesConditionalMarketSnapshot = FuturesOrderBookSnapshot &
  Readonly<{
    referencePrice: number;
    priceSource: FuturesConditionalPriceSource;
  }>;

export type FuturesConditionalAction =
  | "waiting"
  | "tracking"
  | "triggered"
  | "resting-match"
  | "rejected";

export type FuturesConditionalObservation = Readonly<{
  observationId: string;
  sequence: number;
  observedAt: number;
  bookSequence: number;
  referencePrice: number;
  priceSource: FuturesConditionalPriceSource;
  action: FuturesConditionalAction;
  trailingExtreme: number | null;
  effectiveTriggerPrice: number | null;
  lifecycleEventFrom: number | null;
  lifecycleEventTo: number | null;
}>;

export type FuturesConditionalOrderState = Readonly<{
  order: PendingOrderState;
  trailingExtreme: number | null;
  effectiveTriggerPrice: number | null;
  observations: readonly FuturesConditionalObservation[];
}>;

export class FuturesConditionalSimulationError extends Error {
  code: string;
  field: string;

  constructor(code: string, field: string, message: string) {
    super(message);
    this.name = "FuturesConditionalSimulationError";
    this.code = code;
    this.field = field;
  }
}

const fail = (code: string, field: string, message: string): never => {
  throw new FuturesConditionalSimulationError(code, field, message);
};

const isConditionalKind = (kind: PendingOrderState["spec"]["kind"]) =>
  kind === "trigger-market" || kind === "trigger-limit" || kind === "trailing-stop";

const eventId = (
  order: PendingOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
  label: string,
  index = 0,
) => `${order.spec.orderId}:conditional-book-${snapshot.sequence}:${label}:${index}`;

const freezeState = (
  order: PendingOrderState,
  trailingExtreme: number | null,
  effectiveTriggerPrice: number | null,
  observations: readonly FuturesConditionalObservation[],
): FuturesConditionalOrderState =>
  Object.freeze({
    order,
    trailingExtreme,
    effectiveTriggerPrice,
    observations: Object.freeze(observations.map((observation) => Object.freeze({...observation}))),
  });

const wrap = (input: PendingOrderState | FuturesConditionalOrderState) =>
  "order" in input ? input : freezeState(input, null, null, []);

const validateContinuity = (
  state: FuturesConditionalOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
) => {
  const previous = state.observations.at(-1);
  if (!previous) return;
  if (snapshot.sequence <= previous.bookSequence) {
    fail(
      "NON_MONOTONIC_BOOK_SEQUENCE",
      "snapshot.sequence",
      "Conditional observations require a strictly increasing book sequence.",
    );
  }
  if (snapshot.observedAt < previous.observedAt) {
    fail(
      "NON_MONOTONIC_OBSERVATION_TIME",
      "snapshot.observedAt",
      "Conditional observation time cannot move backwards.",
    );
  }
};

const validateSnapshot = (
  state: FuturesConditionalOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
  rules: FuturesInstrumentRules,
) => {
  validateFuturesInstrumentRules(rules);
  validateFuturesOrderBookSnapshot(state.order, snapshot);
  validateContinuity(state, snapshot);
  if (!Number.isFinite(snapshot.referencePrice) || snapshot.referencePrice <= 0) {
    fail("INVALID_REFERENCE_PRICE", "snapshot.referencePrice", "Reference price must be finite and positive.");
  }
};

const conditionalRejectionReason = (
  order: PendingOrderState,
  rules: FuturesInstrumentRules,
) => {
  const quantityReason = futuresQuantityRejectionReason(order.spec.quantity, rules);
  if (quantityReason) return quantityReason;

  if (order.spec.kind === "trigger-limit") {
    const limitReason = futuresLimitRejectionReason(order, rules);
    if (limitReason) return limitReason;
  }

  if (order.spec.kind === "trigger-market" || order.spec.kind === "trigger-limit") {
    if (
      order.spec.triggerPrice === undefined ||
      !alignedToFuturesStep(order.spec.triggerPrice, rules.priceTick)
    ) {
      return "TRIGGER_PRICE_PRECISION";
    }
  }

  if (order.spec.kind === "trailing-stop") {
    const callbackRate = order.spec.callbackRate;
    if (
      callbackRate === undefined ||
      !Number.isFinite(callbackRate) ||
      callbackRate <= 0 ||
      callbackRate > 100
    ) {
      return "INVALID_CALLBACK_RATE";
    }
    if (
      order.spec.activationPrice !== undefined &&
      !alignedToFuturesStep(order.spec.activationPrice, rules.priceTick)
    ) {
      return "ACTIVATION_PRICE_PRECISION";
    }
  }
  return null;
};

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

const executeTriggeredMarket = (
  order: PendingOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
  trailingExtreme: number | null,
  effectiveTriggerPrice: number | null,
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
        source: "futures-conditional-order-book",
        phase: "activation",
        conditionalKind: order.spec.kind,
        bookSequence: snapshot.sequence,
        observedAt: snapshot.observedAt,
        referencePrice: snapshot.referencePrice,
        priceSource: snapshot.priceSource,
        levelIndex: index,
        availableQuantity: level.quantity,
        matchedQuantity: quantity,
        triggerPrice: order.spec.triggerPrice ?? null,
        activationPrice: order.spec.activationPrice ?? null,
        callbackRate: order.spec.callbackRate ?? null,
        trailingExtreme,
        effectiveTriggerPrice,
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
  previous: FuturesConditionalOrderState,
  order: PendingOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
  action: FuturesConditionalAction,
  trailingExtreme: number | null,
  effectiveTriggerPrice: number | null,
) => {
  const before = previous.order.events.length;
  const after = order.events.length;
  const observation: FuturesConditionalObservation = {
    observationId: `${order.spec.orderId}:conditional-observation:${previous.observations.length + 1}`,
    sequence: previous.observations.length + 1,
    observedAt: snapshot.observedAt,
    bookSequence: snapshot.sequence,
    referencePrice: snapshot.referencePrice,
    priceSource: snapshot.priceSource,
    action,
    trailingExtreme,
    effectiveTriggerPrice,
    lifecycleEventFrom: after > before ? before + 1 : null,
    lifecycleEventTo: after > before ? after : null,
  };
  return freezeState(
    order,
    trailingExtreme,
    effectiveTriggerPrice,
    [...previous.observations, observation],
  );
};

const triggerReached = (order: PendingOrderState, referencePrice: number) => {
  const triggerPrice = order.spec.triggerPrice as number;
  return order.spec.side === "buy"
    ? referencePrice >= triggerPrice
    : referencePrice <= triggerPrice;
};

const trailingActivated = (order: PendingOrderState, referencePrice: number) => {
  const activationPrice = order.spec.activationPrice;
  if (activationPrice === undefined) return true;
  return order.spec.side === "sell"
    ? referencePrice >= activationPrice
    : referencePrice <= activationPrice;
};

const nextTrailingExtreme = (
  order: PendingOrderState,
  current: number | null,
  referencePrice: number,
) => {
  if (current === null) return referencePrice;
  return order.spec.side === "sell"
    ? Math.max(current, referencePrice)
    : Math.min(current, referencePrice);
};

const trailingTriggerPrice = (order: PendingOrderState, extreme: number) => {
  const callbackFraction = (order.spec.callbackRate as number) / 100;
  return order.spec.side === "sell"
    ? extreme * (1 - callbackFraction)
    : extreme * (1 + callbackFraction);
};

export function simulateFuturesConditionalOrder(
  input: PendingOrderState | FuturesConditionalOrderState,
  snapshot: FuturesConditionalMarketSnapshot,
  rules: FuturesInstrumentRules,
): FuturesConditionalOrderState {
  const state = wrap(input);
  validateSnapshot(state, snapshot, rules);

  if (state.order.spec.marketType !== "futures") {
    fail("UNSUPPORTED_MARKET_TYPE", "order.spec.marketType", "Conditional simulation requires a futures order.");
  }
  if (!isConditionalKind(state.order.spec.kind)) {
    fail("UNSUPPORTED_ORDER_KIND", "order.spec.kind", "Conditional simulation requires a trigger or trailing order.");
  }
  if (
    state.order.status === "filled" ||
    state.order.status === "cancelled" ||
    state.order.status === "expired" ||
    state.order.status === "rejected" ||
    state.order.status === "replaced"
  ) {
    fail("ORDER_ALREADY_TERMINAL", "order.status", "A terminal conditional order cannot consume another observation.");
  }

  if (state.order.status === "working" || state.order.status === "partially-filled") {
    if (state.order.spec.kind !== "trigger-limit") {
      fail("INVALID_ACTIVE_STATE", "order.status", "Only triggered limit orders may remain active.");
    }
    const next = simulateFuturesLimitOrder(state.order, snapshot, rules, "resting");
    return appendObservation(
      state,
      next,
      snapshot,
      "resting-match",
      state.trailingExtreme,
      state.effectiveTriggerPrice,
    );
  }

  let order = state.order;
  if (order.status === "submitted") {
    const reason = conditionalRejectionReason(order, rules);
    if (reason) {
      const rejected = reject(order, snapshot, reason);
      return appendObservation(state, rejected, snapshot, "rejected", null, null);
    }
    order = accept(order, snapshot);
  } else if (order.status !== "accepted") {
    fail("INVALID_CONDITIONAL_STATE", "order.status", "Conditional matching requires a submitted or accepted order.");
  }

  if (order.spec.kind === "trigger-market" || order.spec.kind === "trigger-limit") {
    const effectiveTriggerPrice = order.spec.triggerPrice as number;
    if (!triggerReached(order, snapshot.referencePrice)) {
      return appendObservation(
        state,
        order,
        snapshot,
        "waiting",
        null,
        effectiveTriggerPrice,
      );
    }
    const next =
      order.spec.kind === "trigger-limit"
        ? simulateFuturesLimitOrder(order, snapshot, rules, "activation")
        : executeTriggeredMarket(order, snapshot, null, effectiveTriggerPrice);
    return appendObservation(state, next, snapshot, "triggered", null, effectiveTriggerPrice);
  }

  if (!trailingActivated(order, snapshot.referencePrice) && state.trailingExtreme === null) {
    return appendObservation(state, order, snapshot, "waiting", null, null);
  }

  const trailingExtreme = nextTrailingExtreme(
    order,
    state.trailingExtreme,
    snapshot.referencePrice,
  );
  const effectiveTriggerPrice = trailingTriggerPrice(order, trailingExtreme);
  const triggered =
    order.spec.side === "sell"
      ? snapshot.referencePrice <= effectiveTriggerPrice
      : snapshot.referencePrice >= effectiveTriggerPrice;

  if (!triggered) {
    return appendObservation(
      state,
      order,
      snapshot,
      "tracking",
      trailingExtreme,
      effectiveTriggerPrice,
    );
  }

  const next = executeTriggeredMarket(
    order,
    snapshot,
    trailingExtreme,
    effectiveTriggerPrice,
  );
  return appendObservation(
    state,
    next,
    snapshot,
    "triggered",
    trailingExtreme,
    effectiveTriggerPrice,
  );
}

export function replayFuturesConditionalOrder(
  order: PendingOrderState,
  snapshots: readonly FuturesConditionalMarketSnapshot[],
  rules: FuturesInstrumentRules,
) {
  if (snapshots.length === 0) {
    fail("MISSING_OBSERVATIONS", "snapshots", "At least one conditional observation is required.");
  }
  let state: PendingOrderState | FuturesConditionalOrderState = order;
  for (const snapshot of snapshots) {
    state = simulateFuturesConditionalOrder(state, snapshot, rules);
  }
  return state as FuturesConditionalOrderState;
}
