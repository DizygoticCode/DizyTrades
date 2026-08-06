import {
  applyPendingOrderEvent,
  nextPendingOrderSequence,
  type PendingOrderFill,
  type PendingOrderState,
} from "./pending-order-lifecycle";
import {
  alignedToFuturesStep,
  futuresQuantityRejectionReason,
  validateFuturesInstrumentRules,
  validateFuturesOrderBookSnapshot,
  type FuturesInstrumentRules,
  type FuturesOrderBookSnapshot,
} from "./futures-limit-order-simulation";

export type FuturesPositionMode = "hedge" | "one-way";

export type FuturesChaseLimitSnapshot = FuturesOrderBookSnapshot &
  Readonly<{
    lastPrice: number;
    observedMakerFillQuantity?: number;
  }>;

export type FuturesChaseLimitContext = Readonly<{
  positionMode: FuturesPositionMode;
}>;

export type FuturesChaseLimitAction =
  | "accepted"
  | "repriced"
  | "partially-filled"
  | "filled"
  | "distance-cancelled"
  | "rejected";

export type FuturesChaseLimitObservation = Readonly<{
  observationId: string;
  sequence: number;
  observedAt: number;
  bookSequence: number;
  lastPrice: number;
  bestQuotePrice: number;
  action: FuturesChaseLimitAction;
  previousLimitPrice: number;
  currentLimitPrice: number;
  chaseBoundaryPrice: number;
  observedMakerFillQuantity: number;
  lifecycleEventFrom: number | null;
  lifecycleEventTo: number | null;
}>;

export type FuturesChaseLimitState = Readonly<{
  order: PendingOrderState;
  positionMode: FuturesPositionMode;
  initialLimitPrice: number;
  currentLimitPrice: number;
  chaseBoundaryPrice: number;
  observations: readonly FuturesChaseLimitObservation[];
}>;

export class FuturesChaseLimitSimulationError extends Error {
  code: string;
  field: string;

  constructor(code: string, field: string, message: string) {
    super(message);
    this.name = "FuturesChaseLimitSimulationError";
    this.code = code;
    this.field = field;
  }
}

const fail = (code: string, field: string, message: string): never => {
  throw new FuturesChaseLimitSimulationError(code, field, message);
};

const isTerminal = (order: PendingOrderState) =>
  order.status === "filled" ||
  order.status === "cancelled" ||
  order.status === "expired" ||
  order.status === "rejected" ||
  order.status === "replaced";

const freezeState = (
  order: PendingOrderState,
  positionMode: FuturesPositionMode,
  initialLimitPrice: number,
  currentLimitPrice: number,
  chaseBoundaryPrice: number,
  observations: readonly FuturesChaseLimitObservation[],
): FuturesChaseLimitState =>
  Object.freeze({
    order,
    positionMode,
    initialLimitPrice,
    currentLimitPrice,
    chaseBoundaryPrice,
    observations: Object.freeze(observations.map((observation) => Object.freeze({...observation}))),
  });

const bestQuote = (order: PendingOrderState, snapshot: FuturesChaseLimitSnapshot) => {
  const level = order.spec.side === "buy" ? snapshot.bids[0] : snapshot.asks[0];
  if (!level) {
    fail("MISSING_BEST_QUOTE", "snapshot", "Chase-limit simulation requires a same-side best quote.");
  }
  return level.price;
};

