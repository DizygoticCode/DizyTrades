import {
  applyPendingOrderEvent,
  nextPendingOrderSequence,
  replacePendingOrder,
  type PendingOrderFill,
  type PendingOrderSpec,
  type PendingOrderState,
} from "./pending-order-lifecycle";

export type SpotInstrumentRules = Readonly<{
  baseAsset: string;
  quoteAsset: string;
  priceTick: number;
  quantityStep: number;
  minimumQuantity?: number;
  maximumQuantity?: number;
}>;

export type SpotOrderBookLevel = Readonly<{
  price: number;
  quantity: number;
}>;

export type SpotOrderBookSnapshot = Readonly<{
  marketKey: string;
  symbol: string;
  sequence: number;
  observedAt: number;
  bids: readonly SpotOrderBookLevel[];
  asks: readonly SpotOrderBookLevel[];
}>;

export type SpotAccountEvent = Readonly<{
  eventId: string;
  sequence: number;
  at: number;
  orderId: string;
  reason: string;
  baseAvailableDelta: number;
  baseReservedDelta: number;
  quoteAvailableDelta: number;
  quoteReservedDelta: number;
}>;

export type SpotAccountState = Readonly<{
  accountId: string;
  marketKey: string;
  baseAsset: string;
  quoteAsset: string;
  baseAvailable: number;
  baseReserved: number;
  quoteAvailable: number;
  quoteReserved: number;
  openedAt: number;
  events: readonly SpotAccountEvent[];
}>;

export type SpotOrderAction =
  | "rejected"
  | "working"
  | "partially-filled"
  | "filled"
  | "cancelled";

export type SpotOrderObservation = Readonly<{
  observationId: string;
  sequence: number;
  observedAt: number;
  bookSequence: number;
  phase: "submission" | "resting";
  action: SpotOrderAction;
  filledQuantity: number;
  remainingQuantity: number;
  reservedBase: number;
  reservedQuote: number;
  lifecycleEventFrom: number | null;
  lifecycleEventTo: number | null;
  accountEventFrom: number | null;
  accountEventTo: number | null;
}>;

export type SpotOrderSimulationState = Readonly<{
  order: PendingOrderState;
  account: SpotAccountState;
  reservedBase: number;
  reservedQuote: number;
  observations: readonly SpotOrderObservation[];
}>;

export type SpotOrderReplacement = Readonly<{
  replaced: SpotOrderSimulationState;
  replacement: SpotOrderSimulationState;
}>;

export class SpotOrderSimulationError extends Error {
  code: string;
  field: string;

  constructor(code: string, field: string, message: string) {
    super(message);
    this.name = "SpotOrderSimulationError";
    this.code = code;
    this.field = field;
  }
}

const fail = (code: string, field: string, message: string): never => {
  throw new SpotOrderSimulationError(code, field, message);
};

const tolerance = (value: number) => Math.max(1e-12, Math.abs(value) * 1e-12);

const positive = (value: number, field: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    fail("INVALID_POSITIVE_VALUE", field, `${field} must be finite and greater than zero.`);
  }
};

const nonNegative = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 0) {
    fail("INVALID_NON_NEGATIVE_VALUE", field, `${field} must be finite and non-negative.`);
  }
};

const text = (value: string, field: string) => {
  if (!value.trim()) fail("INVALID_TEXT", field, `${field} is required.`);
};

const alignedToStep = (value: number, step: number) => {
  const units = value / step;
  return Math.abs(units - Math.round(units)) <= Math.max(1, Math.abs(units)) * 1e-10;
};

const freezeAccount = (account: SpotAccountState): SpotAccountState =>
  Object.freeze({
    ...account,
    events: Object.freeze(account.events.map((event) => Object.freeze({...event}))),
  });

const freezeSimulation = (
  order: PendingOrderState,
  account: SpotAccountState,
  reservedBase: number,
  reservedQuote: number,
  observations: readonly SpotOrderObservation[],
): SpotOrderSimulationState =>
  Object.freeze({
    order,
    account,
    reservedBase,
    reservedQuote,
    observations: Object.freeze(observations.map((observation) => Object.freeze({...observation}))),
  });

