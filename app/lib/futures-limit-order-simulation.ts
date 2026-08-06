import {
  applyPendingOrderEvent,
  nextPendingOrderSequence,
  type PendingOrderFill,
  type PendingOrderState,
} from "./pending-order-lifecycle";

export type FuturesInstrumentRules = Readonly<{
  priceTick: number;
  quantityStep: number;
  minimumQuantity?: number;
  maximumQuantity?: number;
}>;

export type FuturesOrderBookLevel = Readonly<{
  price: number;
  quantity: number;
}>;

export type FuturesOrderBookSnapshot = Readonly<{
  marketKey: string;
  symbol: string;
  sequence: number;
  observedAt: number;
  bids: readonly FuturesOrderBookLevel[];
  asks: readonly FuturesOrderBookLevel[];
}>;

export type FuturesLimitMatchPhase = "submission" | "resting";

export class FuturesLimitSimulationError extends Error {
  code: string;
  field: string;

  constructor(code: string, field: string, message: string) {
    super(message);
    this.name = "FuturesLimitSimulationError";
    this.code = code;
    this.field = field;
  }
}

const fail = (code: string, field: string, message: string): never => {
  throw new FuturesLimitSimulationError(code, field, message);
};

const positive = (value: number, field: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    fail("INVALID_BOOK_VALUE", field, `${field} must be finite and greater than zero.`);
  }
};

const alignedToStep = (value: number, step: number) => {
  const units = value / step;
  const tolerance = Math.max(1, Math.abs(units)) * 1e-10;
  return Math.abs(units - Math.round(units)) <= tolerance;
};

const validateRules = (rules: FuturesInstrumentRules) => {
  positive(rules.priceTick, "rules.priceTick");
  positive(rules.quantityStep, "rules.quantityStep");
  if (rules.minimumQuantity !== undefined) positive(rules.minimumQuantity, "rules.minimumQuantity");
  if (rules.maximumQuantity !== undefined) positive(rules.maximumQuantity, "rules.maximumQuantity");
  if (
    rules.minimumQuantity !== undefined &&
    rules.maximumQuantity !== undefined &&
    rules.minimumQuantity > rules.maximumQuantity
  ) {
    fail(
      "INVALID_QUANTITY_RANGE",
      "rules.minimumQuantity",
      "minimumQuantity cannot exceed maximumQuantity.",
    );
  }
};

const validateLevels = (
  levels: readonly FuturesOrderBookLevel[],
  side: "bids" | "asks",
) => {
  let previousPrice: number | null = null;
  levels.forEach((level, index) => {
    positive(level.price, `${side}[${index}].price`);
    positive(level.quantity, `${side}[${index}].quantity`);
    if (previousPrice !== null) {
      const sorted = side === "bids" ? level.price <= previousPrice : level.price >= previousPrice;
      if (!sorted) {
        fail(
          "UNSORTED_ORDER_BOOK",
          side,
          `${side} must be sorted from best price outward.`,
        );
      }
    }
    previousPrice = level.price;
  });
};

const validateSnapshot = (order: PendingOrderState, snapshot: FuturesOrderBookSnapshot) => {
  if (!Number.isInteger(snapshot.sequence) || snapshot.sequence < 0) {
    fail("INVALID_BOOK_SEQUENCE", "snapshot.sequence", "Book sequence must be a non-negative integer.");
  }
  if (!Number.isFinite(snapshot.observedAt) || snapshot.observedAt < 0) {
    fail("INVALID_BOOK_TIME", "snapshot.observedAt", "Book observation time must be non-negative.");
  }
  const previousAt = order.events.at(-1)?.at ?? order.spec.submittedAt;
  if (snapshot.observedAt < previousAt) {
    fail("STALE_BOOK_TIME", "snapshot.observedAt", "Book observation cannot precede the order audit history.");
  }
  if (snapshot.marketKey !== order.spec.marketKey || snapshot.symbol !== order.spec.symbol) {
    fail("BOOK_SCOPE_MISMATCH", "snapshot.marketKey", "Book snapshot must match the order market and symbol.");
  }
  validateLevels(snapshot.bids, "bids");
  validateLevels(snapshot.asks, "asks");
};

const rejectionReason = (order: PendingOrderState, rules: FuturesInstrumentRules) => {
  const {quantity, limitPrice} = order.spec;
  if (limitPrice === undefined || !alignedToStep(limitPrice, rules.priceTick)) {
    return "LIMIT_PRICE_PRECISION";
  }
  if (!alignedToStep(quantity, rules.quantityStep)) return "QUANTITY_PRECISION";
  if (rules.minimumQuantity !== undefined && quantity < rules.minimumQuantity) {
    return "QUANTITY_BELOW_MINIMUM";
  }
  if (rules.maximumQuantity !== undefined && quantity > rules.maximumQuantity) {
    return "QUANTITY_ABOVE_MAXIMUM";
  }
  return null;
};