const rejectionReason = (
  order: PendingOrderState,
  snapshot: FuturesChaseLimitSnapshot,
  rules: FuturesInstrumentRules,
  context: FuturesChaseLimitContext,
) => {
  if (context.positionMode !== "hedge") return "CHASE_REQUIRES_HEDGE_MODE";
  if (order.spec.timeInForce !== "GTC") return "CHASE_REQUIRES_GTC";

  const quantityReason = futuresQuantityRejectionReason(order.spec.quantity, rules);
  if (quantityReason) return quantityReason;

  const initialLimitPrice = order.spec.limitPrice;
  if (
    initialLimitPrice === undefined ||
    !alignedToFuturesStep(initialLimitPrice, rules.priceTick)
  ) {
    return "INITIAL_LIMIT_PRICE_PRECISION";
  }

  const protectionDistance = order.spec.protectionDistance;
  if (
    protectionDistance === undefined ||
    !Number.isFinite(protectionDistance) ||
    protectionDistance <= 0 ||
    !alignedToFuturesStep(protectionDistance, rules.priceTick)
  ) {
    return "PROTECTION_DISTANCE_PRECISION";
  }

  const quote = bestQuote(order, snapshot);
  if (!alignedToFuturesStep(quote, rules.priceTick)) return "BEST_QUOTE_PRECISION";
  if (Math.abs(initialLimitPrice - quote) > rules.priceTick * 1e-9) {
    return "INITIAL_LIMIT_PRICE_MUST_MATCH_BEST_QUOTE";
  }

  if (order.spec.side === "sell" && initialLimitPrice - protectionDistance <= 0) {
    return "INVALID_SELL_CHASE_BOUNDARY";
  }
  return null;
};

const eventId = (
  order: PendingOrderState,
  snapshot: FuturesChaseLimitSnapshot,
  label: string,
  index = 0,
) => `${order.spec.orderId}:chase-book-${snapshot.sequence}:${label}:${index}`;

const acceptAndActivate = (
  order: PendingOrderState,
  snapshot: FuturesChaseLimitSnapshot,
) => {
  const accepted = applyPendingOrderEvent(order, {
    type: "accepted",
    eventId: eventId(order, snapshot, "accepted"),
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at: snapshot.observedAt,
  });
  return applyPendingOrderEvent(accepted, {
    type: "activated",
    eventId: eventId(order, snapshot, "activated"),
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(accepted),
    at: snapshot.observedAt,
  });
};

const reject = (
  order: PendingOrderState,
  snapshot: FuturesChaseLimitSnapshot,
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

const cancelAtDistance = (
  order: PendingOrderState,
  snapshot: FuturesChaseLimitSnapshot,
) =>
  applyPendingOrderEvent(order, {
    type: "cancelled",
    eventId: eventId(order, snapshot, "distance-cancelled"),
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at: snapshot.observedAt,
    reason: "MAXIMUM_CHASE_DISTANCE_REACHED",
  });

const applyObservedMakerFill = (
  order: PendingOrderState,
  snapshot: FuturesChaseLimitSnapshot,
  currentLimitPrice: number,
  quantity: number,
) => {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    fail(
      "INVALID_OBSERVED_MAKER_FILL",
      "snapshot.observedMakerFillQuantity",
      "Observed maker fill quantity must be finite and positive.",
    );
  }
  if (quantity > order.remainingQuantity + Math.max(1e-12, order.spec.quantity * 1e-12)) {
    fail(
      "OBSERVED_MAKER_FILL_EXCEEDS_REMAINDER",
      "snapshot.observedMakerFillQuantity",
      "Observed maker fill quantity cannot exceed the remaining order quantity.",
    );
  }

  const fill: PendingOrderFill = {
    fillId: eventId(order, snapshot, "maker-fill"),
    quantity,
    price: currentLimitPrice,
    liquidityRole: "maker",
    evidence: {
      source: "explicit-chase-maker-fill-observation",
      bookSequence: snapshot.sequence,
      observedAt: snapshot.observedAt,
      lastPrice: snapshot.lastPrice,
      currentLimitPrice,
      observedMakerFillQuantity: quantity,
      queuePositionKnown: false,
    },
  };
  return applyPendingOrderEvent(order, {
    type: "filled",
    eventId: eventId(order, snapshot, "maker-filled-event"),
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at: snapshot.observedAt,
    fill,
  });
};

