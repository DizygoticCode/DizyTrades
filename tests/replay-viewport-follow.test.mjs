import assert from "node:assert/strict";
import test from "node:test";
import { calculateReplayFollowRange } from "../app/lib/chart/replay-viewport-follow.ts";

test("Replay follow preserves zoom span and right-side spacing", () => {
  const range = calculateReplayFollowRange({
    currentRange: { from: 20, to: 100 },
    previousCandleCount: 76,
    candleCount: 77,
  });
  assert.deepEqual(range, { from: 21, to: 101 });
  assert.equal(range.to - range.from, 80);
  assert.equal(range.to - 76, 25);
});

test("Replay follow handles backward steps and large jumps", () => {
  const backward = calculateReplayFollowRange({
    currentRange: { from: 21, to: 101 },
    previousCandleCount: 77,
    candleCount: 76,
  });
  assert.deepEqual(backward, { from: 20, to: 100 });

  const jump = calculateReplayFollowRange({
    currentRange: { from: 20, to: 100 },
    previousCandleCount: 76,
    candleCount: 176,
  });
  assert.deepEqual(jump, { from: 120, to: 200 });
});

test("Replay follow restores a panned-away latest candle conservatively", () => {
  const range = calculateReplayFollowRange({
    currentRange: { from: 10, to: 50 },
    previousCandleCount: 100,
    candleCount: 101,
  });
  assert.deepEqual(range, { from: 70, to: 110 });
  assert.ok(100 >= range.from && 100 <= range.to);
});

test("Replay follow rejects unusable or unchanged inputs", () => {
  assert.equal(
    calculateReplayFollowRange({
      currentRange: null,
      previousCandleCount: 10,
      candleCount: 11,
    }),
    null,
  );
  assert.equal(
    calculateReplayFollowRange({
      currentRange: { from: 5, to: 5 },
      previousCandleCount: 10,
      candleCount: 11,
    }),
    null,
  );
  assert.equal(
    calculateReplayFollowRange({
      currentRange: { from: 0, to: 20 },
      previousCandleCount: 10,
      candleCount: 10,
    }),
    null,
  );
});
