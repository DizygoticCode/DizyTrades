export type PendingOrderMarketType = "futures" | "spot";
export type PendingOrderSide = "buy" | "sell";
export type PendingOrderKind =
  | "market"
  | "limit"
  | "limit-maker"
  | "trigger-market"
  | "trigger-limit"
  | "trailing-stop"
  | "chase-limit";
export type PendingOrderTimeInForce = "GTC" | "IOC" | "FOK";
export type PendingOrderStatus =
  | "submitted"
  | "accepted"
  | "working"
  | "partially-filled"
  | "filled"
  | "cancelled"
  | "expired"
  | "rejected"
  | "replaced";
export type PendingOrderLiquidityRole = "maker" | "taker" | "unknown";

export type PendingOrderSpec = {
  orderId: string;
  ownerId: string;
  marketKey: string;
  marketType: PendingOrderMarketType;
  symbol: string;
  side: PendingOrderSide;
  kind: PendingOrderKind;
  quantity: number;
  timeInForce: PendingOrderTimeInForce;
  reduceOnly: boolean;
  postOnly: boolean;
  submittedAt: number;
  clientOrderId?: string;
  parentOrderId?: string;
  limitPrice?: number;
  triggerPrice?: number;
  activationPrice?: number;
  callbackRate?: number;
  protectionDistance?: number;
  expiresAt?: number;
};

export type PendingOrderFill = {
  fillId: string;
  quantity: number;
  price: number;
  liquidityRole: PendingOrderLiquidityRole;
  fee?: number;
  evidence?: Readonly<Record<string, string | number | boolean | null>>;
};

type PendingOrderEventBase = {
  eventId: string;
  orderId: string;
  sequence: number;
  at: number;
};

export type PendingOrderEvent =
  | (PendingOrderEventBase & {type: "submitted"; spec: PendingOrderSpec})
  | (PendingOrderEventBase & {type: "accepted"})
  | (PendingOrderEventBase & {type: "activated"})
  | (PendingOrderEventBase & {type: "filled"; fill: PendingOrderFill})
  | (PendingOrderEventBase & {type: "cancelled"; reason: string})
  | (PendingOrderEventBase & {type: "expired"; reason: string})
  | (PendingOrderEventBase & {type: "rejected"; reason: string})
  | (PendingOrderEventBase & {
      type: "replaced";
      replacementOrderId: string;
      reason: string;
    });

export type PendingOrderState = Readonly<{
  spec: Readonly<PendingOrderSpec>;
  status: PendingOrderStatus;
  filledQuantity: number;
  remainingQuantity: number;
  averageFillPrice: number | null;
  acceptedAt: number | null;
  activatedAt: number | null;
  terminalAt: number | null;
  rejectionReason: string | null;
  replacementOrderId: string | null;
  fills: readonly Readonly<PendingOrderFill>[];
  events: readonly Readonly<PendingOrderEvent>[];
}>;

export class PendingOrderLifecycleError extends Error {
  code: string;
  field: string;

  constructor(code: string, field: string, message: string) {
    super(message);
    this.name = "PendingOrderLifecycleError";
    this.code = code;
    this.field = field;
  }
}

const fail = (code: string, field: string, message: string): never => {
  throw new PendingOrderLifecycleError(code, field, message);
};

const positive = (value: number, field: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    fail("INVALID_ORDER_VALUE", field, `${field} must be finite and greater than zero.`);
  }
};

const nonNegative = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 0) {
    fail("INVALID_ORDER_VALUE", field, `${field} must be finite and non-negative.`);
  }
};

const text = (value: string, field: string) => {
  if (!value.trim()) fail("INVALID_ORDER_TEXT", field, `${field} is required.`);
};

const eventReason = (value: string) => {
  if (!value.trim()) fail("INVALID_EVENT_REASON", "reason", "A lifecycle reason is required.");
};

const isTerminal = (status: PendingOrderStatus) =>
  status === "filled" ||
  status === "cancelled" ||
  status === "expired" ||
  status === "rejected" ||
  status === "replaced";

