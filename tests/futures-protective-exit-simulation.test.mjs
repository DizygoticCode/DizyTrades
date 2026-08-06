import test from "node:test";
import assert from "node:assert/strict";
import {replayPendingOrder} from "../app/lib/pending-order-lifecycle.ts";
import {
  FuturesProtectiveExitSimulationError,
  createFuturesProtectiveExit,
  replayFuturesProtectiveExit,
  simulateFuturesProtectiveExit,
} from "../app/lib/futures-protective-exit-simulation.ts";

const rules = {
  priceTick: 0.5,
  quantityStep: 0.1,
  minimumQuantity: 0.1,
  maximumQuantity: 100,
};

const position = (overrides = {}) => ({
  tradeId: "trade-long-1",
  marketKey: "mexc:futures:BTC_USDT",
  symbol: "BTC_USDT",
  side: "long",
  remainingQuantity: 2,
  ...overrides,
});

const create = (overrides = {}) => createFuturesProtectiveExit({
  orderId: "protective-order-1",
  ownerId: "owner-1",
  position: position(),
  intent: "take-profit",
  execution: "market",
  requestedQuantity: 2,
  triggerPrice: 105,
  submittedAt: 1000,
  ...overrides,
});

const snapshot = (sequence, observedAt, referencePrice, overrides = {}) => ({
  marketKey: "mexc:futures:BTC_USDT",
  symbol: "BTC_USDT",
  sequence,
  observedAt,
  referencePrice,
  priceSource: "fair",
  bids: [
    {price: 104.5, quantity: 1},
    {price: 104, quantity: 2},
  ],
  asks: [
    {price: 105, quantity: 1},
    {price: 105.5, quantity: 2},
  ],
  ...overrides,
});

test("protective exits bind reduce-only to the trade and cap oversized quantity", () => {
  const state = create({requestedQuantity: 9});
  assert.equal(state.requestedQuantity, 9);
  assert.equal(state.acceptedQuantity, 2);
  assert.equal(state.capped, true);
  assert.equal(state.order.spec.quantity, 2);
  assert.equal(state.order.spec.reduceOnly, true);
  assert.equal(state.order.spec.parentOrderId, "trade-long-1");
  assert.equal(state.order.spec.side, "sell");
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.target), true);
});

test("long take-profit waits below the threshold then exits as a sell taker above it", () => {
  const initial = create();
  const waiting = simulateFuturesProtectiveExit(initial, position(), snapshot(1, 1010, 104.5), rules);
  assert.equal(waiting.order.status, "accepted");
  assert.equal(waiting.observations.at(-1).action, "waiting");
  const result = simulateFuturesProtectiveExit(
    waiting,
    position(),
    snapshot(2, 1020, 105, {bids: [{price: 105, quantity: 2}]}),
    rules,
  );
  assert.equal(result.order.status, "filled");
  assert.equal(result.order.fills[0].liquidityRole, "taker");
  assert.equal(result.order.fills[0].evidence.intent, "take-profit");
  assert.equal(result.order.fills[0].evidence.targetTradeId, "trade-long-1");
  assert.deepEqual(replayPendingOrder(result.order.events), result.order);
});

test("short take-profit uses the opposite below-price trigger direction", () => {
  const short = position({tradeId: "trade-short-1", side: "short"});
  const initial = create({
    orderId: "short-tp-1",
    position: short,
    triggerPrice: 95,
  });
  const waiting = simulateFuturesProtectiveExit(initial, short, snapshot(3, 1030, 96), rules);
  assert.equal(waiting.order.status, "accepted");
  const result = simulateFuturesProtectiveExit(
    waiting,
    short,
    snapshot(4, 1040, 95, {asks: [{price: 95, quantity: 2}]}),
    rules,
  );
  assert.equal(result.order.status, "filled");
  assert.equal(result.order.spec.side, "buy");
  assert.equal(result.order.fills[0].price, 95);
});

test("long stop-loss limit activates below the threshold without losing reduce-only binding", () => {
  const initial = create({
    orderId: "long-sl-limit-1",
    intent: "stop-loss",
    execution: "limit",
    triggerPrice: 99,
    limitPrice: 98.5,
  });
  const result = simulateFuturesProtectiveExit(
    initial,
    position(),
    snapshot(5, 1050, 99, {bids: [{price: 99, quantity: 2}]}),
    rules,
  );
  assert.equal(result.order.status, "filled");
  assert.equal(result.order.spec.kind, "trigger-limit");
  assert.equal(result.order.spec.reduceOnly, true);
  assert.equal(result.order.fills[0].liquidityRole, "taker");
  assert.equal(result.observations.at(-1).action, "triggered");
});