const appendObservation = (
  previous: FuturesChaseLimitState,
  order: PendingOrderState,
  snapshot: FuturesChaseLimitSnapshot,
  action: FuturesChaseLimitAction,
  previousLimitPrice: number,
  currentLimitPrice: number,
  observedMakerFillQuantity: number,
) => {
  const before = previous.order.events.length;
  const after = order.events.length;
  const observation: FuturesChaseLimitObservation = {
    observationId: `${order.spec.orderId}:chase-observation:${previous.observations.length + 1}`,
    sequence: previous.observations.length + 1,
    observedAt: snapshot.observedAt,
    bookSequence: snapshot.sequence,
    lastPrice: snapshot.lastPrice,
    bestQuotePrice: bestQuote(order, snapshot),
    action,
    previousLimitPrice,
    currentLimitPrice,
    chaseBoundaryPrice: previous.chaseBoundaryPrice,
    observedMakerFillQuantity,
    lifecycleEventFrom: after > before ? before + 1 : null,
    lifecycleEventTo: after > before ? after : null,
  };
  return freezeState(
    order,
    previous.positionMode,
    previous.initialLimitPrice,
    currentLimitPrice,
    previous.chaseBoundaryPrice,
    [...previous.observations, observation],
  );
};

const initialise = (
  order: PendingOrderState,
  snapshot: FuturesChaseLimitSnapshot,
  rules: FuturesInstrumentRules,
  context: FuturesChaseLimitContext,
) => {
  if (order.spec.marketType !== "futures") {
    fail("UNSUPPORTED_MARKET_TYPE", "order.spec.marketType", "Chase-limit simulation requires a futures order.");
  }
  if (order.spec.kind !== "chase-limit") {
    fail("UNSUPPORTED_ORDER_KIND", "order.spec.kind", "Chase-limit simulation requires a chase-limit order.");
  }
  if (order.status !== "submitted") {
    fail("INVALID_SUBMISSION_STATE", "order.status", "Initial chase-limit simulation requires a submitted order.");
  }

  const reason = rejectionReason(order, snapshot, rules, context);
  const initialLimitPrice = order.spec.limitPrice as number;
  const protectionDistance = order.spec.protectionDistance as number;
  const boundary =
    order.spec.side === "buy"
      ? initialLimitPrice + protectionDistance
      : initialLimitPrice - protectionDistance;

  if (reason) {
    const rejected = reject(order, snapshot, reason);
    const base = freezeState(
      rejected,
      context.positionMode,
      initialLimitPrice,
      initialLimitPrice,
      boundary,
      [],
    );
    return appendObservation(
      base,
      rejected,
      snapshot,
      "rejected",
      initialLimitPrice,
      initialLimitPrice,
      0,
    );
  }

  const active = acceptAndActivate(order, snapshot);
  const base = freezeState(
    active,
    context.positionMode,
    initialLimitPrice,
    initialLimitPrice,
    boundary,
    [],
  );
  return appendObservation(
    base,
    active,
    snapshot,
    "accepted",
    initialLimitPrice,
    initialLimitPrice,
    0,
  );
};

const validateContinuation = (
  state: FuturesChaseLimitState,
  snapshot: FuturesChaseLimitSnapshot,
  rules: FuturesInstrumentRules,
  context: FuturesChaseLimitContext,
) => {
  if (isTerminal(state.order)) {
    fail("ORDER_ALREADY_TERMINAL", "order.status", "A terminal chase-limit order cannot consume another observation.");
  }
  if (context.positionMode !== state.positionMode) {
    fail("POSITION_MODE_CHANGED", "context.positionMode", "Position mode cannot change during a chase-limit lifecycle.");
  }
  const previous = state.observations.at(-1);
  if (!previous) {
    fail("MISSING_CHASE_HISTORY", "observations", "Active chase-limit state requires an observation history.");
  }
  if (snapshot.sequence <= previous.bookSequence) {
    fail(
      "NON_MONOTONIC_BOOK_SEQUENCE",
      "snapshot.sequence",
      "Chase-limit observations require a strictly increasing book sequence.",
    );
  }
  if (snapshot.observedAt < previous.observedAt) {
    fail(
      "NON_MONOTONIC_OBSERVATION_TIME",
      "snapshot.observedAt",
      "Chase-limit observation time cannot move backwards.",
    );
  }
  if (!alignedToFuturesStep(bestQuote(state.order, snapshot), rules.priceTick)) {
    fail("BEST_QUOTE_PRECISION", "snapshot", "Best quote must align to the futures price tick.");
  }
};