const freezeFill = (fill: PendingOrderFill): Readonly<PendingOrderFill> =>
  Object.freeze({
    ...fill,
    evidence: fill.evidence ? Object.freeze({...fill.evidence}) : undefined,
  });
const freezeEvent = (event: PendingOrderEvent): Readonly<PendingOrderEvent> => {
  if (event.type === "submitted") {
    return Object.freeze({...event, spec: Object.freeze({...event.spec})});
  }
  if (event.type === "filled") {
    return Object.freeze({...event, fill: freezeFill(event.fill)});
  }
  return Object.freeze({...event});
};

const freezeState = (state: Omit<PendingOrderState, "events" | "fills"> & {
  events: readonly PendingOrderEvent[];
  fills: readonly PendingOrderFill[];
}): PendingOrderState =>
  Object.freeze({
    ...state,
    spec: Object.freeze({...state.spec}),
    fills: Object.freeze(state.fills.map((fill) => freezeFill(fill))),
    events: Object.freeze(state.events.map((event) => freezeEvent(event))),
  });

export function validatePendingOrderSpec(spec: PendingOrderSpec) {
  text(spec.orderId, "orderId");
  text(spec.ownerId, "ownerId");
  text(spec.marketKey, "marketKey");
  text(spec.symbol, "symbol");
  positive(spec.quantity, "quantity");
  nonNegative(spec.submittedAt, "submittedAt");

  if (spec.expiresAt !== undefined) {
    nonNegative(spec.expiresAt, "expiresAt");
    if (spec.expiresAt < spec.submittedAt) {
      fail("INVALID_ORDER_EXPIRY", "expiresAt", "expiresAt cannot precede submittedAt.");
    }
  }

  if (spec.limitPrice !== undefined) positive(spec.limitPrice, "limitPrice");
  if (spec.triggerPrice !== undefined) positive(spec.triggerPrice, "triggerPrice");
  if (spec.activationPrice !== undefined) positive(spec.activationPrice, "activationPrice");
  if (spec.callbackRate !== undefined) positive(spec.callbackRate, "callbackRate");
  if (spec.protectionDistance !== undefined) positive(spec.protectionDistance, "protectionDistance");

  if (["limit", "limit-maker", "trigger-limit", "chase-limit"].includes(spec.kind) && spec.limitPrice === undefined) {
    fail("MISSING_LIMIT_PRICE", "limitPrice", `${spec.kind} orders require a limit price.`);
  }
  if (["trigger-market", "trigger-limit"].includes(spec.kind) && spec.triggerPrice === undefined) {
    fail("MISSING_TRIGGER_PRICE", "triggerPrice", `${spec.kind} orders require a trigger price.`);
  }
  if (spec.kind === "trailing-stop" && spec.callbackRate === undefined) {
    fail("MISSING_CALLBACK_RATE", "callbackRate", "Trailing-stop orders require a callback rate.");
  }
  if (spec.kind === "chase-limit" && spec.protectionDistance === undefined) {
    fail("MISSING_PROTECTION_DISTANCE", "protectionDistance", "Chase-limit orders require a protection distance.");
  }
  if (spec.kind === "limit-maker" && !spec.postOnly) {
    fail("LIMIT_MAKER_REQUIRES_POST_ONLY", "postOnly", "Limit-maker orders must be post-only.");
  }
  if (spec.postOnly && !["limit", "limit-maker", "chase-limit"].includes(spec.kind)) {
    fail("INVALID_POST_ONLY_KIND", "postOnly", "Post-only is only valid for limit-style orders.");
  }
}

