import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  MEXC_MICROSCOPIC_CANARY_MAX_NOTIONAL,
  MEXC_MICROSCOPIC_CANARY_TTL_MS,
  MicroscopicCanaryPermitError,
  SqliteMicroscopicCanaryPermitStore,
  microscopicCanaryIdentity,
  microscopicCanaryLifecycleBindingDigestForEvidence,
  microscopicCanaryLifecycleBindingDigestForIntent,
} from "../app/lib/execution/internal/microscopic-canary-permit.ts";
import {
  mexcExecutionIdentityDigest,
  mexcExternalOid,
} from "../app/lib/execution/internal/mexc-execution-writer.ts";
import { SqliteMexcExecutionLifecycleStore } from "../app/lib/execution/internal/mexc-execution-lifecycle-store.ts";

const at = "2026-08-18T14:00:00.000Z";
const later = (ms) => new Date(Date.parse(at) + ms).toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const intent = Object.freeze({
  userId: "owner-1",
  accountId: "account-1",
  intentId: "canary-intent-342",
  idempotencyKey: "canary-342",
  symbol: "BTC_USDT",
  side: "long",
  orderType: "limit",
  positionMode: "one-way",
  positionId: "991",
  marginMode: "isolated",
  positionVolume: 2,
  volume: 1,
  price: 20,
  referencePrice: 20,
  estimatedNotional: 20,
  leverage: 1,
  reduceOnly: true,
  bindingGeneration: "binding-1",
  rolloutRevision: 2,
  riskRevision: 3,
  reconciliationRevision: 4,
  writeCredentialGeneration: "generation-1",
});

const lifecycleEvidence = (source = intent) => Object.freeze({
  intentDigest: sha256(JSON.stringify({
    symbol: source.symbol,
    price: source.price,
    vol: source.volume,
    side: source.side === "long" ? 2 : 4,
    type: 1,
    openType: source.marginMode === "isolated" ? 1 : 2,
    leverage: source.leverage,
    externalOid: mexcExternalOid(source),
    positionId: source.positionId,
    positionMode: 2,
    reduceOnly: true,
  })),
  symbol: source.symbol,
  side: source.side === "long" ? 2 : 4,
  volume: source.volume,
  positionId: source.positionId,
  positionMode: 2,
  openType: source.marginMode === "isolated" ? 1 : 2,
  bindingGeneration: source.bindingGeneration,
  writeCredentialGeneration: source.writeCredentialGeneration,
  rolloutRevision: source.rolloutRevision,
  riskRevision: source.riskRevision,
  reconciliationRevision: source.reconciliationRevision,
});

test("canary binding is identical from the approved intent and persisted lifecycle evidence", () => {
  const digest = mexcExecutionIdentityDigest(intent);
  assert.equal(
    microscopicCanaryLifecycleBindingDigestForIntent(intent),
    microscopicCanaryLifecycleBindingDigestForEvidence(digest, lifecycleEvidence()),
  );
});

test("permit is exact, short-lived, and permanently single-use", () => {
  const store = new SqliteMicroscopicCanaryPermitStore(":memory:");
  try {
    const armed = store.arm(intent, at);
    assert.equal(armed.status, "armed");
    assert.equal(armed.revision, 1);
    assert.equal(armed.identityDigestSha256, mexcExecutionIdentityDigest(intent));
    assert.equal(armed.expiresAt, later(MEXC_MICROSCOPIC_CANARY_TTL_MS));

    const changed = Object.freeze({ ...lifecycleEvidence(), riskRevision: 99 });
    assert.equal(store.consumeLifecycle(mexcExecutionIdentityDigest(intent), changed, later(1_000)), false);
    assert.equal(store.read(microscopicCanaryIdentity(intent)).status, "armed");

    assert.equal(store.consumeLifecycle(mexcExecutionIdentityDigest(intent), lifecycleEvidence(), later(2_000)), true);
    assert.equal(store.read(microscopicCanaryIdentity(intent)).status, "consumed");
    assert.equal(store.consumeLifecycle(mexcExecutionIdentityDigest(intent), lifecycleEvidence(), later(3_000)), false);
    assert.deepEqual(store.events(microscopicCanaryIdentity(intent)).map((event) => event.kind), ["armed", "consumed"]);

    assert.throws(
      () => store.arm(intent, later(4_000)),
      (error) => error instanceof MicroscopicCanaryPermitError && error.code === "MICROSCOPIC_CANARY_CONFLICT",
    );
  } finally {
    store.close();
  }
});

