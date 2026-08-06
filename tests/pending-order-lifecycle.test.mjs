import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPendingOrderEvent,
  nextPendingOrderSequence,
  replayPendingOrder,
  replacePendingOrder,
  validatePendingOrderSpec,
} from "../app/lib/pending-order-lifecycle.ts";

const spec = (overrides = {}) => ({
  orderId: "order-1",
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
    eventId: "event-1",
    orderId: input.orderId,
    sequence: 1,
    at: input.submittedAt,
    spec: input,
  });

const accept = (order, at = 1001) =>
  applyPendingOrderEvent(order, {
    type: "accepted",
    eventId: `event-${nextPendingOrderSequence(order)}`,
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at,
  });

const activate = (order, at = 1002) =>
  applyPendingOrderEvent(order, {
    type: "activated",
    eventId: `event-${nextPendingOrderSequence(order)}`,
    orderId: order.spec.orderId,
    sequence: nextPendingOrderSequence(order),
    at,
  });

test("submitted, accepted and activated states are explicit", () => {
  const submitted = submit();
  const accepted = accept(submitted);
  const working = activate(accepted);
  assert.equal(submitted.status, "submitted");
  assert.equal(accepted.status, "accepted");
  assert.equal(working.status, "working");
  assert.equal(working.remainingQuantity, 2);
  assert.deepEqual(working.events.map((event) => event.type), ["submitted", "accepted", "activated"]);
});

test("partial fills accumulate weighted price and become terminal only when complete", () => {
  let order = activate(accept(submit()));
  order = applyPendingOrderEvent(order, {
    type: "filled",
    eventId: "event-4",
    orderId: order.spec.orderId,
    sequence: 4,
    at: 1003,
    fill: {fillId: "fill-1", quantity: 0.5, price: 100, liquidityRole: "maker"},
  });
  assert.equal(order.status, "partially-filled");
  assert.equal(order.remainingQuantity, 1.5);
  order = applyPendingOrderEvent(order, {
    type: "filled",
    eventId: "event-5",
    orderId: order.spec.orderId,
    sequence: 5,
    at: 1004,
    fill: {fillId: "fill-2", quantity: 1.5, price: 102, liquidityRole: "taker"},
  });
  assert.equal(order.status, "filled");
  assert.equal(order.remainingQuantity, 0);
  assert.equal(order.averageFillPrice, 101.5);
  assert.equal(order.terminalAt, 1004);
  assert.deepEqual(order.fills.map((fill) => fill.liquidityRole), ["maker", "taker"]);
});

test("deterministic replay reproduces the exact state", () => {
  let order = activate(accept(submit()));
  order = applyPendingOrderEvent(order, {
    type: "filled",
    eventId: "event-4",
    orderId: order.spec.orderId,
    sequence: 4,
    at: 1003,
    fill: {fillId: "fill-1", quantity: 1, price: 99, liquidityRole: "maker", evidence: {bookSequence: 42}},
  });
  order = applyPendingOrderEvent(order, {
    type: "cancelled",
    eventId: "event-5",
    orderId: order.spec.orderId,
    sequence: 5,
    at: 1004,
    reason: "user-request",
  });
  assert.deepEqual(replayPendingOrder(order.events), order);
});

test("lifecycle application is immutable", () => {
  const submitted = submit();
  const accepted = accept(submitted);
  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.events.length, 1);
  assert.equal(accepted.events.length, 2);
  assert.notEqual(submitted, accepted);
  assert.ok(Object.isFrozen(accepted));
  assert.ok(Object.isFrozen(accepted.events));
  assert.ok(Object.isFrozen(accepted.spec));
});

test("terminal, duplicate, out-of-sequence and overfill events fail closed", () => {
  let order = activate(accept(submit()));
  assert.throws(
    () => applyPendingOrderEvent(order, {
      type: "filled",
      eventId: "event-4",
      orderId: order.spec.orderId,
      sequence: 4,
      at: 1003,
      fill: {fillId: "fill-over", quantity: 3, price: 100, liquidityRole: "unknown"},
    }),
    /remaining order quantity/,
  );
  assert.throws(
    () => applyPendingOrderEvent(order, {
      type: "cancelled",
      eventId: "event-3",
      orderId: order.spec.orderId,
      sequence: 4,
      at: 1003,
      reason: "duplicate-id",
    }),
    /already been applied/,
  );
  assert.throws(
    () => applyPendingOrderEvent(order, {
      type: "cancelled",
      eventId: "event-5",
      orderId: order.spec.orderId,
      sequence: 5,
      at: 1003,
      reason: "gap",
    }),
    /Expected lifecycle sequence 4/,
  );
  order = applyPendingOrderEvent(order, {
    type: "cancelled",
    eventId: "event-4",
    orderId: order.spec.orderId,
    sequence: 4,
    at: 1003,
    reason: "user-request",
  });
  assert.throws(
    () => applyPendingOrderEvent(order, {
      type: "expired",
      eventId: "event-5",
      orderId: order.spec.orderId,
      sequence: 5,
      at: 1004,
      reason: "late-expiry",
    }),
    /terminal order/,
  );
});

test("replacement closes the old order and links a fresh immutable submission", () => {
  const current = activate(accept(submit()));
  const result = replacePendingOrder(current, spec({
    orderId: "order-2",
    quantity: 3,
    submittedAt: 1010,
    limitPrice: 98,
  }), {
    replacedEventId: "event-4",
    submittedEventId: "replacement-event-1",
    at: 1009,
    reason: "price-amendment",
  });
  assert.equal(result.replaced.status, "replaced");
  assert.equal(result.replaced.replacementOrderId, "order-2");
  assert.equal(result.replacement.status, "submitted");
  assert.equal(result.replacement.spec.parentOrderId, "order-1");
  assert.equal(result.replacement.spec.quantity, 3);
});

test("order-kind requirements are validated centrally", () => {
  assert.throws(() => validatePendingOrderSpec(spec({kind: "trigger-limit", triggerPrice: undefined})), /trigger price/);
  assert.throws(() => validatePendingOrderSpec(spec({kind: "trailing-stop", limitPrice: undefined, callbackRate: undefined})), /callback rate/);
  assert.throws(() => validatePendingOrderSpec(spec({kind: "limit-maker", postOnly: false})), /post-only/);
  assert.throws(() => validatePendingOrderSpec(spec({kind: "market", limitPrice: undefined, postOnly: true})), /limit-style/);
  assert.doesNotThrow(() => validatePendingOrderSpec(spec({kind: "chase-limit", protectionDistance: 5})));
});