const validateEventEnvelope = (state: PendingOrderState | null, event: PendingOrderEvent) => {
  text(event.eventId, "eventId");
  text(event.orderId, "orderId");
  nonNegative(event.at, "at");
  if (!Number.isInteger(event.sequence) || event.sequence < 1) {
    fail("INVALID_EVENT_SEQUENCE", "sequence", "Event sequence must be a positive integer.");
  }

  const expectedSequence = state ? state.events.length + 1 : 1;
  if (event.sequence !== expectedSequence) {
    fail("OUT_OF_SEQUENCE_EVENT", "sequence", `Expected lifecycle sequence ${expectedSequence}.`);
  }
  if (state) {
    if (event.orderId !== state.spec.orderId) {
      fail("ORDER_ID_MISMATCH", "orderId", "Lifecycle event targets a different order.");
    }
    if (state.events.some((existing) => existing.eventId === event.eventId)) {
      fail("DUPLICATE_EVENT", "eventId", "Lifecycle event has already been applied.");
    }
    const previousAt = state.events.at(-1)?.at ?? state.spec.submittedAt;
    if (event.at < previousAt) {
      fail("NON_MONOTONIC_EVENT_TIME", "at", "Lifecycle event time cannot move backwards.");
    }
    if (isTerminal(state.status)) {
      fail("ORDER_ALREADY_TERMINAL", "status", `Cannot apply ${event.type} to a terminal order.`);
    }
  }
};

export function applyPendingOrderEvent(
  state: PendingOrderState | null,
  event: PendingOrderEvent,
): PendingOrderState {
  validateEventEnvelope(state, event);

  if (event.type === "submitted") {
    if (state) fail("DUPLICATE_SUBMISSION", "type", "An order can only be submitted once.");
    if (event.orderId !== event.spec.orderId) {
      fail("ORDER_ID_MISMATCH", "orderId", "Submission event and order specification IDs must match.");
    }
    validatePendingOrderSpec(event.spec);
    if (event.at !== event.spec.submittedAt) {
      fail("SUBMISSION_TIME_MISMATCH", "at", "Submission event time must equal submittedAt.");
    }
    return freezeState({
      spec: event.spec,
      status: "submitted",
      filledQuantity: 0,
      remainingQuantity: event.spec.quantity,
      averageFillPrice: null,
      acceptedAt: null,
      activatedAt: null,
      terminalAt: null,
      rejectionReason: null,
      replacementOrderId: null,
      fills: [],
      events: [event],
    });
  }

  if (!state) {
    return fail("MISSING_SUBMISSION", "type", "The first lifecycle event must submit the order.");
  }
  const events = [...state.events, event];

  switch (event.type) {
    case "accepted": {
      if (state.status !== "submitted") {
        fail("INVALID_ORDER_TRANSITION", "status", "Only submitted orders can be accepted.");
      }
      return freezeState({...state, status: "accepted", acceptedAt: event.at, events, fills: state.fills});
    }
    case "activated": {
      if (state.status !== "accepted") {
        fail("INVALID_ORDER_TRANSITION", "status", "Only accepted orders can become working.");
      }
      return freezeState({...state, status: "working", activatedAt: event.at, events, fills: state.fills});
    }
    case "filled": {
      if (state.status !== "working" && state.status !== "partially-filled") {
        fail("INVALID_ORDER_TRANSITION", "status", "Only working orders can receive fills.");
      }
      text(event.fill.fillId, "fillId");
      positive(event.fill.quantity, "fill.quantity");
      positive(event.fill.price, "fill.price");
      if (event.fill.fee !== undefined) nonNegative(event.fill.fee, "fill.fee");
      if (state.fills.some((fill) => fill.fillId === event.fill.fillId)) {
        fail("DUPLICATE_FILL", "fillId", "Fill has already been applied.");
      }
      const tolerance = Math.max(1e-12, state.spec.quantity * 1e-12);
      if (event.fill.quantity - state.remainingQuantity > tolerance) {
        fail("OVERFILL", "fill.quantity", "Fill quantity exceeds the remaining order quantity.");
      }
      const filledQuantity = Math.min(state.spec.quantity, state.filledQuantity + event.fill.quantity);
      const remainingQuantity = Math.max(0, state.spec.quantity - filledQuantity);
      const previousNotional = (state.averageFillPrice ?? 0) * state.filledQuantity;
      const averageFillPrice = (previousNotional + event.fill.price * event.fill.quantity) / filledQuantity;
      const terminal = remainingQuantity <= tolerance;
      return freezeState({
        ...state,
        status: terminal ? "filled" : "partially-filled",
        filledQuantity: terminal ? state.spec.quantity : filledQuantity,
        remainingQuantity: terminal ? 0 : remainingQuantity,
        averageFillPrice,
        terminalAt: terminal ? event.at : null,
        fills: [...state.fills, event.fill],
        events,
      });
    }
    case "cancelled": {
      eventReason(event.reason);
      return freezeState({...state, status: "cancelled", terminalAt: event.at, events, fills: state.fills});
    }
    case "expired": {
      eventReason(event.reason);
      return freezeState({...state, status: "expired", terminalAt: event.at, events, fills: state.fills});
    }
    case "rejected": {
      if (state.status !== "submitted") {
        fail("INVALID_ORDER_TRANSITION", "status", "Only submitted orders can be rejected.");
      }
      eventReason(event.reason);
      return freezeState({
        ...state,
        status: "rejected",
        terminalAt: event.at,
        rejectionReason: event.reason,
        events,
        fills: state.fills,
      });
    }
    case "replaced": {
      if (state.status !== "accepted" && state.status !== "working" && state.status !== "partially-filled") {
        fail("INVALID_ORDER_TRANSITION", "status", "Only live orders can be replaced.");
      }
      text(event.replacementOrderId, "replacementOrderId");
      eventReason(event.reason);
      if (event.replacementOrderId === state.spec.orderId) {
        fail("INVALID_REPLACEMENT_ID", "replacementOrderId", "Replacement order ID must be different.");
      }
      return freezeState({
        ...state,
        status: "replaced",
        terminalAt: event.at,
        replacementOrderId: event.replacementOrderId,
        events,
        fills: state.fills,
      });
    }
  }
}

