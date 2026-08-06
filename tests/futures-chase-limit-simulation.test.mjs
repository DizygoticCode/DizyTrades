import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPendingOrderEvent,
  replayPendingOrder,
} from "../app/lib/pending-order-lifecycle.ts";
import {
  FuturesChaseLimitSimulationError,
  replayFuturesChaseLimitOrder,
  simulateFuturesChaseLimitOrder,
} from "../app/lib/futures-chase-limit-simulation.ts";

const rules = {
  priceTick: 0.5,
  quantityStep: 0.1,
  minimumQuantity: 0.1,
  maximumQuantity: 100,
};

const hedge = {positionMode: "hedge"};

const spec = (overrides = {}) => ({
  orderId: "chase-order-1",
  ownerId: "owner-1",
  marketKey: "mexc:futures:BTC_USDT",
  marketType: "futures",
  symbol: "BTC_USDT",
  side: "buy",
  kind: "chase-limit",
  quantity: 2,
  timeInForce: "GTC",
  reduceOnly: false,
  postOnly: false,
  submittedAt: 1000,
  limitPrice: 99.5,
  protectionDistance: 2,
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

const snapshot = (sequence, observedAt, lastPrice, overrides = {}) => ({
  marketKey: "mexc:futures:BTC_USDT",
  symbol: "BTC_USDT",
  sequence,
  observedAt,
  lastPrice,
  bids: [
    {price: 99.5, quantity: 3},
    {price: 99, quantity: 4},
  ],
  asks: [
    {price: 100, quantity: 3},
    {price: 100.5, quantity: 4},
  ],
  ...overrides,
});

test("chase-limit rejects one-way mode before activation", () => {
  const result = simulateFuturesChaseLimitOrder(
    submit(),
    snapshot(1, 1010, 100),
    rules,
    {positionMode: "one-way"},
  );
  assert.equal(result.order.status, "rejected");
  assert.equal(result.order.rejectionReason, "CHASE_REQUIRES_HEDGE_MODE");
  assert.equal(result.order.activatedAt, null);
  assert.equal(result.observations[0].action, "rejected");
});

test("chase-limit rejects an initial price that is not the same-side best quote", () => {
  const result = simulateFuturesChaseLimitOrder(
    submit(spec({limitPrice: 99})),
    snapshot(2, 1020, 100),
    rules,
    hedge,
  );
  assert.equal(result.order.status, "rejected");
  assert.equal(result.order.rejectionReason, "INITIAL_LIMIT_PRICE_MUST_MATCH_BEST_QUOTE");
});

test("buy chase accepts at best bid and reprices with the book", () => {
  const active = simulateFuturesChaseLimitOrder(
    submit(),
    snapshot(3, 1030, 100),
    rules,
    hedge,
  );
  assert.equal(active.order.status, "working");
  assert.equal(active.currentLimitPrice, 99.5);
  assert.equal(active.chaseBoundaryPrice, 101.5);

  const repriced = simulateFuturesChaseLimitOrder(
    active,
    snapshot(4, 1040, 100.5, {
      bids: [{price: 100, quantity: 2}],
      asks: [{price: 100.5, quantity: 2}],
    }),
    rules,
    hedge,
  );
  assert.equal(repriced.order.status, "working");
  assert.equal(repriced.currentLimitPrice, 100);
  assert.equal(repriced.observations.at(-1).action, "repriced");
  assert.equal(repriced.order.fills.length, 0);
});

test("explicit chase maker evidence creates a partial fill without inventing queue priority", () => {
  const active = simulateFuturesChaseLimitOrder(
    submit(),
    snapshot(5, 1050, 100),
    rules,
    hedge,
  );
  const result = simulateFuturesChaseLimitOrder(
    active,
    snapshot(6, 1060, 100.5, {
      bids: [{price: 100, quantity: 2}],
      asks: [{price: 100.5, quantity: 2}],
      observedMakerFillQuantity: 0.8,
    }),
    rules,
    hedge,
  );
  assert.equal(result.order.status, "partially-filled");
  assert.equal(result.order.filledQuantity, 0.8);
  assert.equal(result.order.remainingQuantity, 1.2);
  assert.equal(result.order.fills[0].price, 100);
  assert.equal(result.order.fills[0].liquidityRole, "maker");
  assert.equal(result.order.fills[0].evidence.queuePositionKnown, false);
  assert.equal(result.observations.at(-1).action, "partially-filled");
  assert.deepEqual(replayPendingOrder(result.order.events), result.order);
});

test("buy chase cancels the unfilled remainder when last price reaches maximum distance", () => {
  const active = simulateFuturesChaseLimitOrder(
    submit(),
    snapshot(7, 1070, 100),
    rules,
    hedge,
  );
  const partial = simulateFuturesChaseLimitOrder(
    active,
    snapshot(8, 1080, 100.5, {observedMakerFillQuantity: 0.5}),
    rules,
    hedge,
  );
  const result = simulateFuturesChaseLimitOrder(
    partial,
    snapshot(9, 1090, 101.5, {
      bids: [{price: 101, quantity: 2}],
      asks: [{price: 101.5, quantity: 2}],
    }),
    rules,
    hedge,
  );
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.order.filledQuantity, 0.5);
  assert.equal(result.order.remainingQuantity, 1.5);
  assert.equal(result.order.events.at(-1).reason, "MAXIMUM_CHASE_DISTANCE_REACHED");
  assert.equal(result.observations.at(-1).action, "distance-cancelled");
});

test("sell chase follows best ask downward and cancels at its lower boundary", () => {
  const input = submit(spec({
    orderId: "sell-chase-1",
    side: "sell",
    limitPrice: 100,
    protectionDistance: 2,
  }));
  const active = simulateFuturesChaseLimitOrder(
    input,
    snapshot(10, 1100, 99.5, {
      bids: [{price: 99.5, quantity: 2}],
      asks: [{price: 100, quantity: 2}],
    }),
    rules,
    hedge,
  );
  const repriced = simulateFuturesChaseLimitOrder(
    active,
    snapshot(11, 1110, 99, {
      bids: [{price: 98.5, quantity: 2}],
      asks: [{price: 99, quantity: 2}],
    }),
    rules,
    hedge,
  );
  assert.equal(repriced.currentLimitPrice, 99);
  assert.equal(repriced.chaseBoundaryPrice, 98);

  const result = simulateFuturesChaseLimitOrder(
    repriced,
    snapshot(12, 1120, 98, {
      bids: [{price: 97.5, quantity: 2}],
      asks: [{price: 98, quantity: 2}],
    }),
    rules,
    hedge,
  );
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.order.events.at(-1).reason, "MAXIMUM_CHASE_DISTANCE_REACHED");
});

