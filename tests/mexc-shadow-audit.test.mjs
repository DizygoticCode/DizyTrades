import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMexcAccountSnapshot,
} from "../app/lib/mexc-account-state-availability.ts";
import {
  buildMexcAccountStateSnapshot,
} from "../app/lib/mexc-account-state.ts";
import {
  reconcileMexcAccountWithDizyPaper,
} from "../app/lib/mexc-dizypaper-reconciliation.ts";
import {
  MexcShadowAuditError,
  appendMexcShadowAuditEvent,
  assertMexcShadowAuditPayloadIsMinimised,
  canonicalMexcShadowAuditJson,
  mexcShadowAuditPayload,
  verifyMexcShadowAuditChain,
} from "../app/lib/mexc-shadow-audit.ts";
import {
  previewMexcShadowOrder,
} from "../app/lib/mexc-shadow-order-preview.ts";
import { newManualAccount } from "../app/lib/manual-paper.ts";

function freshState() {
  const assets = [
    {
      currency: "USDT",
      positionMargin: "0",
      frozenBalance: "0",
      availableBalance: "9876.54321",
      cashBalance: "9876.54321",
      equity: "9876.54321",
      unrealized: "0",
      bonus: "0",
    },
  ];
  const positions = [];
  const snapshot = buildMexcAccountStateSnapshot({
    assets,
    positions,
    reads: [
      {
        endpoint: "all-assets",
        permission: "trade-read",
        requestTimeMs: 999_990,
        receivedAtMs: 999_999,
        data: assets,
      },
      {
        endpoint: "open-positions",
        permission: "trade-read",
        requestTimeMs: 999_991,
        receivedAtMs: 1_000_000,
        data: positions,
      },
    ],
  });
  return evaluateMexcAccountSnapshot(snapshot, {
    nowMs: 1_000_100,
    maxAgeMs: 10_000,
  });
}

function reconciliation(state) {
  return reconcileMexcAccountWithDizyPaper({
    exchangeState: state,
    paperAccount: newManualAccount(),
    marks: {},
  });
}

function preview(state) {
  return previewMexcShadowOrder({
    accountState: state,
    contract: {
      symbol: "BTC_USDT",
      displayName: "BTC_USDT SWAP",
      contractSize: 0.001,
      minLeverage: 1,
      maxLeverage: 100,
      priceUnit: 0.1,
      volUnit: 1,
      minVol: 1,
      maxVol: 1000,
      makerFeeRate: 0.0002,
      takerFeeRate: 0.0006,
      maintenanceMarginRate: 0.005,
      initialMarginRate: 0.01,
      positionOpenType: 3,
      riskLimitType: "BY_VOLUME",
    },
    intent: {
      symbol: "BTC_USDT",
      side: "long",
      marginMode: "isolated",
      leverage: 10,
      contractVolume: 10,
      executionPrice: 10_000,
      liquidityRole: "taker",
    },
  });
}

function chain() {
  const state = freshState();
  const first = appendMexcShadowAuditEvent({
    previous: null,
    scopeId: "owner:rob",
    occurredAtMs: 1_000_200,
    source: { sourceType: "account-state", state },
  });
  const second = appendMexcShadowAuditEvent({
    previous: first,
    scopeId: "owner:rob",
    occurredAtMs: 1_000_201,
    source: {
      sourceType: "reconciliation",
      report: reconciliation(state),
    },
  });
  const third = appendMexcShadowAuditEvent({
    previous: second,
    scopeId: "owner:rob",
    occurredAtMs: 1_000_202,
    source: { sourceType: "order-preview", preview: preview(state) },
  });
  return { state, first, second, third, events: [first, second, third] };
}