export function createSpotAccountState(input: {
  accountId: string;
  marketKey: string;
  baseAsset: string;
  quoteAsset: string;
  baseAvailable: number;
  quoteAvailable: number;
  openedAt: number;
}): SpotAccountState {
  text(input.accountId, "accountId");
  text(input.marketKey, "marketKey");
  text(input.baseAsset, "baseAsset");
  text(input.quoteAsset, "quoteAsset");
  nonNegative(input.baseAvailable, "baseAvailable");
  nonNegative(input.quoteAvailable, "quoteAvailable");
  nonNegative(input.openedAt, "openedAt");
  if (input.baseAsset === input.quoteAsset) {
    fail("IDENTICAL_SPOT_ASSETS", "quoteAsset", "Base and quote assets must be different.");
  }
  return freezeAccount({
    ...input,
    baseReserved: 0,
    quoteReserved: 0,
    events: [],
  });
}

export function applySpotAccountEvent(
  account: SpotAccountState,
  event: SpotAccountEvent,
): SpotAccountState {
  text(event.eventId, "event.eventId");
  text(event.orderId, "event.orderId");
  text(event.reason, "event.reason");
  nonNegative(event.at, "event.at");
  const expectedSequence = account.events.length + 1;
  if (event.sequence !== expectedSequence) {
    fail("OUT_OF_SEQUENCE_ACCOUNT_EVENT", "event.sequence", `Expected account sequence ${expectedSequence}.`);
  }
  if (account.events.some((existing) => existing.eventId === event.eventId)) {
    fail("DUPLICATE_ACCOUNT_EVENT", "event.eventId", "Account event has already been applied.");
  }
  const previousAt = account.events.at(-1)?.at ?? account.openedAt;
  if (event.at < previousAt) {
    fail("NON_MONOTONIC_ACCOUNT_TIME", "event.at", "Account event time cannot move backwards.");
  }

  const next = {
    baseAvailable: account.baseAvailable + event.baseAvailableDelta,
    baseReserved: account.baseReserved + event.baseReservedDelta,
    quoteAvailable: account.quoteAvailable + event.quoteAvailableDelta,
    quoteReserved: account.quoteReserved + event.quoteReservedDelta,
  };
  Object.entries(next).forEach(([field, value]) => {
    if (!Number.isFinite(value) || value < -tolerance(value)) {
      fail("NEGATIVE_SPOT_BALANCE", field, `${field} cannot become negative.`);
    }
  });

  return freezeAccount({
    ...account,
    baseAvailable: Math.max(0, next.baseAvailable),
    baseReserved: Math.max(0, next.baseReserved),
    quoteAvailable: Math.max(0, next.quoteAvailable),
    quoteReserved: Math.max(0, next.quoteReserved),
    events: [...account.events, event],
  });
}

export function replaySpotAccount(
  initial: SpotAccountState,
  events: readonly SpotAccountEvent[],
) {
  if (initial.events.length !== 0) {
    fail("REPLAY_REQUIRES_PRISTINE_ACCOUNT", "initial.events", "Replay must begin from an account without events.");
  }
  return events.reduce((account, event) => applySpotAccountEvent(account, event), initial);
}

const validateRules = (rules: SpotInstrumentRules) => {
  text(rules.baseAsset, "rules.baseAsset");
  text(rules.quoteAsset, "rules.quoteAsset");
  positive(rules.priceTick, "rules.priceTick");
  positive(rules.quantityStep, "rules.quantityStep");
  if (rules.minimumQuantity !== undefined) positive(rules.minimumQuantity, "rules.minimumQuantity");
  if (rules.maximumQuantity !== undefined) positive(rules.maximumQuantity, "rules.maximumQuantity");
  if (
    rules.minimumQuantity !== undefined &&
    rules.maximumQuantity !== undefined &&
    rules.minimumQuantity > rules.maximumQuantity
  ) {
    fail("INVALID_QUANTITY_RANGE", "rules.minimumQuantity", "Minimum quantity cannot exceed maximum quantity.");
  }
};