test("chase-limit rejects non-GTC time in force", () => {
  const result = simulateFuturesChaseLimitOrder(
    submit(spec({timeInForce: "IOC"})),
    snapshot(13, 1130, 100),
    rules,
    hedge,
  );
  assert.equal(result.order.status, "rejected");
  assert.equal(result.order.rejectionReason, "CHASE_REQUIRES_GTC");
});

test("chase-limit rejects protection distance that does not align to price tick", () => {
  const result = simulateFuturesChaseLimitOrder(
    submit(spec({protectionDistance: 1.25})),
    snapshot(14, 1140, 100),
    rules,
    hedge,
  );
  assert.equal(result.order.status, "rejected");
  assert.equal(result.order.rejectionReason, "PROTECTION_DISTANCE_PRECISION");
});

test("chase observations fail closed on duplicate book sequences", () => {
  const active = simulateFuturesChaseLimitOrder(
    submit(),
    snapshot(15, 1150, 100),
    rules,
    hedge,
  );
  assert.throws(
    () => simulateFuturesChaseLimitOrder(active, snapshot(15, 1160, 100), rules, hedge),
    (error) =>
      error instanceof FuturesChaseLimitSimulationError &&
      error.code === "NON_MONOTONIC_BOOK_SEQUENCE",
  );
});

test("chase-limit replay is deterministic and immutable", () => {
  const order = submit(spec({orderId: "chase-replay-1", quantity: 1}));
  const observations = [
    snapshot(16, 1160, 100),
    snapshot(17, 1170, 100.5, {
      bids: [{price: 100, quantity: 2}],
      asks: [{price: 100.5, quantity: 2}],
      observedMakerFillQuantity: 0.4,
    }),
    snapshot(18, 1180, 100.5, {
      bids: [{price: 100, quantity: 2}],
      asks: [{price: 100.5, quantity: 2}],
      observedMakerFillQuantity: 0.6,
    }),
  ];
  const replayed = replayFuturesChaseLimitOrder(order, observations, rules, hedge);
  let incremental = simulateFuturesChaseLimitOrder(order, observations[0], rules, hedge);
  incremental = simulateFuturesChaseLimitOrder(incremental, observations[1], rules, hedge);
  incremental = simulateFuturesChaseLimitOrder(incremental, observations[2], rules, hedge);
  assert.deepEqual(replayed, incremental);
  assert.equal(replayed.order.status, "filled");
  assert.equal(Object.isFrozen(replayed), true);
  assert.equal(Object.isFrozen(replayed.observations), true);
});
