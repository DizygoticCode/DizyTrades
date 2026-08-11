import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifyDizyQuantLiveSnapshot,
  createDizyQuantLiveSnapshot,
  DIZYQUANT_LIVE_STORAGE_KEY,
  readDizyQuantLiveSnapshot,
  writeDizyQuantLiveSnapshot,
} from "../app/lib/dizyquant/live-snapshot.ts";

const input = {
  symbol: "BTC_USDT",
  market: "MEXC Perpetual",
  timeframe: "15m",
  feedState: "Live",
  replay: false,
  flowEnabled: true,
  snapshot: {
    timestamp: "2026-08-05T14:00:00.000Z",
    currentDirection: "BUY",
    marketBias: "Bullish",
    marketPhase: "Accumulation",
    longScore: 4,
    shortScore: 1,
    qualificationThreshold: 3,
    qualified: true,
    confirmedSignal: "BUY",
    explanation: { confidencePercent: 80 },
  },
  liveFlow: {
    inputHash: "fnv1a-test",
    receivedTimeMs: 900,
    availability: "available",
    intelligenceConfidence: 70,
    confidenceBand: "moderate",
    referencePrice: 64_000,
    spread: { percentage: .0123 },
    imbalance: { bands: [{ bandPct: .1, value: .1 }, { bandPct: .25, value: .2 }] },
    depth: { bands: [{ bandPct: .5, bidNotional: 120, askNotional: 80 }] },
    trades: { aggressorImbalance: -.25 },
    walls: { candidates: [{ price: 1 }], withdrawals: [], replenishment: [{ price: 1 }] },
    sweeps: { candidates: [{ direction: "upward-ask" }] },
    absorption: { candidates: [] },
    limitations: [{ code: "public-data", message: "Public data only" }],
  },
};

test("live snapshot derives bounded scalar factors without raw market or execution data", () => {
  const snapshot = createDizyQuantLiveSnapshot(input, 1_000);
  assert.equal(snapshot.schemaVersion, "dizyquant.live.v1");
  assert.equal(snapshot.researchOnly, true);
  assert.equal(snapshot.signalEligible, false);
  assert.equal(snapshot.executionEligible, false);
  assert.equal(snapshot.availableFactorCount, 5);
  assert.equal(snapshot.evidenceCoveragePct, 100);
  assert.equal(snapshot.sourceConfidencePct, 75);
  assert.deepEqual(snapshot.factors.map(value => value.value), [60, 20, -25, 20, .0123]);
  assert.equal(snapshot.flow.wallCount, 1);
  assert.equal(snapshot.flow.replenishmentCount, 1);
  const serialised = JSON.stringify(snapshot);
  assert.doesNotMatch(serialised, /"bids"|"asks"|"candles"|"account"|"credential"|"orderInstruction"|"apiKey"/i);
});

test("live snapshot persistence rejects malformed values and classifies freshness", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const snapshot = createDizyQuantLiveSnapshot(input, 1_000);
  writeDizyQuantLiveSnapshot(snapshot, storage);
  assert.equal(values.has(DIZYQUANT_LIVE_STORAGE_KEY), true);
  assert.deepEqual(readDizyQuantLiveSnapshot(storage), snapshot);
  assert.equal(classifyDizyQuantLiveSnapshot(snapshot, 2_000), "live");
  assert.equal(classifyDizyQuantLiveSnapshot(snapshot, 20_000), "stale");
  assert.equal(classifyDizyQuantLiveSnapshot(createDizyQuantLiveSnapshot({ ...input, feedState: "Recovering" }, 1_000), 2_000), "limited");
  assert.equal(classifyDizyQuantLiveSnapshot(createDizyQuantLiveSnapshot({ ...input, replay: true }, 1_000), 2_000), "replay");
  values.set(DIZYQUANT_LIVE_STORAGE_KEY, "not-json");
  assert.equal(readDizyQuantLiveSnapshot(storage), null);
});

test("terminal publishes the existing safe workspace evidence and research renders it read-only", async () => {
  const [terminal, publisher, page, panel] = await Promise.all([
    readFile("app/trading-terminal.tsx", "utf8"),
    readFile("app/dizyquant-snapshot-publisher.tsx", "utf8"),
    readFile("app/research/page.tsx", "utf8"),
    readFile("app/research/dizyquant-live-panel.tsx", "utf8"),
  ]);
  assert.match(terminal, /DizyQuantSnapshotPublisher/);
  assert.match(publisher, /createDizyQuantLiveSnapshot/);
  assert.match(publisher, /data\.snapshot/);
  assert.match(publisher, /data\.liveFlow/);
  assert.match(page, /DizyQuantLivePanel/);
  assert.match(panel, /Research-only observation/);
  assert.match(panel, /signal-eligible/);
  assert.match(panel, /execution-eligible/);
  assert.match(panel, /Terminal snapshot awaiting refresh/);
  assert.match(panel, /Terminal snapshot published/);
  assert.doesNotMatch(panel, /Stored evidence is stale/);
  assert.doesNotMatch(panel, /placeOrder|submitOrder|apiKey|secret|raw book/i);
});
