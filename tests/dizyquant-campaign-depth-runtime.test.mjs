import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DIZYQUANT_CAMPAIGN_DEPTH_PUBLICATION_MS,
  DizyQuantCampaignDepthRuntime,
  depthBookCoversDizyQuantCampaignBand,
  inferDizyQuantCampaignPriceStep,
} from "../app/lib/dizyquant/campaign-depth-runtime.ts";
import {
  clearDizyQuantCampaignDepthPublication,
  publishDizyQuantCampaignDepthPublication,
  readDizyQuantCampaignDepthPublication,
} from "../app/lib/dizyquant/campaign-runtime-feed.ts";

const BASE = 30_000_000;
const levels = () => ({
  bids: [
    { price: 99.9, orderCount: 1, contractQuantity: 10 },
    { price: 99.8, orderCount: 1, contractQuantity: 8 },
    { price: 99.7, orderCount: 1, contractQuantity: 6 },
  ],
  asks: [
    { price: 100.1, orderCount: 1, contractQuantity: 9 },
    { price: 100.2, orderCount: 1, contractQuantity: 7 },
    { price: 100.3, orderCount: 1, contractQuantity: 5 },
  ],
});

function envelope(index, overrides = {}) {
  const timestamp = BASE + index * 1_000 + 500;
  const depth = levels();
  return {
    snapshot: {
      symbol: "BTC_USDT",
      version: index + 1,
      engineTimeMs: timestamp,
      bids: depth.bids,
      asks: depth.asks,
      ...(overrides.snapshot ?? {}),
    },
    receivedAt: timestamp + 50,
    diagnostic: {
      snapshotAgeMs: 50,
      consecutiveFailures: 0,
      lastError: null,
      sourceMode: "FULL DEPTH WS",
      versionGaps: 0,
      sequenceKnown: true,
      sequenceContinuous: true,
      snapshotComplete: true,
      recovering: false,
      sourceTimestampKnown: true,
      ...(overrides.diagnostic ?? {}),
    },
  };
}

test("campaign band coverage is proven from actual deepest visible prices", () => {
  const depth = levels();
  const complete = { valid: true, version: 1, bids: depth.bids, asks: depth.asks };
  assert.equal(depthBookCoversDizyQuantCampaignBand(complete), true);
  const shallow = {
    ...complete,
    bids: depth.bids.slice(0, 2),
    asks: depth.asks.slice(0, 2),
  };
  assert.equal(depthBookCoversDizyQuantCampaignBand(shallow), false);
});

test("price step prefers reviewed market metadata and otherwise infers the smallest observed increment", () => {
  const snapshot = envelope(0).snapshot;
  assert.equal(inferDizyQuantCampaignPriceStep(snapshot, "0.01"), 0.01);
  assert.equal(inferDizyQuantCampaignPriceStep(snapshot, null), 0.1);
});

test("runtime retains one as-of frame per second and publishes fresh depth evidence every five seconds", () => {
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  const publications = [];
  for (let index = 0; index <= 40; index += 1) {
    const publication = runtime.push(envelope(index));
    if (publication) publications.push(publication);
  }
  assert.ok(publications.length >= 6);
  assert.ok(
    publications.every(
      (value) => value.boundaryTimeMs % DIZYQUANT_CAMPAIGN_DEPTH_PUBLICATION_MS === 0,
    ),
  );
  const latest = publications.at(-1);
  assert.equal(latest.coverageComplete, true);
  assert.equal(latest.researchOnly, true);
  assert.equal(latest.signalEligible, false);
  assert.equal(latest.executionEligible, false);
  assert.equal(latest.shockSelectionRequired, true);
  assert.equal(latest.evidence.snapshots.liquidityMigration.availability, "fresh");
  assert.equal(latest.evidence.snapshots.liquidityMigration.sequenceContinuous, true);
  assert.equal(latest.evidence.snapshots.resilience, null);
  assert.equal(latest.evidence.tradeSequenceContinuous, null);
});

test("an incomplete 25-bps frame resets continuity instead of becoming a qualified campaign window", () => {
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  for (let index = 0; index <= 35; index += 1) runtime.push(envelope(index));
  const shallow = levels();
  runtime.push(
    envelope(36, {
      snapshot: { bids: shallow.bids.slice(0, 2), asks: shallow.asks.slice(0, 2) },
    }),
  );
  let after = null;
  for (let index = 37; index <= 40; index += 1) {
    after = runtime.push(envelope(index)) ?? after;
  }
  assert.ok(after);
  assert.notEqual(after.evidence.snapshots.liquidityMigration.availability, "fresh");
  assert.equal(after.hasGaps, true);
});

test("recovery state clears the bounded research window", () => {
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  for (let index = 0; index <= 20; index += 1) runtime.push(envelope(index));
  assert.equal(
    runtime.push(
      envelope(21, {
        diagnostic: {
          recovering: true,
          sourceMode: "RECONNECTING — LAST BOOK RETAINED",
          sequenceContinuous: null,
        },
      }),
    ),
    null,
  );
  let publication = null;
  for (let index = 22; index <= 30; index += 1) publication = runtime.push(envelope(index)) ?? publication;
  assert.ok(publication);
  assert.notEqual(publication.evidence.snapshots.liquidityMigration.availability, "fresh");
});

test("client campaign feed is in-memory, validated and monotonic", () => {
  clearDizyQuantCampaignDepthPublication();
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  let publication = null;
  for (let index = 0; index <= 10; index += 1) publication = runtime.push(envelope(index)) ?? publication;
  assert.ok(publication);
  assert.equal(publishDizyQuantCampaignDepthPublication(publication), publication);
  assert.equal(readDizyQuantCampaignDepthPublication("BTC_USDT"), publication);
  const older = { ...publication, boundaryTimeMs: publication.boundaryTimeMs - 5_000 };
  assert.equal(publishDizyQuantCampaignDepthPublication(older), publication);
  assert.equal(publishDizyQuantCampaignDepthPublication({ nope: true }), null);
  clearDizyQuantCampaignDepthPublication();
});

test("runtime source contract uses the shared collector and keeps heavy research code off the client feed", async () => {
  const route = await readFile("app/api/dizyquant/evidence/stream/route.ts", "utf8");
  const publisher = await readFile("app/dizyquant-snapshot-publisher.tsx", "utf8");
  const feed = await readFile("app/lib/dizyquant/campaign-runtime-feed.ts", "utf8");
  const contract = await readFile("app/lib/dizyquant/campaign-runtime-contract.ts", "utf8");
  assert.match(route, /acquireDepthCollector/);
  assert.match(route, /DizyQuantCampaignDepthRuntime/);
  assert.match(route, /DIZYQUANT_INITIAL_EVIDENCE_SYMBOLS/);
  assert.match(publisher, /\/api\/dizyquant\/evidence\/stream/);
  assert.match(feed, /campaign-runtime-contract/);
  assert.doesNotMatch(feed, /campaign-depth-runtime/);
  assert.match(contract, /import type \{ DizyQuantLiveEvidenceBuildResult \}/);
  assert.doesNotMatch(feed, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(publisher, /localStorage.*campaign|campaign.*localStorage/i);
});
