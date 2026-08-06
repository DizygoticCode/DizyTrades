import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPendingOrderEvent,
  replayPendingOrder,
} from "../app/lib/pending-order-lifecycle.ts";
import {
  SpotOrderSimulationError,
  cancelSpotOrderSimulation,
  createSpotAccountState,
  replaySpotAccount,
  replaceSpotOrderSimulation,
  simulateSpotOrder,
} from "../app/lib/spot-order-simulation.ts";

const rules = {
  baseAsset: "BTC",
  quoteAsset: "USDT",
  priceTick: 0.5,
  quantityStep: 0.1,
  minimumQuantity: 0.1,
  maximumQuantity: 100,
};

const account = (overrides = {}) =>
  createSpotAccountState({
    accountId: "spot-account-1",
    marketKey: "mexc:spot:BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    baseAvailable: 3,
    quoteAvailable: 1000,
    openedAt: 900,
    ...overrides,
  });

const spec = (overrides = {}) => ({
  orderId: "spot-order-1",
  ownerId: "owner-1",
  marketKey: "mexc:spot:BTCUSDT",
  marketType: "spot",
  symbol: "BTCUSDT",
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

const book = (sequence, observedAt, overrides = {}) => ({
  marketKey: "mexc:spot:BTCUSDT",
  symbol: "BTCUSDT",
  sequence,
  observedAt,
  bids: [
    {price: 99.5, quantity: 3},
    {price: 99, quantity: 4},
  ],
  asks: [
    {price: 100, quantity: 0.5},
    {price: 100.5, quantity: 3},
  ],
  ...overrides,
});

test("spot account starts with separate available and reserved balances", () => {
  const result = account();
  assert.equal(result.baseAvailable, 3);
  assert.equal(result.baseReserved, 0);
  assert.equal(result.quoteAvailable, 1000);
  assert.equal(result.quoteReserved, 0);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.events), true);
});

test("GTC buy reserves quote, applies price improvement and keeps the remainder reserved", () => {
  const result = simulateSpotOrder(
    submit(),
    account(),
    book(1, 1010, {asks: [{price: 99, quantity: 0.5}, {price: 101, quantity: 3}]}),
    rules,
  );
  assert.equal(result.order.status, "partially-filled");
  assert.equal(result.order.filledQuantity, 0.5);
  assert.equal(result.reservedQuote, 150);
  assert.equal(result.account.quoteReserved, 150);
  assert.equal(result.account.quoteAvailable, 800.5);
  assert.equal(result.account.baseAvailable, 3.5);
  assert.equal(result.order.fills[0].liquidityRole, "taker");
});

test("later resting depth fills the buy as maker and exhausts its reservation", () => {
  const partial = simulateSpotOrder(
    submit(),
    account(),
    book(2, 1020, {asks: [{price: 99, quantity: 0.5}, {price: 101, quantity: 3}]}),
    rules,
  );
  const result = simulateSpotOrder(
    partial,
    book(3, 1030, {asks: [{price: 100, quantity: 1.5}]}),
    rules,
  );
  assert.equal(result.order.status, "filled");
  assert.equal(result.reservedQuote, 0);
  assert.equal(result.account.quoteReserved, 0);
  assert.equal(result.account.quoteAvailable, 800.5);
  assert.equal(result.account.baseAvailable, 5);
  assert.equal(result.order.fills.at(-1).liquidityRole, "maker");
  assert.deepEqual(replayPendingOrder(result.order.events), result.order);
});

test("GTC sell reserves base and credits quote on partial maker and taker fills", () => {
  const initial = simulateSpotOrder(
    submit(spec({orderId: "spot-sell-1", side: "sell", quantity: 2, limitPrice: 100})),
    account(),
    book(4, 1040, {bids: [{price: 100.5, quantity: 0.5}, {price: 99.5, quantity: 3}]}),
    rules,
  );
  assert.equal(initial.order.status, "partially-filled");
  assert.equal(initial.account.baseAvailable, 1);
  assert.equal(initial.account.baseReserved, 1.5);
  assert.equal(initial.account.quoteAvailable, 1050.25);

  const result = simulateSpotOrder(
    initial,
    book(5, 1050, {bids: [{price: 100, quantity: 1.5}]}),
    rules,
  );
  assert.equal(result.order.status, "filled");
  assert.equal(result.account.baseReserved, 0);
  assert.equal(result.account.quoteAvailable, 1200.25);
  assert.equal(result.order.fills.at(-1).liquidityRole, "maker");
});

test("IOC buy releases its unfilled quote reservation", () => {
  const result = simulateSpotOrder(
    submit(spec({orderId: "spot-ioc-1", timeInForce: "IOC"})),
    account(),
    book(6, 1060, {asks: [{price: 99, quantity: 0.5}]}),
    rules,
  );
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.order.filledQuantity, 0.5);
  assert.equal(result.order.events.at(-1).reason, "IOC_REMAINDER_CANCELLED");
  assert.equal(result.account.quoteReserved, 0);
  assert.equal(result.account.quoteAvailable, 950.5);
  assert.equal(result.account.baseAvailable, 3.5);
});