export function replayPendingOrder(events: readonly PendingOrderEvent[]) {
  if (events.length === 0) fail("MISSING_SUBMISSION", "events", "At least one lifecycle event is required.");
  return events.reduce<PendingOrderState | null>(
    (state, event) => applyPendingOrderEvent(state, event),
    null,
  ) as PendingOrderState;
}

export function nextPendingOrderSequence(order: PendingOrderState | null) {
  return (order?.events.length ?? 0) + 1;
}

export function replacePendingOrder(
  current: PendingOrderState,
  replacement: PendingOrderSpec,
  event: {
    replacedEventId: string;
    submittedEventId: string;
    at: number;
    reason: string;
  },
) {
  if (
    replacement.ownerId !== current.spec.ownerId ||
    replacement.marketKey !== current.spec.marketKey ||
    replacement.marketType !== current.spec.marketType ||
    replacement.symbol !== current.spec.symbol
  ) {
    fail("INVALID_REPLACEMENT_SCOPE", "replacement", "Replacement must preserve owner and market scope.");
  }
  if (replacement.orderId === current.spec.orderId) {
    fail("INVALID_REPLACEMENT_ID", "orderId", "Replacement order ID must be different.");
  }
  if (replacement.parentOrderId && replacement.parentOrderId !== current.spec.orderId) {
    fail("INVALID_REPLACEMENT_PARENT", "parentOrderId", "Replacement parent must reference the replaced order.");
  }

  const replaced = applyPendingOrderEvent(current, {
    type: "replaced",
    eventId: event.replacedEventId,
    orderId: current.spec.orderId,
    sequence: nextPendingOrderSequence(current),
    at: event.at,
    replacementOrderId: replacement.orderId,
    reason: event.reason,
  });
  const replacementSpec = {...replacement, parentOrderId: current.spec.orderId};
  const submitted = applyPendingOrderEvent(null, {
    type: "submitted",
    eventId: event.submittedEventId,
    orderId: replacement.orderId,
    sequence: 1,
    at: replacement.submittedAt,
    spec: replacementSpec,
  });
  return Object.freeze({replaced, replacement: submitted});
}