test("take-profit limit may rest after activation and fill later as maker", () => {
  const initial = create({
    orderId: "long-tp-limit-1",
    execution: "limit",
    triggerPrice: 105,
    limitPrice: 105.5,
    requestedQuantity: 1,
  });
  const triggered = simulateFuturesProtectiveExit(
    initial,
    position(),
    snapshot(6, 1060, 105, {bids: [{price: 105, quantity: 3}]}),
    rules,
  );
  assert.equal(triggered.order.status, "working");
  const result = simulateFuturesProtectiveExit(
    triggered,
    position(),
    snapshot(7, 1070, 106, {bids: [{price: 105.5, quantity: 1}]}),
    rules,
  );
  assert.equal(result.order.status, "filled");
  assert.equal(result.order.fills[0].liquidityRole, "maker");
  assert.equal(result.observations.at(-1).action, "resting-match");
});

test("stale trade identity and side changes fail closed before lifecycle mutation", () => {
  const state = create();
  assert.throws(
    () => simulateFuturesProtectiveExit(
      state,
      position({tradeId: "replacement-trade"}),
      snapshot(8, 1080, 105),
      rules,
    ),
    (error) => error instanceof FuturesProtectiveExitSimulationError && error.code === "STALE_PROTECTIVE_EXIT_TARGET",
  );
  assert.throws(
    () => simulateFuturesProtectiveExit(
      state,
      position({side: "short"}),
      snapshot(8, 1080, 105),
      rules,
    ),
    (error) => error instanceof FuturesProtectiveExitSimulationError && error.code === "PROTECTIVE_EXIT_SIDE_MISMATCH",
  );
  assert.equal(state.order.status, "submitted");
  assert.equal(state.order.events.length, 1);
});

test("a changed position cannot leave a protective remainder large enough to reverse", () => {
  const state = create();
  assert.throws(
    () => simulateFuturesProtectiveExit(
      state,
      position({remainingQuantity: 1}),
      snapshot(9, 1090, 105),
      rules,
    ),
    (error) => error instanceof FuturesProtectiveExitSimulationError && error.code === "PROTECTIVE_EXIT_EXCEEDS_POSITION",
  );
});

test("invalid trigger precision rejects with immutable lifecycle evidence", () => {
  const result = simulateFuturesProtectiveExit(
    create({orderId: "bad-trigger-1", triggerPrice: 105.25}),
    position(),
    snapshot(10, 1100, 104),
    rules,
  );
  assert.equal(result.order.status, "rejected");
  assert.equal(result.order.rejectionReason, "TRIGGER_PRICE_PRECISION");
  assert.equal(Object.isFrozen(result.order.events), true);
});

test("protective observations replay to the same immutable result", () => {
  const initial = create({orderId: "protective-replay-1", requestedQuantity: 1});
  const observations = [
    snapshot(11, 1110, 104),
    snapshot(12, 1120, 105, {bids: [{price: 105, quantity: 1}]}),
  ];
  const replayed = replayFuturesProtectiveExit(initial, position(), observations, rules);
  let incremental = simulateFuturesProtectiveExit(initial, position(), observations[0], rules);
  incremental = simulateFuturesProtectiveExit(incremental, position(), observations[1], rules);
  assert.deepEqual(replayed, incremental);
  assert.equal(Object.isFrozen(replayed), true);
  assert.equal(Object.isFrozen(replayed.observations), true);
});

test("terminal protective exits reject further observations", () => {
  const filled = simulateFuturesProtectiveExit(
    create({orderId: "terminal-protective-1", requestedQuantity: 1}),
    position(),
    snapshot(13, 1130, 105, {bids: [{price: 105, quantity: 1}]}),
    rules,
  );
  assert.throws(
    () => simulateFuturesProtectiveExit(filled, position(), snapshot(14, 1140, 106), rules),
    (error) => error instanceof FuturesProtectiveExitSimulationError && error.code === "ORDER_ALREADY_TERMINAL",
  );
});
