import assert from "node:assert/strict";
import test from "node:test";

import {
  isSyntheticObservation,
  isSyntheticReconciliationResult,
  reconcileSyntheticProviderResult,
} from "../app/lib/execution/internal/reconciliation.ts";
import { evaluateSyntheticProvider } from "../app/lib/execution/internal/provider.ts";

const request = Object.freeze({
  intent: Object.freeze({ symbol: "BTC_USDT" }),
  preview: Object.freeze({ symbol: "BTC_USDT" }),
});

const expected = [
  ["would-accept", "would-observe-accepted", "matched-accepted", "terminal"],
  ["would-reject", "would-observe-rejected", "matched-rejected", "terminal"],
  ["would-accept", "would-observe-rejected", "conflict", "conflict"],
  ["would-reject", "would-observe-accepted", "conflict", "conflict"],
  ["would-timeout", "would-observe-missing", "unresolved-timeout", "unresolved"],
  ["would-unknown", "would-observe-missing", "unresolved-unknown", "unresolved"],
  ["would-timeout", "would-observe-accepted", "recovered-accepted", "terminal"],
  ["would-unknown", "would-observe-accepted", "recovered-accepted", "terminal"],
  ["would-timeout", "would-observe-rejected", "recovered-rejected", "terminal"],
  ["would-unknown", "would-observe-rejected", "recovered-rejected", "terminal"],
];

test("synthetic reconciliation matrix is deterministic, bounded and never executed", () => {
  for (const [providerOutcome, observation, resolution, certainty] of expected) {
    const result = reconcileSyntheticProviderResult(evaluateSyntheticProvider(providerOutcome, request), observation);
    assert.deepEqual(result, {
      contractVersion: "synthetic-reconciliation/1.0.0",
      provenance: "deterministic-synthetic-fixture",
      initialProviderOutcome: providerOutcome,
      observedOutcome: observation,
      resolution,
      certainty,
      executed: false,
    });
    assert.equal(isSyntheticReconciliationResult(result), true);
    assert.doesNotMatch(JSON.stringify(result), /order|fill|trade|acknowledgement|credential/i);
  }
});

test("observation and result validators reject malformed, extra and executing shapes", () => {
  assert.equal(isSyntheticObservation("accepted"), false);
  assert.throws(() => reconcileSyntheticProviderResult(evaluateSyntheticProvider("would-accept", request), "accepted"));
  const valid = reconcileSyntheticProviderResult(evaluateSyntheticProvider("would-accept", request), "would-observe-accepted");
  for (const malformed of [
    { ...valid, executed: true },
    { ...valid, extra: "unbounded" },
    { ...valid, contractVersion: "synthetic-reconciliation/2.0.0" },
    { ...valid, resolution: "recovered-accepted" },
    { ...valid, initialProviderOutcome: "would-timeout" },
    { ...valid, initialProviderOutcome: "constructor" },
  ]) assert.equal(isSyntheticReconciliationResult(malformed), false);
});