test("three minimised events append into one deterministic valid hash chain", () => {
  const { first, second, third, events } = chain();
  assert.equal(first.sequence, 1);
  assert.equal(first.previousHash, null);
  assert.equal(second.sequence, 2);
  assert.equal(second.previousHash, first.eventHash);
  assert.equal(third.sequence, 3);
  assert.equal(third.previousHash, second.eventHash);
  assert.equal(first.scopeDigest, second.scopeDigest);
  assert.equal(second.scopeDigest, third.scopeDigest);
  assert.match(first.scopeDigest, /^[a-f0-9]{64}$/);
  assert.match(third.eventHash, /^[a-f0-9]{64}$/);
  assert.match(third.eventId, /^mexc-shadow-3-[a-f0-9]{20}$/);

  const verification = verifyMexcShadowAuditChain(events);
  assert.equal(verification.valid, true);
  assert.equal(verification.eventCount, 3);
  assert.equal(verification.lastHash, third.eventHash);
  assert.equal(verification.scopeDigest, first.scopeDigest);
  assert.deepEqual(verification.errors, []);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.payload), true);
});

test("same scope, time and source produce deterministic event hashes", () => {
  const { state, first } = chain();
  const repeatedFirst = appendMexcShadowAuditEvent({
    previous: null,
    scopeId: " owner:rob ",
    occurredAtMs: 1_000_200,
    source: { sourceType: "account-state", state },
  });
  assert.deepEqual(repeatedFirst, first);

  const repeatedSecondA = appendMexcShadowAuditEvent({
    previous: first,
    scopeId: "owner:rob",
    occurredAtMs: 1_000_201,
    source: {
      sourceType: "reconciliation",
      report: reconciliation(state),
    },
  });
  const repeatedSecondB = appendMexcShadowAuditEvent({
    previous: first,
    scopeId: "owner:rob",
    occurredAtMs: 1_000_201,
    source: {
      sourceType: "reconciliation",
      report: reconciliation(state),
    },
  });
  assert.deepEqual(repeatedSecondA, repeatedSecondB);
});

test("event payloads omit raw scope, balances, identifiers and provider detail", () => {
  const { events } = chain();
  const serialised = JSON.stringify(events);
  assert.equal(serialised.includes("owner:rob"), false);
  assert.equal(serialised.includes("9876.54321"), false);
  assert.doesNotMatch(
    serialised,
    /apiKey|apiSecret|signature|authorization|password|cookie|sessionToken/i,
  );
  assert.doesNotMatch(serialised, /positionId|tradeId|cashBalance|availableBalance/i);
  for (const event of events) {
    assert.equal(assertMexcShadowAuditPayloadIsMinimised(event.payload), true);
    assert.ok(Buffer.byteLength(JSON.stringify(event.payload)) < 4096);
  }
});

test("tampering, reordering and malformed payloads invalidate the chain", () => {
  const { first, second, third } = chain();
  const tampered = {
    ...second,
    payload: {
      ...second.payload,
      aligned: 99,
    },
  };
  const tamperedVerification = verifyMexcShadowAuditChain([
    first,
    tampered,
    third,
  ]);
  assert.equal(tamperedVerification.valid, false);
  assert.ok(
    tamperedVerification.errors.some((error) => /hash does not match/i.test(error)),
  );

  const reordered = verifyMexcShadowAuditChain([second, first, third]);
  assert.equal(reordered.valid, false);
  assert.ok(
    reordered.errors.some((error) => /sequence|previous hash/i.test(error)),
  );

  const malformed = {
    ...first,
    payload: {
      kind: "order-preview-computed",
      exchangeObservedAtMs: 1_000_000,
      symbol: "../../BTC_USDT",
      side: "buy",
      marginMode: "magic",
      status: "approved",
      blockerCount: -1,
      blockerDigest: "bad",
      previewDigest: "bad",
      apiKey: "must-never-appear",
    },
  };
  const malformedVerification = verifyMexcShadowAuditChain([malformed]);
  assert.equal(malformedVerification.valid, false);
  assert.ok(
    malformedVerification.errors.some((error) => /payload|symbol|side/i.test(error)),
  );
});