const validateLevels = (levels: readonly SpotOrderBookLevel[], side: "bids" | "asks") => {
  let previousPrice: number | null = null;
  levels.forEach((level, index) => {
    positive(level.price, `${side}[${index}].price`);
    positive(level.quantity, `${side}[${index}].quantity`);
    if (previousPrice !== null) {
      const sorted = side === "bids" ? level.price <= previousPrice : level.price >= previousPrice;
      if (!sorted) fail("UNSORTED_SPOT_BOOK", side, `${side} must be sorted best price first.`);
    }
    previousPrice = level.price;
  });
};

const validateSnapshot = (
  order: PendingOrderState,
  account: SpotAccountState,
  snapshot: SpotOrderBookSnapshot,
  rules: SpotInstrumentRules,
) => {
  validateRules(rules);
  if (order.spec.marketType !== "spot") {
    fail("UNSUPPORTED_MARKET_TYPE", "order.spec.marketType", "Spot simulation requires a spot order.");
  }
  if (snapshot.marketKey !== order.spec.marketKey || snapshot.marketKey !== account.marketKey) {
    fail("SPOT_MARKET_SCOPE_MISMATCH", "snapshot.marketKey", "Order, account and book market keys must match.");
  }
  if (snapshot.symbol !== order.spec.symbol) {
    fail("SPOT_SYMBOL_MISMATCH", "snapshot.symbol", "Book symbol must match the order symbol.");
  }
  if (rules.baseAsset !== account.baseAsset || rules.quoteAsset !== account.quoteAsset) {
    fail("SPOT_ASSET_SCOPE_MISMATCH", "rules", "Instrument assets must match the simulated account.");
  }
  if (!Number.isInteger(snapshot.sequence) || snapshot.sequence < 0) {
    fail("INVALID_BOOK_SEQUENCE", "snapshot.sequence", "Book sequence must be a non-negative integer.");
  }
  const previousAt = order.events.at(-1)?.at ?? order.spec.submittedAt;
  if (!Number.isFinite(snapshot.observedAt) || snapshot.observedAt < previousAt) {
    fail("STALE_BOOK_TIME", "snapshot.observedAt", "Book observation cannot precede order history.");
  }
  validateLevels(snapshot.bids, "bids");
  validateLevels(snapshot.asks, "asks");
};

const rejectionReason = (order: PendingOrderState, rules: SpotInstrumentRules) => {
  const {quantity, limitPrice, kind} = order.spec;
  if (!alignedToStep(quantity, rules.quantityStep)) return "QUANTITY_PRECISION";
  if (rules.minimumQuantity !== undefined && quantity < rules.minimumQuantity) return "QUANTITY_BELOW_MINIMUM";
  if (rules.maximumQuantity !== undefined && quantity > rules.maximumQuantity) return "QUANTITY_ABOVE_MAXIMUM";
  if ((kind === "limit" || kind === "limit-maker") &&
      (limitPrice === undefined || !alignedToStep(limitPrice, rules.priceTick))) {
    return "LIMIT_PRICE_PRECISION";
  }
  return null;
};

const supportedKind = (order: PendingOrderState) =>
  order.spec.kind === "market" || order.spec.kind === "limit" || order.spec.kind === "limit-maker";

const eventId = (order: PendingOrderState, snapshot: SpotOrderBookSnapshot, label: string, index = 0) =>
  `${order.spec.orderId}:spot-book-${snapshot.sequence}:${label}:${index}`;

const accountEvent = (
  account: SpotAccountState,
  orderId: string,
  at: number,
  label: string,
  reason: string,
  deltas: Pick<SpotAccountEvent,
    "baseAvailableDelta" | "baseReservedDelta" | "quoteAvailableDelta" | "quoteReservedDelta">,
) =>
  applySpotAccountEvent(account, {
    eventId: `${orderId}:spot-account:${account.events.length + 1}:${label}`,
    sequence: account.events.length + 1,
    at,
    orderId,
    reason,
    ...deltas,
  });

const reject = (order: PendingOrderState, snapshot: SpotOrderBookSnapshot, reason: string) =>
  applyPendingOrderEvent(order, {
    type: "rejected",
    eventId: eventId(order, snapshot, "rejected"),
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at: snapshot.observedAt,
    reason,
  });