test("FOK cancellation releases the entire reservation and leaves balances unchanged", () => {
  const initial = account();
  const result = simulateSpotOrder(
    submit(spec({orderId: "spot-fok-1", timeInForce: "FOK"})),
    initial,
    book(7, 1070, {asks: [{price: 99, quantity: 0.5}]}),
    rules,
  );
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.order.filledQuantity, 0);
  assert.equal(result.order.events.at(-1).reason, "FOK_NOT_FULLY_FILLABLE");
  assert.equal(result.account.baseAvailable, initial.baseAvailable);
  assert.equal(result.account.quoteAvailable, initial.quoteAvailable);
  assert.equal(result.account.baseReserved, 0);
  assert.equal(result.account.quoteReserved, 0);
});

test("limit-maker rejects marketable depth before reserving funds", () => {
  const result = simulateSpotOrder(
    submit(spec({orderId: "spot-maker-1", kind: "limit-maker", postOnly: true})),
    account(),
    book(8, 1080),
    rules,
  );
  assert.equal(result.order.status, "rejected");
  assert.equal(result.order.rejectionReason, "LIMIT_MAKER_WOULD_TAKE");
  assert.equal(result.account.events.length, 0);
  assert.equal(result.account.quoteAvailable, 1000);
});

test("market buy consumes visible asks as taker then cancels the depth remainder", () => {
  const result = simulateSpotOrder(
    submit(spec({orderId: "spot-market-buy-1", kind: "market", quantity: 1, limitPrice: undefined})),
    account(),
    book(9, 1090, {asks: [{price: 100, quantity: 0.6}]}),
    rules,
  );
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.order.filledQuantity, 0.6);
  assert.equal(result.order.events.at(-1).reason, "MARKET_VISIBLE_DEPTH_EXHAUSTED");
  assert.equal(result.account.quoteAvailable, 940);
  assert.equal(result.account.baseAvailable, 3.6);
  assert.equal(result.order.fills[0].liquidityRole, "taker");
});

test("market sell consumes base and credits quote", () => {
  const result = simulateSpotOrder(
    submit(spec({
      orderId: "spot-market-sell-1",
      side: "sell",
      kind: "market",
      quantity: 1,
      limitPrice: undefined,
    })),
    account(),
    book(10, 1100, {bids: [{price: 99.5, quantity: 1}]}),
    rules,
  );
  assert.equal(result.order.status, "filled");
  assert.equal(result.account.baseAvailable, 2);
  assert.equal(result.account.quoteAvailable, 1099.5);
});

test("insufficient quote balance rejects a buy without account mutation", () => {
  const initial = account({quoteAvailable: 50});
  const result = simulateSpotOrder(
    submit(spec({orderId: "spot-poor-buy-1"})),
    initial,
    book(11, 1110),
    rules,
  );
  assert.equal(result.order.status, "rejected");
  assert.equal(result.order.rejectionReason, "INSUFFICIENT_QUOTE_BALANCE");
  assert.equal(result.account.events.length, 0);
  assert.equal(result.account.quoteAvailable, 50);
});

test("manual cancellation releases the exact remaining reservation", () => {
  const working = simulateSpotOrder(
    submit(spec({orderId: "spot-cancel-1", limitPrice: 99})),
    account(),
    book(12, 1120, {asks: [{price: 100, quantity: 3}]}),
    rules,
  );
  assert.equal(working.order.status, "working");
  assert.equal(working.account.quoteReserved, 198);
  const result = cancelSpotOrderSimulation(working, 1130);
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.account.quoteReserved, 0);
  assert.equal(result.account.quoteAvailable, 1000);
});

test("replacement releases the old reserve before reserving the new order", () => {
  const working = simulateSpotOrder(
    submit(spec({orderId: "spot-old-1", quantity: 2, limitPrice: 99})),
    account(),
    book(13, 1130, {asks: [{price: 100, quantity: 3}]}),
    rules,
  );
  const replacement = spec({
    orderId: "spot-new-1",
    parentOrderId: "spot-old-1",
    quantity: 1,
    limitPrice: 98,
    submittedAt: 1140,
  });
  const result = replaceSpotOrderSimulation(
    working,
    replacement,
    book(14, 1140, {asks: [{price: 100, quantity: 3}]}),
    rules,
    {
      replacedEventId: "spot-old-1:replaced",
      submittedEventId: "spot-new-1:submitted",
      reason: "PRICE_AMENDMENT",
    },
  );
  assert.equal(result.replaced.order.status, "replaced");
  assert.equal(result.replaced.reservedQuote, 0);
  assert.equal(result.replacement.order.status, "working");
  assert.equal(result.replacement.reservedQuote, 98);
  assert.equal(result.replacement.account.quoteAvailable, 902);
  assert.equal(result.replacement.account.quoteReserved, 98);
});

test("account events replay to the exact immutable final balances", () => {
  const pristine = account();
  const result = simulateSpotOrder(
    submit(spec({orderId: "spot-replay-1", timeInForce: "IOC"})),
    pristine,
    book(15, 1150, {asks: [{price: 99, quantity: 0.5}]}),
    rules,
  );
  const replayed = replaySpotAccount(pristine, result.account.events);
  assert.deepEqual(replayed, result.account);
  assert.equal(Object.isFrozen(replayed), true);
  assert.equal(Object.isFrozen(replayed.events), true);
});

test("resting matching fails closed on a stale book observation", () => {
  const working = simulateSpotOrder(
    submit(spec({orderId: "spot-stale-1", limitPrice: 99})),
    account(),
    book(16, 1160, {asks: [{price: 100, quantity: 3}]}),
    rules,
  );
  assert.throws(
    () => simulateSpotOrder(working, book(17, 1150), rules),
    (error) => error instanceof SpotOrderSimulationError && error.code === "STALE_BOOK_TIME",
  );
});
