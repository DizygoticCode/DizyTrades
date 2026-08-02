import test from "node:test";
import assert from "node:assert/strict";
import {
  GUIDED_REVIEW_END,
  GUIDED_REVIEW_START,
  emptyGuidedTradeReview,
  extractGuidedTradeReview,
  guidedTradeReviewCompletion,
  normaliseGuidedTradeReview,
  renderGuidedTradeReview,
  upsertGuidedTradeReviewNotes,
} from "../app/lib/guided-trade-review.ts";

const context = {
  tradeId: "trade-1",
  symbol: "BTC_USDT",
  timeframe: "15m",
  direction: "long",
  pnlPct: 2.345,
  closeReason: "target",
  replayAvailable: true,
  historicalFlowAvailable: false,
  dizyBrainReviewAvailable: true,
};

const complete = {
  context: "Range breakout after reclaim.",
  entryEvidence: "Closed above resistance with confluence.",
  management: "Held stop and reduced at target one.",
  exit: "Exited at the planned target.",
  strength: "Waited for confirmation.",
  improvement: "Size slightly smaller during thin depth.",
  repeatRule: "Require a confirmed close before entry.",
};

test("guided review completion is deterministic", () => {
  assert.deepEqual(guidedTradeReviewCompletion(emptyGuidedTradeReview()), {
    completed: 0,
    total: 7,
    percentage: 0,
    complete: false,
  });
  assert.equal(guidedTradeReviewCompletion(complete).complete, true);
  assert.equal(guidedTradeReviewCompletion(complete).percentage, 100);
});

test("guided review renders human-readable evidence without profit scoring", () => {
  const block = renderGuidedTradeReview(complete, context);
  assert.ok(block.startsWith(GUIDED_REVIEW_START));
  assert.ok(block.endsWith(GUIDED_REVIEW_END));
  assert.match(block, /Outcome: \+2\.35% · target/);
  assert.match(block, /Replay available/);
  assert.match(block, /Historical DizyFlow unavailable/);
  assert.doesNotMatch(block, /probability|score|prediction/i);
});

test("guided review round-trips through Journal notes", () => {
  const block = renderGuidedTradeReview(complete, context);
  const notes = upsertGuidedTradeReviewNotes("Free-form notes.", block);
  assert.equal(extractGuidedTradeReview(notes)?.repeatRule, complete.repeatRule);
  assert.match(notes, /^Free-form notes\./);
});

test("upsert replaces an existing review without duplicating markers", () => {
  const first = renderGuidedTradeReview(complete, context);
  const changed = { ...complete, improvement: "Do not chase the second impulse." };
  const second = renderGuidedTradeReview(changed, context);
  const notes = upsertGuidedTradeReviewNotes(
    `Before\n\n${first}\n\nAfter`,
    second,
  );
  assert.equal(notes.split(GUIDED_REVIEW_START).length - 1, 1);
  assert.equal(notes.split(GUIDED_REVIEW_END).length - 1, 1);
  assert.match(notes, /Before/);
  assert.match(notes, /After/);
  assert.equal(extractGuidedTradeReview(notes)?.improvement, changed.improvement);
});

test("normalisation bounds values and converts CRLF", () => {
  const value = normaliseGuidedTradeReview({
    context: `  first\r\nsecond  `,
    entryEvidence: "x".repeat(5_000),
  });
  assert.equal(value.context, "first\nsecond");
  assert.equal(value.entryEvidence.length, 4_000);
});