const distanceReached = (
  state: FuturesChaseLimitState,
  snapshot: FuturesChaseLimitSnapshot,
) =>
  state.order.spec.side === "buy"
    ? snapshot.lastPrice >= state.chaseBoundaryPrice
    : snapshot.lastPrice <= state.chaseBoundaryPrice;

export function simulateFuturesChaseLimitOrder(
  input: PendingOrderState | FuturesChaseLimitState,
  snapshot: FuturesChaseLimitSnapshot,
  rules: FuturesInstrumentRules,
  context: FuturesChaseLimitContext,
): FuturesChaseLimitState {
  validateFuturesInstrumentRules(rules);

  const initial = "order" in input ? null : input;
  const validationOrder = initial ?? input.order;
  validateFuturesOrderBookSnapshot(validationOrder, snapshot);
  if (!Number.isFinite(snapshot.lastPrice) || snapshot.lastPrice <= 0) {
    fail("INVALID_LAST_PRICE", "snapshot.lastPrice", "Last price must be finite and positive.");
  }

  if (initial) return initialise(initial, snapshot, rules, context);

  const state = input;
  validateContinuation(state, snapshot, rules, context);
  const previousLimitPrice = state.currentLimitPrice;

  if (distanceReached(state, snapshot)) {
    const cancelled = cancelAtDistance(state.order, snapshot);
    return appendObservation(
      state,
      cancelled,
      snapshot,
      "distance-cancelled",
      previousLimitPrice,
      previousLimitPrice,
      0,
    );
  }

  const currentLimitPrice = bestQuote(state.order, snapshot);
  const observedMakerFillQuantity = snapshot.observedMakerFillQuantity ?? 0;
  if (
    observedMakerFillQuantity > 0 &&
    !alignedToFuturesStep(observedMakerFillQuantity, rules.quantityStep)
  ) {
    fail(
      "OBSERVED_MAKER_FILL_PRECISION",
      "snapshot.observedMakerFillQuantity",
      "Observed maker fill quantity must align to the futures quantity step.",
    );
  }

  let order = state.order;
  if (observedMakerFillQuantity > 0) {
    order = applyObservedMakerFill(
      order,
      snapshot,
      currentLimitPrice,
      observedMakerFillQuantity,
    );
  }

  const action: FuturesChaseLimitAction =
    order.status === "filled"
      ? "filled"
      : observedMakerFillQuantity > 0
        ? "partially-filled"
        : currentLimitPrice !== previousLimitPrice
          ? "repriced"
          : "accepted";

  return appendObservation(
    state,
    order,
    snapshot,
    action,
    previousLimitPrice,
    currentLimitPrice,
    observedMakerFillQuantity,
  );
}

export function replayFuturesChaseLimitOrder(
  order: PendingOrderState,
  snapshots: readonly FuturesChaseLimitSnapshot[],
  rules: FuturesInstrumentRules,
  context: FuturesChaseLimitContext,
) {
  if (snapshots.length === 0) {
    fail("MISSING_OBSERVATIONS", "snapshots", "At least one chase-limit observation is required.");
  }
  let state: PendingOrderState | FuturesChaseLimitState = order;
  for (const snapshot of snapshots) {
    state = simulateFuturesChaseLimitOrder(state, snapshot, rules, context);
  }
  return state as FuturesChaseLimitState;
}