const acceptAndActivate = (order: PendingOrderState, snapshot: SpotOrderBookSnapshot) => {
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

const cancelOrder = (
  order: PendingOrderState,
  at: number,
  eventIdentifier: string,
  reason: string,
) =>
  applyPendingOrderEvent(order, {
    type: "cancelled",
    eventId: eventIdentifier,
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at,
    reason,
  });

const eligibleLevels = (order: PendingOrderState, snapshot: SpotOrderBookSnapshot) => {
  const levels = order.spec.side === "buy" ? snapshot.asks : snapshot.bids;
  if (order.spec.kind === "market") return levels;
  const limitPrice = order.spec.limitPrice as number;
  return order.spec.side === "buy"
    ? levels.filter((level) => level.price <= limitPrice)
    : levels.filter((level) => level.price >= limitPrice);
};

const visibleFillPlan = (order: PendingOrderState, snapshot: SpotOrderBookSnapshot) => {
  let remaining = order.remainingQuantity;
  const plan: {level: SpotOrderBookLevel; quantity: number; index: number}[] = [];
  eligibleLevels(order, snapshot).forEach((level, index) => {
    if (remaining <= 0) return;
    const quantity = Math.min(remaining, level.quantity);
    plan.push({level, quantity, index});
    remaining -= quantity;
  });
  return plan;
};

const reserveLimitFunds = (
  order: PendingOrderState,
  account: SpotAccountState,
  snapshot: SpotOrderBookSnapshot,
) => {
  if (order.spec.side === "buy") {
    const amount = (order.spec.limitPrice as number) * order.spec.quantity;
    if (account.quoteAvailable + tolerance(account.quoteAvailable) < amount) return null;
    return {
      account: accountEvent(account, order.spec.orderId, snapshot.observedAt, "reserve", "LIMIT_BUY_RESERVE", {
        baseAvailableDelta: 0,
        baseReservedDelta: 0,
        quoteAvailableDelta: -amount,
        quoteReservedDelta: amount,
      }),
      reservedBase: 0,
      reservedQuote: amount,
    };
  }
  if (account.baseAvailable + tolerance(account.baseAvailable) < order.spec.quantity) return null;
  return {
    account: accountEvent(account, order.spec.orderId, snapshot.observedAt, "reserve", "LIMIT_SELL_RESERVE", {
      baseAvailableDelta: -order.spec.quantity,
      baseReservedDelta: order.spec.quantity,
      quoteAvailableDelta: 0,
      quoteReservedDelta: 0,
    }),
    reservedBase: order.spec.quantity,
    reservedQuote: 0,
  };
};

const marketFundingReason = (
  order: PendingOrderState,
  account: SpotAccountState,
  plan: readonly {level: SpotOrderBookLevel; quantity: number}[],
) => {
  const fillQuantity = plan.reduce((sum, item) => sum + item.quantity, 0);
  if (order.spec.side === "sell" && account.baseAvailable + tolerance(account.baseAvailable) < fillQuantity) {
    return "INSUFFICIENT_BASE_BALANCE";
  }
  const cost = plan.reduce((sum, item) => sum + item.level.price * item.quantity, 0);
  if (order.spec.side === "buy" && account.quoteAvailable + tolerance(account.quoteAvailable) < cost) {
    return "INSUFFICIENT_QUOTE_BALANCE";
  }
  return null;
};

const appendObservation = (
  previous: SpotOrderSimulationState,
  order: PendingOrderState,
  account: SpotAccountState,
  snapshot: SpotOrderBookSnapshot,
  phase: "submission" | "resting",
  action: SpotOrderAction,
  reservedBase: number,
  reservedQuote: number,
) => {
  const beforeOrder = previous.order.events.length;
  const afterOrder = order.events.length;
  const beforeAccount = previous.account.events.length;
  const afterAccount = account.events.length;
  const observation: SpotOrderObservation = {
    observationId: `${order.spec.orderId}:spot-observation:${previous.observations.length + 1}`,
    sequence: previous.observations.length + 1,
    observedAt: snapshot.observedAt,
    bookSequence: snapshot.sequence,
    phase,
    action,
    filledQuantity: order.filledQuantity,
    remainingQuantity: order.remainingQuantity,
    reservedBase,
    reservedQuote,
    lifecycleEventFrom: afterOrder > beforeOrder ? beforeOrder + 1 : null,
    lifecycleEventTo: afterOrder > beforeOrder ? afterOrder : null,
    accountEventFrom: afterAccount > beforeAccount ? beforeAccount + 1 : null,
    accountEventTo: afterAccount > beforeAccount ? afterAccount : null,
  };
  return freezeSimulation(order, account, reservedBase, reservedQuote, [...previous.observations, observation]);
};

const releaseReserve = (
  state: SpotOrderSimulationState,
  at: number,
  label: string,
) => {
  if (state.reservedBase <= tolerance(state.reservedBase) &&
      state.reservedQuote <= tolerance(state.reservedQuote)) {
    return {...state, reservedBase: 0, reservedQuote: 0};
  }
  const account = accountEvent(state.account, state.order.spec.orderId, at, label, "RELEASE_ORDER_RESERVE", {
    baseAvailableDelta: state.reservedBase,
    baseReservedDelta: -state.reservedBase,
    quoteAvailableDelta: state.reservedQuote,
    quoteReservedDelta: -state.reservedQuote,
  });
  return {...state, account, reservedBase: 0, reservedQuote: 0};
};

const executePlan = (
  state: SpotOrderSimulationState,
  snapshot: SpotOrderBookSnapshot,
  phase: "submission" | "resting",
) => {
  let {order, account, reservedBase, reservedQuote} = state;
  const plan = visibleFillPlan(order, snapshot);

  for (const item of plan) {
    const {level, quantity, index} = item;
    const limitPrice = order.spec.limitPrice ?? level.price;
    if (order.spec.side === "buy") {
      if (order.spec.kind === "market") {
        account = accountEvent(account, order.spec.orderId, snapshot.observedAt, `fill-${index}`, "SPOT_MARKET_BUY_FILL", {
          baseAvailableDelta: quantity,
          baseReservedDelta: 0,
          quoteAvailableDelta: -(level.price * quantity),
          quoteReservedDelta: 0,
        });
      } else {
        const reservedReduction = limitPrice * quantity;
        const priceImprovement = Math.max(0, limitPrice - level.price) * quantity;
        account = accountEvent(account, order.spec.orderId, snapshot.observedAt, `fill-${index}`, "SPOT_LIMIT_BUY_FILL", {
          baseAvailableDelta: quantity,
          baseReservedDelta: 0,
          quoteAvailableDelta: priceImprovement,
          quoteReservedDelta: -reservedReduction,
        });
        reservedQuote = Math.max(0, reservedQuote - reservedReduction);
      }
    } else if (order.spec.kind === "market") {
      account = accountEvent(account, order.spec.orderId, snapshot.observedAt, `fill-${index}`, "SPOT_MARKET_SELL_FILL", {
        baseAvailableDelta: -quantity,
        baseReservedDelta: 0,
        quoteAvailableDelta: level.price * quantity,
        quoteReservedDelta: 0,
      });
    } else {
      account = accountEvent(account, order.spec.orderId, snapshot.observedAt, `fill-${index}`, "SPOT_LIMIT_SELL_FILL", {
        baseAvailableDelta: 0,
        baseReservedDelta: -quantity,
        quoteAvailableDelta: level.price * quantity,
        quoteReservedDelta: 0,
      });
      reservedBase = Math.max(0, reservedBase - quantity);
    }

    const fill: PendingOrderFill = {
      fillId: eventId(order, snapshot, "fill", index),
      quantity,
      price: level.price,
      liquidityRole: phase === "resting" ? "maker" : "taker",
      evidence: {
        source: "spot-order-book",
        phase,
        bookSequence: snapshot.sequence,
        observedAt: snapshot.observedAt,
        levelIndex: index,
        availableQuantity: level.quantity,
        matchedQuantity: quantity,
        reservedBaseAfter: reservedBase,
        reservedQuoteAfter: reservedQuote,
      },
    };
    order = applyPendingOrderEvent(order, {
      type: "filled",
      eventId: eventId(order, snapshot, "filled-event", index),
      orderId: order.spec.orderId,
      sequence: nextPendingOrderSequence(order),
      at: snapshot.observedAt,
      fill,
    });
  }
  return freezeSimulation(order, account, reservedBase, reservedQuote, state.observations);
};

const initialiseSpotOrder = (
  order: PendingOrderState,
  account: SpotAccountState,
  snapshot: SpotOrderBookSnapshot,
  rules: SpotInstrumentRules,
): SpotOrderSimulationState => {
  validateSnapshot(order, account, snapshot, rules);
  if (order.status !== "submitted") {
    fail("INVALID_SUBMISSION_STATE", "order.status", "Initial spot simulation requires a submitted order.");
  }
  if (!supportedKind(order)) {
    fail("UNSUPPORTED_SPOT_ORDER_KIND", "order.spec.kind", "Spot simulation supports market and limit order kinds.");
  }

  const base = freezeSimulation(order, account, 0, 0, []);
  const reason = rejectionReason(order, rules);
  if (reason) {
    return appendObservation(base, reject(order, snapshot, reason), account, snapshot, "submission", "rejected", 0, 0);
  }

  const plan = visibleFillPlan(order, snapshot);
  if (order.spec.kind === "limit-maker" && plan.length > 0) {
    return appendObservation(
      base,
      reject(order, snapshot, "LIMIT_MAKER_WOULD_TAKE"),
      account,
      snapshot,
      "submission",
      "rejected",
      0,
      0,
    );
  }

  let working = base;
  if (order.spec.kind === "market") {
    const fundingReason = marketFundingReason(order, account, plan);
    if (fundingReason) {
      return appendObservation(base, reject(order, snapshot, fundingReason), account, snapshot, "submission", "rejected", 0, 0);
    }
  } else {
    const reservation = reserveLimitFunds(order, account, snapshot);
    if (!reservation) {
      const fundingReason = order.spec.side === "buy" ? "INSUFFICIENT_QUOTE_BALANCE" : "INSUFFICIENT_BASE_BALANCE";
      return appendObservation(base, reject(order, snapshot, fundingReason), account, snapshot, "submission", "rejected", 0, 0);
    }
    working = freezeSimulation(order, reservation.account, reservation.reservedBase, reservation.reservedQuote, []);
  }

  const accepted = acceptAndActivate(order, snapshot);
  working = freezeSimulation(accepted, working.account, working.reservedBase, working.reservedQuote, []);
  const availableQuantity = plan.reduce((sum, item) => sum + item.quantity, 0);
  if (order.spec.timeInForce === "FOK" && availableQuantity + tolerance(availableQuantity) < order.spec.quantity) {
    const cancelled = cancelOrder(accepted, snapshot.observedAt, eventId(order, snapshot, "fok-cancelled"), "FOK_NOT_FULLY_FILLABLE");
    const released = releaseReserve(freezeSimulation(cancelled, working.account, working.reservedBase, working.reservedQuote, []), snapshot.observedAt, "fok-release");
    return appendObservation(base, cancelled, released.account, snapshot, "submission", "cancelled", 0, 0);
  }

  working = executePlan(working, snapshot, "submission");
  if (working.order.status === "filled") {
    return appendObservation(base, working.order, working.account, snapshot, "submission", "filled", working.reservedBase, working.reservedQuote);
  }

  const cancelRemainder = order.spec.kind === "market" || order.spec.timeInForce === "IOC" || order.spec.timeInForce === "FOK";
  if (cancelRemainder) {
    const reasonText = order.spec.kind === "market"
      ? "MARKET_VISIBLE_DEPTH_EXHAUSTED"
      : order.spec.timeInForce === "IOC"
        ? "IOC_REMAINDER_CANCELLED"
        : "FOK_REMAINDER_CANCELLED";
    const cancelled = cancelOrder(working.order, snapshot.observedAt, eventId(order, snapshot, "remainder-cancelled"), reasonText);
    const released = releaseReserve(freezeSimulation(cancelled, working.account, working.reservedBase, working.reservedQuote, []), snapshot.observedAt, "remainder-release");
    return appendObservation(base, cancelled, released.account, snapshot, "submission", "cancelled", 0, 0);
  }

  const action = working.order.status === "partially-filled" ? "partially-filled" : "working";
  return appendObservation(base, working.order, working.account, snapshot, "submission", action, working.reservedBase, working.reservedQuote);
};

export function simulateSpotOrder(
  input: PendingOrderState | SpotOrderSimulationState,
  accountOrSnapshot: SpotAccountState | SpotOrderBookSnapshot,
  snapshotOrRules: SpotOrderBookSnapshot | SpotInstrumentRules,
  maybeRules?: SpotInstrumentRules,
): SpotOrderSimulationState {
  if (!("order" in input)) {
    if (!("events" in accountOrSnapshot) || maybeRules === undefined) {
      fail("MISSING_SPOT_ACCOUNT", "account", "Initial spot simulation requires an account state.");
    }
    return initialiseSpotOrder(input, accountOrSnapshot, snapshotOrRules as SpotOrderBookSnapshot, maybeRules);
  }

  const state = input;
  const snapshot = accountOrSnapshot as SpotOrderBookSnapshot;
  const rules = snapshotOrRules as SpotInstrumentRules;
  validateSnapshot(state.order, state.account, snapshot, rules);
  if (state.order.status !== "working" && state.order.status !== "partially-filled") {
    fail("INVALID_RESTING_STATE", "order.status", "Resting spot matching requires a working order.");
  }
  const base = state;
  const matched = executePlan(state, snapshot, "resting");
  const action = matched.order.status === "filled"
    ? "filled"
    : matched.order.status === "partially-filled"
      ? "partially-filled"
      : "working";
  return appendObservation(base, matched.order, matched.account, snapshot, "resting", action, matched.reservedBase, matched.reservedQuote);
}

export function cancelSpotOrderSimulation(
  state: SpotOrderSimulationState,
  at: number,
  reason = "USER_CANCELLED",
) {
  if (state.order.status !== "working" && state.order.status !== "partially-filled" && state.order.status !== "accepted") {
    fail("INVALID_CANCEL_STATE", "order.status", "Only a live spot order can be cancelled.");
  }
  const cancelled = cancelOrder(
    state.order,
    at,
    `${state.order.spec.orderId}:spot-manual-cancel:${nextPendingOrderSequence(state.order)}`,
    reason,
  );
  const released = releaseReserve(freezeSimulation(cancelled, state.account, state.reservedBase, state.reservedQuote, state.observations), at, "manual-release");
  return freezeSimulation(cancelled, released.account, 0, 0, state.observations);
}

export function replaceSpotOrderSimulation(
  state: SpotOrderSimulationState,
  replacement: PendingOrderSpec,
  snapshot: SpotOrderBookSnapshot,
  rules: SpotInstrumentRules,
  ids: {replacedEventId: string; submittedEventId: string; reason: string},
): SpotOrderReplacement {
  if (state.order.status !== "working" && state.order.status !== "partially-filled" && state.order.status !== "accepted") {
    fail("INVALID_REPLACE_STATE", "order.status", "Only a live spot order can be replaced.");
  }
  if (replacement.marketType !== "spot") {
    fail("INVALID_REPLACEMENT_MARKET_TYPE", "replacement.marketType", "Spot replacements must remain spot orders.");
  }
  const lifecycle = replacePendingOrder(state.order, replacement, {
    ...ids,
    at: snapshot.observedAt,
  });
  const released = releaseReserve(
    freezeSimulation(lifecycle.replaced, state.account, state.reservedBase, state.reservedQuote, state.observations),
    snapshot.observedAt,
    "replace-release",
  );
  const replaced = freezeSimulation(lifecycle.replaced, released.account, 0, 0, state.observations);
  const next = initialiseSpotOrder(lifecycle.replacement, released.account, snapshot, rules);
  return Object.freeze({replaced, replacement: next});
}