test("oversized or leveraged canaries cannot be armed", () => {
  for (const changed of [
    { estimatedNotional: MEXC_MICROSCOPIC_CANARY_MAX_NOTIONAL + 0.01 },
    { leverage: 2 },
    { reduceOnly: false },
    { orderType: "market" },
  ]) {
    const store = new SqliteMicroscopicCanaryPermitStore(":memory:");
    try {
      assert.throws(
        () => store.arm(Object.freeze({ ...intent, ...changed }), at),
        (error) => error instanceof MicroscopicCanaryPermitError && error.code === "MICROSCOPIC_CANARY_INVALID",
      );
    } finally {
      store.close();
    }
  }
});

test("expired and revoked permits never consume", () => {
  const expired = new SqliteMicroscopicCanaryPermitStore(":memory:");
  try {
    expired.arm(intent, at);
    assert.equal(
      expired.consumeLifecycle(mexcExecutionIdentityDigest(intent), lifecycleEvidence(), later(MEXC_MICROSCOPIC_CANARY_TTL_MS + 1)),
      false,
    );
    assert.equal(expired.read(microscopicCanaryIdentity(intent)).status, "armed");
  } finally {
    expired.close();
  }

  const revoked = new SqliteMicroscopicCanaryPermitStore(":memory:");
  try {
    const armed = revoked.arm(intent, at);
    const state = revoked.revoke(microscopicCanaryIdentity(intent), later(1_000), armed.revision);
    assert.equal(state.status, "revoked");
    assert.equal(revoked.consumeLifecycle(mexcExecutionIdentityDigest(intent), lifecycleEvidence(), later(2_000)), false);
    assert.deepEqual(revoked.events(microscopicCanaryIdentity(intent)).map((event) => event.kind), ["armed", "revoked"]);
  } finally {
    revoked.close();
  }
});

test("production-style lifecycle claim is impossible without the exact one-shot permit", () => {
  const permit = new SqliteMicroscopicCanaryPermitStore(":memory:");
  const lifecycle = new SqliteMexcExecutionLifecycleStore(":memory:", permit);
  const digest = mexcExecutionIdentityDigest(intent);
  try {
    const reserved = lifecycle.reserve(digest, mexcExternalOid(intent), lifecycleEvidence(), at);
    assert.equal(reserved.state, "reserved");
    assert.equal(reserved.attempt, 0);

    assert.equal(lifecycle.claim(digest, later(500)), null);
    assert.equal(lifecycle.read(digest)?.state, "reserved");
    assert.equal(lifecycle.read(digest)?.attempt, 0);

    permit.arm(intent, later(1_000));
    const claimed = lifecycle.claim(digest, later(1_500));
    assert.equal(claimed?.state, "submitting");
    assert.equal(claimed?.attempt, 1);
    assert.equal(permit.read(microscopicCanaryIdentity(intent)).status, "consumed");

    const released = lifecycle.releaseClaim(digest, later(2_000));
    assert.equal(released.state, "reserved");
    assert.equal(released.attempt, 0);
    assert.equal(lifecycle.claim(digest, later(2_500)), null, "consumed permit cannot authorize a retry");
    assert.equal(lifecycle.read(digest)?.state, "reserved");
  } finally {
    lifecycle.close();
    permit.close();
  }
});