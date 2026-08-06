import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPendingOrderEvent,
  replayPendingOrder,
} from "../app/lib/pending-order-lifecycle.ts";
import {
  FuturesLimitSimulationError,
  simulateFuturesLimitOrder,
} from "../app/lib/futures-limit-order-simulation.ts";

const rules = {
  priceTick: 0.5,
  quantityStep: 0.1,
  minimumQuantity: 0.1,
  maximumQuantity: 100,
};

const spec = (overrides = {}) => ({
  orderId: "futures-order-1",
  ownerId: "owner-1",
  marketKey: "mexc:futures:BTC_USDT",
  marketType: "futures",
  symbol: "BTC_USDT",
  side: "buy",
  kind: "limit",
  quantity: 2,
  timeInForce: "GTC",
  reduceOnly: false,
  postOnly: false,
  submittedAt: 1000,
  limitPrice: 100,
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

const book = (overrides = {}) => ({
  marketKey: "mexc:futures:BTC_USDT",
  symbol: "BTC_USDT",
  sequence: 12,
  observedAt: 1010,
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

test("rejects exchange-invalid price precision before activation", () => {
  const result = simulateFuturesLimitOrder(
    submit(spec({limitPrice: 100.25})),
    book(),
    rules,
    "submission",
  );
  assert.equal(result.status, "rejected");
  assert.equal(result.rejectionReason, "LIMIT_PRICE_PRECISION");
  assert.equal(result.fills.length, 0);
});

test("post-only rejects an order that would remove liquidity", () => {
  const result = simulateFuturesLimitOrder(
    submit(spec({kind: "limit-maker", postOnly: true})),
    book(),
    rules,
    "submission",
  );
  assert.equal(result.status, "rejected");
  assert.equal(result.rejectionReason, "POST_ONLY_WOULD_TAKE");
});

test("GTC takes eligible levels and remains partially filled", () => {
  const result = simulateFuturesLimitOrder(submit(), book(), rules, "submission");
  assert.equal(result.status, "partially-filled");
  assert.equal(result.filledQuantity, 0.8);
  assert.equal(result.remainingQuantity, 1.2);
  assert.equal(result.averageFillPrice, 100);
  assert.equal(result.fills[0].liquidityRole, "taker");
  assert.deepEqual(result.fills[0].evidence, {
    source: "futures-order-book",
    phase: "submission",
    bookSequence: 12,
    observedAt: 1010,
    levelIndex: 0,
    availableQuantity: 0.8,
    matchedQuantity: 0.8,
    limitPrice: 100,
  });
});

test("IOC takes available liquidity then cancels the remainder", () => {
  const result = simulateFuturesLimitOrder(
    submit(spec({timeInForce: "IOC"})),
    book(),
    rules,
    "submission",
  );
  assert.equal(result.status, "cancelled");
  assert.equal(result.filledQuantity, 0.8);
  assert.equal(result.remainingQuantity, 1.2);
  assert.equal(result.events.at(-1).reason, "IOC_REMAINDER_CANCELLED");
});

test("FOK cancels without fills when full quantity is unavailable", () => {
  const result = simulateFuturesLimitOrder(
    submit(spec({timeInForce: "FOK"})),
    book(),
    rules,
    "submission",
  );
  assert.equal(result.status, "cancelled");
  assert.equal(result.filledQuantity, 0);
  assert.equal(result.fills.length, 0);
  assert.equal(result.events.at(-1).reason, "FOK_NOT_FULLY_FILLABLE");
});

test("FOK fills atomically when enough eligible depth exists", () => {
  const result = simulateFuturesLimitOrder(
    submit(spec({timeInForce: "FOK", limitPrice: 100.5})),
    book(),
    rules,
    "submission",
  );
  assert.equal(result.status, "filled");
  assert.equal(result.filledQuantity, 2);
  assert.equal(result.fills.length, 2);
  assert.equal(result.averageFillPrice, 100.3);
});

test("a previously resting GTC order receives maker fills", () => {
  const working = simulateFuturesLimitOrder(
    submit(spec({limitPrice: 99})),
    book(),
    rules,
    "submission",
  );
  assert.equal(working.status, "working");

  const result = simulateFuturesLimitOrder(
    working,
    book({
      sequence: 13,
      observedAt: 1020,
      asks: [{price: 99, quantity: 2}],
    }),
    rules,
    "resting",
  );
  assert.equal(result.status, "filled");
  assert.equal(result.fills[0].liquidityRole, "maker");
  assert.equal(result.fills[0].evidence.phase, "resting");
});

test("generated lifecycle events replay to an equivalent immutable result", () => {
  const result = simulateFuturesLimitOrder(
    submit(spec({timeInForce: "IOC"})),
    book(),
    rules,
    "submission",
  );
  const replayed = replayPendingOrder(result.events);
  assert.deepEqual(replayed, result);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.fills[0].evidence), true);
});

test("fails closed on unsorted order-book evidence", () => {
  assert.throws(
    () =>
      simulateFuturesLimitOrder(
        submit(),
        book({asks: [{price: 100.5, quantity: 1}, {price: 100, quantity: 1}]}),
        rules,
        "submission",
      ),
    (error) =>
      error instanceof FuturesLimitSimulationError && error.code === "UNSORTED_ORDER_BOOK",
  );
});