test("append rejects mixed scopes, backwards time and a tampered previous event", () => {
  const { state, first, second } = chain();
  assert.throws(
    () =>
      appendMexcShadowAuditEvent({
        previous: first,
        scopeId: "owner:nick",
        occurredAtMs: 1_000_201,
        source: { sourceType: "account-state", state },
      }),
    (error) =>
      error instanceof MexcShadowAuditError &&
      error.kind === "invalid-previous-event",
  );
  assert.throws(
    () =>
      appendMexcShadowAuditEvent({
        previous: second,
        scopeId: "owner:rob",
        occurredAtMs: 1_000_000,
        source: { sourceType: "account-state", state },
      }),
    (error) =>
      error instanceof MexcShadowAuditError && error.kind === "invalid-time",
  );
  assert.throws(
    () =>
      appendMexcShadowAuditEvent({
        previous: { ...second, eventHash: "0".repeat(64) },
        scopeId: "owner:rob",
        occurredAtMs: 1_000_203,
        source: { sourceType: "account-state", state },
      }),
    (error) =>
      error instanceof MexcShadowAuditError &&
      error.kind === "invalid-previous-event",
  );
});

test("source projections retain only bounded facts and content digests", () => {
  const state = freshState();
  const accountPayload = mexcShadowAuditPayload({
    sourceType: "account-state",
    state,
  });
  assert.deepEqual(accountPayload, {
    kind: "account-state-evaluated",
    status: "fresh",
    decisionEligible: true,
    observedAtMs: 1_000_000,
    assetCount: 1,
    positionCount: 0,
    failureReason: null,
    providerCode: null,
  });

  const reconciliationPayload = mexcShadowAuditPayload({
    sourceType: "reconciliation",
    report: reconciliation(state),
  });
  assert.equal(reconciliationPayload.kind, "reconciliation-computed");
  assert.equal(reconciliationPayload.settlementCurrency, "USDT");
  assert.match(reconciliationPayload.reportDigest, /^[a-f0-9]{64}$/);
  assert.equal("positions" in reconciliationPayload, false);
  assert.equal("account" in reconciliationPayload, false);

  const previewPayload = mexcShadowAuditPayload({
    sourceType: "order-preview",
    preview: preview(state),
  });
  assert.equal(previewPayload.kind, "order-preview-computed");
  assert.equal(previewPayload.symbol, "BTC_USDT");
  assert.match(previewPayload.previewDigest, /^[a-f0-9]{64}$/);
  assert.equal("estimates" in previewPayload, false);
  assert.equal("accountContext" in previewPayload, false);
});

test("canonical JSON is key-order stable and rejects unsafe values", () => {
  assert.equal(
    canonicalMexcShadowAuditJson({ z: 1, a: { y: 2, b: 3 } }),
    canonicalMexcShadowAuditJson({ a: { b: 3, y: 2 }, z: 1 }),
  );
  assert.throws(
    () => canonicalMexcShadowAuditJson({ missing: undefined }),
    /cannot be undefined/i,
  );
  assert.throws(
    () => canonicalMexcShadowAuditJson({ invalid: Number.POSITIVE_INFINITY }),
    /must be finite/i,
  );
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => canonicalMexcShadowAuditJson(cyclic),
    /cannot be cyclic/i,
  );
});

test("minimisation rejects secret-bearing and oversized payloads", () => {
  assert.throws(
    () =>
      assertMexcShadowAuditPayloadIsMinimised({
        kind: "account-state-evaluated",
        status: "fresh",
        decisionEligible: true,
        observedAtMs: 1,
        assetCount: 0,
        positionCount: 0,
        failureReason: null,
        providerCode: null,
        apiSecret: "forbidden",
      }),
    (error) =>
      error instanceof MexcShadowAuditError && error.kind === "invalid-source",
  );
  assert.throws(
    () =>
      assertMexcShadowAuditPayloadIsMinimised({
        kind: "account-state-evaluated",
        status: "fresh",
        decisionEligible: true,
        observedAtMs: 1,
        assetCount: 0,
        positionCount: 0,
        failureReason: "x".repeat(5000),
        providerCode: null,
      }),
    /size limit/i,
  );
});

test("a valid prefix verifies but cannot prove that no later tail was removed", () => {
  const { first, second, third } = chain();
  const prefix = verifyMexcShadowAuditChain([first, second]);
  assert.equal(prefix.valid, true);
  assert.equal(prefix.lastHash, second.eventHash);
  assert.notEqual(prefix.lastHash, third.eventHash);
  const empty = verifyMexcShadowAuditChain([]);
  assert.equal(empty.valid, true);
  assert.equal(empty.eventCount, 0);
  assert.equal(empty.lastHash, null);
});
