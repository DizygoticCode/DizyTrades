import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPendingOrderEvent,
  replayPendingOrder,
} from "../app/lib/pending-order-lifecycle.ts";
import {
  FuturesConditionalSimulationError,
  replayFuturesConditionalOrder,
  simulateFuturesConditionalOrder,
} from "../app/lib/futures-conditional-order-simulation.ts";

const rules = {
  priceTick: 0.5,
  quantityStep: 0.1,
  minimumQuantity: 0.1,
  maximumQuantity: 100,
};

const spec = (overrides = {}) => ({
  orderId: "conditional-order-1",
  ownerId: "owner-1",
  marketKey: "mexc:futures:BTC_USDT",
  marketType: "futures",
  symbol: "BTC_USDT",
  side: "buy",
  kind: "trigger-market",
  quantity: 2,
  timeInForce: "GTC",
  reduceOnly: false,
  postOnly: false,
  submittedAt: 1000,
  triggerPrice: 102,
  ...overrides,
});

const submit = (input = spec()) =>
  applyPendingOrderEvent(null, {
    type: "submitted",
    eventId: `${input.orderId}:submitted`,
    orderId: input.orderId,
    sequence: 1,
    at: input.submittedAt,
    spec: input,
  });

const snapshot = (sequence, observedAt, referencePrice, overrides = {}) => ({
  marketKey: "mexc:futures:BTC_USDT",
  symbol: "BTC_USDT",
  sequence,
  observedAt,
  referencePrice,
  priceSource: "fair",
  bids: [
    {price: 99.5, quantity: 3},
    {price: 99, quantity: 4},
  ],
  asks: [
    {price: 100, quantity: 0.8},
    {price: 100.5, quantity: 2},
  ],
  ...overrides,
});

test("trigger-market remains accepted while the fair-price threshold is unmet", () => {
  const result = simulateFuturesConditionalOrder(
    submit(),
    snapshot(1, 1010, 101),
    rules,
  );
  assert.equal(result.order.status, "accepted");
  assert.equal(result.order.activatedAt, null);
  assert.equal(result.observations[0].action, "waiting");
  assert.equal(result.effectiveTriggerPrice, 102);
});

test("trigger-market activates as taker and cancels an unfilled visible-depth remainder", () => {
  const result = simulateFuturesConditionalOrder(
    submit(spec({quantity: 2})),
    snapshot(2, 1020, 102, {asks: [{price: 100, quantity: 0.75}]}),
    rules,
  );
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.order.filledQuantity, 0.75);
  assert.equal(result.order.remainingQuantity, 1.25);
  assert.equal(result.order.fills[0].liquidityRole, "taker");
  assert.equal(result.order.fills[0].evidence.conditionalKind, "trigger-market");
  assert.equal(result.order.events.at(-1).reason, "INSUFFICIENT_VISIBLE_DEPTH");
  assert.deepEqual(replayPendingOrder(result.order.events), result.order);
});

test("trigger-limit uses activation-time depth and records immediate taker evidence", () => {
  const result = simulateFuturesConditionalOrder(
    submit(spec({kind: "trigger-limit", triggerPrice: 101, limitPrice: 100.5})),
    snapshot(3, 1030, 101, {
      asks: [
        {price: 100, quantity: 0.8},
        {price: 100.5, quantity: 0.5},
      ],
    }),
    rules,
  );
  assert.equal(result.order.status, "partially-filled");
  assert.equal(result.order.filledQuantity, 1.3);
  assert.equal(result.order.fills[0].liquidityRole, "taker");
  assert.equal(result.order.fills[0].evidence.phase, "activation");
});

test("a triggered GTC limit order receives maker fills only on later resting depth", () => {
  const triggered = simulateFuturesConditionalOrder(
    submit(spec({kind: "trigger-limit", quantity: 1, triggerPrice: 101, limitPrice: 100})),
    snapshot(4, 1040, 101, {asks: [{price: 101.5, quantity: 2}]}),
    rules,
  );
  assert.equal(triggered.order.status, "working");
  assert.equal(triggered.order.fills.length, 0);

  const result = simulateFuturesConditionalOrder(
    triggered,
    snapshot(5, 1050, 101.5, {asks: [{price: 100, quantity: 1}]}),
    rules,
  );
  assert.equal(result.order.status, "filled");
  assert.equal(result.order.fills[0].liquidityRole, "maker");
  assert.equal(result.order.fills[0].evidence.phase, "resting");
  assert.equal(result.observations.at(-1).action, "resting-match");
});

