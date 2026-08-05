import assert from "node:assert/strict";
import test from "node:test";

import { DizyFlowPrimitive } from "../app/lib/chart/dizyflow-primitive.ts";

function createStore() {
  let diagnostics = { candleCount: 0 };
  return {
    getDiagnostics: () => diagnostics,
    updateDiagnostics: (next) => {
      diagnostics = { ...diagnostics, ...next };
    },
  };
}

const candles = Object.freeze([
  Object.freeze({ time: 1_700_000_000, open: 100, high: 102, low: 99, close: 101, volume: 10 }),
  Object.freeze({ time: 1_700_000_900, open: 101, high: 103, low: 100, close: 102, volume: 12 }),
]);

test("a replacement DizyFlow primitive inherits the latest projection from its stable render store", () => {
  const store = createStore();
  const first = new DizyFlowPrimitive(store);

  assert.equal(
    first.setProjection(candles, "15m", 7, {
      count: candles.length,
      finalTime: candles.at(-1).time,
      generation: 7,
    }),
    true,
  );
  assert.equal(store.getDiagnostics().candleCount, 2);

  store.updateDiagnostics({ candleCount: 0 });
  new DizyFlowPrimitive(store);
  assert.equal(store.getDiagnostics().candleCount, 2);
});

test("projection retention remains isolated to one render-store lifetime", () => {
  const firstStore = createStore();
  const first = new DizyFlowPrimitive(firstStore);
  first.setProjection(candles, "15m", 3, {
    count: candles.length,
    finalTime: candles.at(-1).time,
    generation: 3,
  });

  const separateStore = createStore();
  new DizyFlowPrimitive(separateStore);
  assert.equal(separateStore.getDiagnostics().candleCount, 0);
});