const eligibleLevels = (order: PendingOrderState, snapshot: FuturesOrderBookSnapshot) => {
  const limitPrice = order.spec.limitPrice as number;
  if (order.spec.side === "buy") {
    return snapshot.asks.filter((level) => level.price <= limitPrice);
  }
  return snapshot.bids.filter((level) => level.price >= limitPrice);
};

const isMarketable = (order: PendingOrderState, snapshot: FuturesOrderBookSnapshot) =>
  eligibleLevels(order, snapshot).length > 0;

const eventId = (
  order: PendingOrderState,
  snapshot: FuturesOrderBookSnapshot,
  label: string,
  index = 0,
) => `${order.spec.orderId}:book-${snapshot.sequence}:${label}:${index}`;

const reject = (
  order: PendingOrderState,
  snapshot: FuturesOrderBookSnapshot,
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

const acceptAndActivate = (order: PendingOrderState, snapshot: FuturesOrderBookSnapshot) => {
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

const cancelRemainder = (
  order: PendingOrderState,
  snapshot: FuturesOrderBookSnapshot,
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

const fillAgainstLevels = (
  order: PendingOrderState,
  snapshot: FuturesOrderBookSnapshot,
  phase: FuturesLimitMatchPhase,
) => {
  let next = order;
  let remaining = order.remainingQuantity;
  const levels = eligibleLevels(order, snapshot);

  for (let index = 0; index < levels.length && remaining > 0; index += 1) {
    const level = levels[index];
    const quantity = Math.min(remaining, level.quantity);
    const fill: PendingOrderFill = {
      fillId: eventId(order, snapshot, "fill", index),
      quantity,
      price: level.price,
      liquidityRole: phase === "submission" ? "taker" : "maker",
      evidence: {
        source: "futures-order-book",
        phase,
        bookSequence: snapshot.sequence,
        observedAt: snapshot.observedAt,
        levelIndex: index,
        availableQuantity: level.quantity,
        matchedQuantity: quantity,
        limitPrice: order.spec.limitPrice as number,
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
  return next;
};

export function simulateFuturesLimitOrder(
  order: PendingOrderState,
  snapshot: FuturesOrderBookSnapshot,
  rules: FuturesInstrumentRules,
  phase: FuturesLimitMatchPhase,
): PendingOrderState {
  validateRules(rules);
  validateSnapshot(order, snapshot);

  if (order.spec.marketType !== "futures") {
    fail("UNSUPPORTED_MARKET_TYPE", "order.spec.marketType", "Futures simulation requires a futures order.");
  }
  if (order.spec.kind !== "limit" && order.spec.kind !== "limit-maker") {
    fail("UNSUPPORTED_ORDER_KIND", "order.spec.kind", "This matcher only accepts futures limit orders.");
  }
  if (order.spec.limitPrice === undefined) {
    fail("MISSING_LIMIT_PRICE", "order.spec.limitPrice", "Futures limit orders require a limit price.");
  }

  if (phase === "submission") {
    if (order.status !== "submitted") {
      fail("INVALID_SUBMISSION_STATE", "order.status", "Submission matching requires a submitted order.");
    }
    const reason = rejectionReason(order, rules);
    if (reason) return reject(order, snapshot, reason);
    if (order.spec.postOnly && isMarketable(order, snapshot)) {
      return reject(order, snapshot, "POST_ONLY_WOULD_TAKE");
    }
  } else if (order.status !== "working" && order.status !== "partially-filled") {
    fail("INVALID_RESTING_STATE", "order.status", "Resting matching requires a working order.");
  }

  let next = phase === "submission" ? acceptAndActivate(order, snapshot) : order;
  const levels = eligibleLevels(next, snapshot);
  const availableQuantity = levels.reduce((sum, level) => sum + level.quantity, 0);

  if (phase === "submission" && order.spec.timeInForce === "FOK" && availableQuantity < next.remainingQuantity) {
    return cancelRemainder(next, snapshot, "FOK_NOT_FULLY_FILLABLE");
  }

  if (levels.length > 0) next = fillAgainstLevels(next, snapshot, phase);
  if (next.status === "filled") return next;

  if (phase === "submission" && order.spec.timeInForce === "IOC") {
    return cancelRemainder(next, snapshot, "IOC_REMAINDER_CANCELLED");
  }
  if (phase === "submission" && order.spec.timeInForce === "FOK") {
    return cancelRemainder(next, snapshot, "FOK_REMAINDER_CANCELLED");
  }
  return next;
}
