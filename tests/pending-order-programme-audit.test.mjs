import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {applyPendingOrderEvent, replayPendingOrder} from "../app/lib/pending-order-lifecycle.ts";
import {
  createSpotAccountState,
  replaySpotAccount,
  simulateSpotOrder,
} from "../app/lib/spot-order-simulation.ts";

const simulationModules = [
  "app/lib/pending-order-lifecycle.ts",
  "app/lib/futures-limit-order-simulation.ts",
  "app/lib/futures-conditional-order-simulation.ts",
  "app/lib/futures-chase-limit-simulation.ts",
  "app/lib/futures-protective-exit-simulation.ts",
  "app/lib/spot-order-simulation.ts",
];

test("pending-order reducers contain no credential, private API or live-routing boundary", async () => {
  const sources = await Promise.all(simulationModules.map((path) => readFile(path, "utf8")));
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const path = simulationModules[index];
    assert.doesNotMatch(source, /\bfetch\s*\(/, `${path} must not make network requests`);
    assert.doesNotMatch(source, /process\.env/, `${path} must not inspect credentials or environment secrets`);
    assert.doesNotMatch(source, /api[_-]?key|secret[_-]?key|private[_-]?endpoint/i, `${path} must remain simulation-only`);
    assert.doesNotMatch(source, /submitLive|placeLive|LIVE_TRADING_ENABLED/, `${path} must not expose live routing`);
  }
});

test("spot account and order evidence replay independently to exact balances", () => {
  const pristine = createSpotAccountState({
    accountId: "audit-account-1",
    marketKey: "mexc:spot:BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    baseAvailable: 2,
    quoteAvailable: 1000,
    openedAt: 900,
  });
  const spec = {
    orderId: "audit-spot-order-1",
    ownerId: "audit-owner-1",
    marketKey: "mexc:spot:BTCUSDT",
    marketType: "spot",
    symbol: "BTCUSDT",
    side: "buy",
    kind: "limit",
    quantity: 2,
    timeInForce: "IOC",
    reduceOnly: false,
    postOnly: false,
    submittedAt: 1000,
    limitPrice: 100,
  };
  const submitted = applyPendingOrderEvent(null, {
    type: "submitted",
    eventId: "audit-spot-order-1:submitted",
    orderId: spec.orderId,
    sequence: 1,
    at: spec.submittedAt,
    spec,
  });
  const result = simulateSpotOrder(
    submitted,
    pristine,
    {
      marketKey: "mexc:spot:BTCUSDT",
      symbol: "BTCUSDT",
      sequence: 1,
      observedAt: 1010,
      bids: [{price: 99.5, quantity: 2}],
      asks: [{price: 99, quantity: 0.5}],
    },
    {
      baseAsset: "BTC",
      quoteAsset: "USDT",
      priceTick: 0.5,
      quantityStep: 0.1,
      minimumQuantity: 0.1,
      maximumQuantity: 100,
    },
  );
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.account.quoteReserved, 0);
  assert.equal(result.account.quoteAvailable, 950.5);
  assert.equal(result.account.baseAvailable, 2.5);
  assert.ok(result.account.baseAvailable >= 0);
  assert.ok(result.account.quoteAvailable >= 0);
  assert.deepEqual(replayPendingOrder(result.order.events), result.order);
  assert.deepEqual(replaySpotAccount(pristine, result.account.events), result.account);
});

test("programme evidence records TP/SL, reduce-only, accounting and honest uncertainty", async () => {
  const [protective, manualReduceOnly, academy, audit, roadmap] = await Promise.all([
    readFile("app/lib/futures-protective-exit-simulation.ts", "utf8"),
    readFile("tests/manual-paper-reduce-only.test.mjs", "utf8"),
    readFile("app/school/pending-order-academy.ts", "utf8"),
    readFile("docs/PENDING_ORDER_PROGRAMME_AUDIT.md", "utf8"),
    readFile("ROADMAP.md", "utf8"),
  ]);
  assert.match(protective, /reduceOnly: true/);
  assert.match(protective, /parentOrderId: input\.position\.tradeId/);
  assert.match(protective, /PROTECTIVE_EXIT_EXCEEDS_POSITION/);
  assert.match(manualReduceOnly, /risk-exit/);
  assert.match(manualReduceOnly, /stopLoss:99/);
  assert.match(academy, /limit TP\/SL may activate and remain working/);
  assert.match(academy, /must never reverse it/);
  assert.match(academy, /does not prove that your quantity filled/);
  assert.match(audit, /Spot accounting findings/);
  assert.match(audit, /does not claim exchange queue priority/);
  assert.match(roadmap, /Advanced pending-order simulation and DizyAcademy — complete/);
});
