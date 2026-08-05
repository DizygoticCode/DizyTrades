import assert from "node:assert/strict";
import test from "node:test";

import {
  chartSeriesSyncKey,
  planSeriesSync,
} from "../app/lib/chart/series-sync.ts";

const candles = [
  { time: 1_700_000_000, close: 100 },
  { time: 1_700_000_900, close: 101 },
];

test("a new chart incarnation forces identical candles into the replacement series", () => {
  const previousKey = chartSeriesSyncKey("BTC_USDT", "15m", 4);
  const replacementKey = chartSeriesSyncKey("BTC_USDT", "15m", 5);
  const plan = planSeriesSync(
    candles,
    candles,
    previousKey !== replacementKey,
  );

  assert.notEqual(previousKey, replacementKey);
  assert.equal(plan.operation, "setData");
  assert.deepEqual(plan.data, candles);
});

test("the same chart incarnation preserves the no-op path for unchanged candles", () => {
  const currentKey = chartSeriesSyncKey("ETH_USDT", "1h", 2);
  const plan = planSeriesSync(candles, candles, currentKey !== currentKey);
  assert.equal(plan.operation, "none");
});
