import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DIZYQUANT_CAMPAIGN_DEPTH_PUBLICATION_MS,
  DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION,
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

function collect(runtime, from, to, transform = (index) => envelope(index)) {
  const publications = [];
  for (let index = from; index <= to; index += 1) {
    const publication = runtime.push(transform(index));
    if (publication) publications.push(publication);
  }
  return publications;
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

test("runtime waits for a complete reviewed regime window before publishing labelled range evidence", () => {
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  assert.equal(collect(runtime, 0, 60).length, 0);
  const publications = collect(runtime, 61, 75);
  assert.ok(publications.length >= 2);
  assert.ok(
    publications.every(
      (value) => value.boundaryTimeMs % DIZYQUANT_CAMPAIGN_DEPTH_PUBLICATION_MS === 0,
    ),
  );
  const latest = publications.at(-1);
  assert.equal(latest.runtimeVersion, DIZYQUANT_CAMPAIGN_DEPTH_RUNTIME_VERSION);
  assert.equal(latest.coverageComplete, true);
  assert.equal(latest.sequenceContinuous, true);
  assert.equal(latest.hasGaps, false);
  assert.equal(latest.regime, "range");
  assert.equal(latest.regimeDirection, "flat");
  assert.equal(latest.regimeWindowToMs, latest.boundaryTimeMs);
  assert.equal(latest.regimeWindowFromMs, latest.boundaryTimeMs - 60_000);
  assert.equal(latest.baselineMidpoint, 100);
  assert.ok(latest.boundaryTimeMs - latest.sourceTimeMs >= 0);
  assert.ok(latest.boundaryTimeMs - latest.sourceTimeMs <= 1_000);
  assert.ok(latest.evidence.snapshots.ladder);
  assert.equal(latest.evidence.snapshots.ladder.availability, "fresh");
  assert.equal(latest.evidence.snapshots.ladder.sourceTimeMs, latest.sourceTimeMs);
  assert.equal(latest.shockSelectionRequired, false);
  assert.equal(latest.selectedShockTimestampMs, null);
  assert.equal(latest.researchOnly, true);
  assert.equal(latest.signalEligible, false);
  assert.equal(latest.executionEligible, false);
  assert.equal(latest.evidence.snapshots.liquidityMigration.availability, "fresh");
  assert.equal(latest.evidence.snapshots.liquidityMigration.sequenceContinuous, true);
  assert.equal(latest.evidence.snapshots.resilience, null);
  assert.equal(latest.evidence.tradeSequenceContinuous, null);
});

test("runtime passes the deterministic selected shock into the real resilience snapshot", () => {
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  const publications = collect(runtime, 0, 75, (index) => {
    if (index !== 40) return envelope(index);
    const depth = levels();
    return envelope(index, {
      snapshot: {
        bids: depth.bids.map((level) => ({ ...level, contractQuantity: level.contractQuantity * 0.4 })),
        asks: depth.asks,
      },
    });
  });
  const shock = publications.find((value) => value.regime === "volatility-shock");
  assert.ok(shock);
  assert.equal(shock.selectedShockTimestampMs, BASE + 41_000);
  assert.equal(shock.evidence.shockTimestampMs, shock.selectedShockTimestampMs);
  assert.ok(shock.evidence.snapshots.resilience);
  assert.equal(shock.evidence.snapshots.resilience.availability, "fresh");
  assert.equal(shock.evidence.snapshots.resilience.sequenceContinuous, true);
});

test("an incomplete 25-bps frame resets regime continuity and requires a fresh sixty-second window", () => {
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  collect(runtime, 0, 65);
  const shallow = levels();
  assert.equal(
    runtime.push(
      envelope(66, {
        snapshot: { bids: shallow.bids.slice(0, 2), asks: shallow.asks.slice(0, 2) },
      }),
    ),
    null,
  );
  assert.equal(collect(runtime, 67, 125).length, 0);
  const recovered = collect(runtime, 126, 135);
  assert.ok(recovered.length >= 1);
  assert.equal(recovered.at(-1).regime, "range");
  assert.equal(recovered.at(-1).hasGaps, false);
});

test("a missing source second fails the one-second as-of rule even without an explicit gap flag", () => {
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  collect(runtime, 0, 65);
  assert.equal(runtime.push(envelope(67)), null);
  assert.equal(collect(runtime, 68, 127).length, 0);
  const recovered = collect(runtime, 128, 135);
  assert.ok(recovered.length >= 1);
  assert.equal(recovered.at(-1).regime, "range");
});

test("recovery state clears the bounded regime and evidence windows", () => {
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  collect(runtime, 0, 65);
  assert.equal(
    runtime.push(
      envelope(66, {
        diagnostic: {
          recovering: true,
          sourceMode: "RECONNECTING — LAST BOOK RETAINED",
          sequenceContinuous: null,
        },
      }),
    ),
    null,
  );
  assert.equal(collect(runtime, 67, 126).length, 0);
  const recovered = collect(runtime, 127, 135);
  assert.ok(recovered.length >= 1);
  assert.equal(recovered.at(-1).sequenceContinuous, true);
});

test("client campaign feed validates labelled evidence and remains monotonic", () => {
  clearDizyQuantCampaignDepthPublication();
  const runtime = new DizyQuantCampaignDepthRuntime({
    symbol: "BTC_USDT",
    contractSize: 1,
    priceStep: 0.1,
  });
  const publications = collect(runtime, 0, 75);
  assert.ok(publications.length >= 2);
  const older = publications.at(-2);
  const publication = publications.at(-1);
  assert.equal(publishDizyQuantCampaignDepthPublication(publication), publication);
  assert.equal(readDizyQuantCampaignDepthPublication("BTC_USDT"), publication);
  assert.equal(publishDizyQuantCampaignDepthPublication(older), publication);
  assert.equal(
    publishDizyQuantCampaignDepthPublication({
      ...publication,
      regime: "volatility-shock",
      selectedShockTimestampMs: null,
    }),
    null,
  );
  const { selectedShockTimestampMs: omitted, ...missingShockField } = publication;
  assert.equal(omitted, null);
  assert.equal(publishDizyQuantCampaignDepthPublication(missingShockField), null);
  assert.equal(publishDizyQuantCampaignDepthPublication({ nope: true }), null);
  clearDizyQuantCampaignDepthPublication();
});

test("campaign collection is process-owned while browser SSE remains a read-only subscriber", async () => {
  const route = await readFile("app/api/dizyquant/evidence/stream/route.ts", "utf8");
  const publisher = await readFile("app/dizyquant-snapshot-publisher.tsx", "utf8");
  const feed = await readFile("app/lib/dizyquant/campaign-runtime-feed.ts", "utf8");
  const contract = await readFile("app/lib/dizyquant/campaign-runtime-contract.ts", "utf8");
  const runtime = await readFile("app/lib/dizyquant/campaign-depth-runtime.ts", "utf8");
  const service = await readFile("app/lib/dizyquant/campaign-recorder-service.ts", "utf8");
  const runner = await readFile("app/lib/dizyquant/campaign-recorder-runner.ts", "utf8");
  const instrumentation = await readFile("instrumentation.ts", "utf8");

  assert.match(route, /subscribeDizyQuantCampaignDepthPublications/);
  assert.match(route, /readDizyQuantCampaignDepthPublication/);
  assert.doesNotMatch(
    route,
    /acquireDepthCollector|releaseDepthCollector|DizyQuantCampaignDepthRuntime|getMexcMarkets/,
  );
  assert.match(publisher, /\/api\/dizyquant\/evidence\/stream/);
  assert.match(feed, /campaign-runtime-contract/);
  assert.match(feed, /__dizyQuantCampaignRuntimeFeed/);
  assert.doesNotMatch(feed, /campaign-depth-runtime/);
  assert.match(contract, /import type \{ DizyQuantLiveEvidenceBuildResult \}/);
  assert.match(runtime, /classifyDizyQuantCampaignRegime/);
  assert.match(runtime, /MAX_REGIME_ASOF_AGE_MS/);
  assert.match(runtime, /shockTimestampMs: selectedShockTimestampMs/);

  assert.match(service, /acquireDepthCollector/);
  assert.match(service, /releaseDepthCollector\(residency\.symbol\)/);
  assert.match(service, /holds no registry reference between pulses/);
  assert.match(service, /writeDizyQuantCampaignRecorderState/);
  assert.match(runner, /DIZYQUANT_CAMPAIGN_SYMBOL_RESIDENCY_MS/);
  assert.match(runner, /depth-imbalance-25bps/);
  assert.match(runner, /regimeFormulaVersion/);

  assert.match(instrumentation, /startArchiveCollectors/);
  assert.match(instrumentation, /startDizyQuantCampaignRecorderService/);
  assert.ok(
    instrumentation.indexOf("startArchiveCollectors();") <
      instrumentation.indexOf("startDizyQuantCampaignRecorderService();"),
  );
  assert.doesNotMatch(feed, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(publisher, /localStorage.*campaign|campaign.*localStorage/i);
});