test("trigger-limit preserves IOC cancellation semantics at activation", () => {
  const result = simulateFuturesConditionalOrder(
    submit(spec({
      kind: "trigger-limit",
      quantity: 1,
      triggerPrice: 101,
      limitPrice: 100,
      timeInForce: "IOC",
    })),
    snapshot(6, 1060, 101, {asks: [{price: 101, quantity: 1}]}),
    rules,
  );
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.order.fills.length, 0);
  assert.equal(result.order.events.at(-1).reason, "IOC_REMAINDER_CANCELLED");
});

test("sell trailing-stop waits for activation, tracks the high and triggers on callback", () => {
  const input = submit(spec({
    orderId: "trailing-sell-1",
    side: "sell",
    kind: "trailing-stop",
    quantity: 1,
    triggerPrice: undefined,
    activationPrice: 105,
    callbackRate: 1,
  }));
  const waiting = simulateFuturesConditionalOrder(input, snapshot(7, 1070, 104), rules);
  assert.equal(waiting.observations.at(-1).action, "waiting");
  const active = simulateFuturesConditionalOrder(waiting, snapshot(8, 1080, 106), rules);
  const extended = simulateFuturesConditionalOrder(active, snapshot(9, 1090, 110), rules);
  assert.equal(extended.trailingExtreme, 110);

  const result = simulateFuturesConditionalOrder(extended, snapshot(10, 1100, 108.8), rules);
  assert.equal(result.order.status, "filled");
  assert.equal(result.trailingExtreme, 110);
  assert.ok(Math.abs(result.effectiveTriggerPrice - 108.9) < 1e-9);
  assert.equal(result.order.fills[0].evidence.trailingExtreme, 110);
});

test("buy trailing-stop without activation price follows the low before triggering", () => {
  const input = submit(spec({
    orderId: "trailing-buy-1",
    kind: "trailing-stop",
    quantity: 1,
    triggerPrice: undefined,
    callbackRate: 2,
  }));
  const first = simulateFuturesConditionalOrder(input, snapshot(11, 1110, 100), rules);
  const lower = simulateFuturesConditionalOrder(first, snapshot(12, 1120, 98), rules);
  assert.equal(lower.trailingExtreme, 98);
  assert.ok(Math.abs(lower.effectiveTriggerPrice - 99.96) < 1e-9);

  const result = simulateFuturesConditionalOrder(lower, snapshot(13, 1130, 100), rules);
  assert.equal(result.order.status, "filled");
  assert.equal(result.observations.at(-1).action, "triggered");
});

test("exchange-invalid callback rates reject before activation", () => {
  const result = simulateFuturesConditionalOrder(
    submit(spec({kind: "trailing-stop", triggerPrice: undefined, callbackRate: 101})),
    snapshot(14, 1140, 100),
    rules,
  );
  assert.equal(result.order.status, "rejected");
  assert.equal(result.order.rejectionReason, "INVALID_CALLBACK_RATE");
  assert.equal(result.order.activatedAt, null);
});

test("conditional observations fail closed on duplicate book sequences", () => {
  const state = simulateFuturesConditionalOrder(
    submit(),
    snapshot(15, 1150, 101),
    rules,
  );
  assert.throws(
    () => simulateFuturesConditionalOrder(state, snapshot(15, 1160, 101), rules),
    (error) =>
      error instanceof FuturesConditionalSimulationError &&
      error.code === "NON_MONOTONIC_BOOK_SEQUENCE",
  );
});

test("the conditional reducer deterministically replays the same observations", () => {
  const order = submit(spec({orderId: "conditional-replay-1", quantity: 1}));
  const observations = [
    snapshot(16, 1160, 101),
    snapshot(17, 1170, 102),
  ];
  const replayed = replayFuturesConditionalOrder(order, observations, rules);
  let incrementallyApplied = simulateFuturesConditionalOrder(order, observations[0], rules);
  incrementallyApplied = simulateFuturesConditionalOrder(
    incrementallyApplied,
    observations[1],
    rules,
  );
  assert.deepEqual(replayed, incrementallyApplied);
  assert.equal(Object.isFrozen(replayed), true);
  assert.equal(Object.isFrozen(replayed.observations), true);
});
