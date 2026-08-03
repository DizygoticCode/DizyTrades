import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_TERMINAL_SETTINGS } from "../app/lib/config.ts";
import { captureHistoricalReplayMemory } from "../app/lib/historical-replay-memory.ts";
import { createJournalEntry } from "../app/lib/journal-store.ts";
import { readUserRecord, savePaperRun, saveSettings } from "../app/lib/store.ts";
import { finaliseDizyTradesBackup } from "../app/lib/user-backup-model.ts";
import {
  applyUserBackupRestore,
  buildUserBackup,
  planUserBackupRestore,
  restoreCollectionCapacityConflicts,
} from "../app/lib/user-backup-store.ts";

async function withDataRoot(operation) {
  const previous = process.env.DATA_DIR;
  const root = await mkdtemp(join(tmpdir(), "dizy-backup-conflict-"));
  process.env.DATA_DIR = root;
  try {
    return await operation(root);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
}

async function seedProfile(userId) {
  const settings = structuredClone(DEFAULT_TERMINAL_SETTINGS);
  settings.market.symbol = "ETH_USDT";
  settings.market.marketKey = "mexc:futures:ETH_USDT";
  settings.market.timeframe = "4h";
  await saveSettings(userId, settings);
  return savePaperRun(userId, {
    symbol: "ETH_USDT",
    timeframe: "4h",
    summary: {
      initialEquity: 1_000,
      endingEquity: 1_100,
      returnPct: 10,
      maxDrawdownPct: 2,
      trades: 4,
      wins: 3,
      winRatePct: 75,
      profitFactor: 2,
      closedTrades: [],
    },
  });
}

async function writeProfile(root, userId, profile) {
  await mkdir(join(root, "users"), { recursive: true });
  await writeFile(
    join(root, "users", `${userId}.json`),
    `${JSON.stringify(profile, null, 2)}\n`,
    { mode: 0o600 },
  );
}

async function writeJournal(root, userId, entries) {
  await mkdir(join(root, "journal"), { recursive: true });
  await writeFile(
    join(root, "journal", `${userId}.json`),
    `${JSON.stringify({ version: 5, entries }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function backupWithReplayMemory(backup) {
  const memory = captureHistoricalReplayMemory({
    tradeId: "restore-conflict-trade",
    replaySessionId: "journal-replay|restore-conflict-trade",
    marketKey: "mexc:futures:BTC_USDT",
    symbol: "BTC_USDT",
    timeframe: "1m",
    signalTimeMs: 60_000,
    entryTimeMs: 120_000,
    exitTimeMs: 180_000,
    entryPrice: 100,
    exitPrice: 100,
    direction: "long",
    strategyVersion: "restore-conflict-audit/1",
    candles: [60, 120, 180].map((time) => ({
      time,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1,
    })),
    capturedAtMs: 240_000,
  });
  const { integrity: _integrity, ...content } = backup;
  void _integrity;
  return {
    backup: finaliseDizyTradesBackup({
      ...content,
      data: Object.freeze({
        ...content.data,
        replayMemories: Object.freeze([memory]),
      }),
    }),
    memory,
  };
}

test("matching Paper runs remain idempotent", async () => {
  await withDataRoot(async () => {
    const userId = "matching_paper_runs";
    await seedProfile(userId);
    const backup = await buildUserBackup(userId);
    const plan = await planUserBackupRestore(userId, backup);
    assert.equal(plan.safeToApply, true);
    assert.equal(plan.profile.paperRunsToAdd, 0);
    assert.equal(plan.profile.matchingPaperRuns, 1);
  });
});

test("dry-run rejects a Paper-run ID collision with different content", async () => {
  await withDataRoot(async (root) => {
    const userId = "paper_run_collision";
    await seedProfile(userId);
    const backup = await buildUserBackup(userId);
    const conflicting = structuredClone(await readUserRecord(userId));
    conflicting.paperRuns[0].symbol = "BTC_USDT";
    await writeProfile(root, userId, conflicting);

    const before = await readFile(join(root, "users", `${userId}.json`), "utf8");
    const plan = await planUserBackupRestore(userId, backup);
    assert.equal(plan.safeToApply, false);
    assert.match(plan.conflicts.join("\n"), /Paper run .* different content/);
    await assert.rejects(
      () => applyUserBackupRestore(userId, backup, plan.backupHash),
      /unresolved conflicts/i,
    );
    const after = await readFile(join(root, "users", `${userId}.json`), "utf8");
    assert.equal(after, before);
  });
});

test("dry-run rejects additive Paper history that would truncate retained runs", async () => {
  await withDataRoot(async (root) => {
    const userId = "paper_run_capacity";
    const sourceRun = await seedProfile(userId);
    const backup = await buildUserBackup(userId);
    const current = await readUserRecord(userId);
    current.paperRuns = Array.from({ length: 50 }, (_, index) => ({
      ...structuredClone(sourceRun),
      id: `current-run-${index}`,
      createdAt: new Date(index * 1_000).toISOString(),
    }));
    await writeProfile(root, userId, current);

    const plan = await planUserBackupRestore(userId, backup);
    assert.equal(plan.safeToApply, false);
    assert.equal(plan.profile.paperRunsToAdd, 1);
    assert.match(plan.conflicts.join("\n"), /exceed the 50-run limit/);
  });
});

test("Journal capacity conflict is found before retained evidence is created", async () => {
  await withDataRoot(async (root) => {
    const userId = "journal_capacity";
    await seedProfile(userId);
    await createJournalEntry(userId, {
      type: "general",
      title: "Source recovery entry",
      notes: "Must not be restored after a capacity conflict.",
    });
    const sourceBackup = await buildUserBackup(userId);
    const { backup, memory } = backupWithReplayMemory(sourceBackup);
    const template = backup.data.journal[0];
    const existingEntries = Array.from({ length: 2_000 }, (_, index) => ({
      ...structuredClone(template),
      id: `capacity-entry-${index}`,
      title: `Capacity entry ${index}`,
    }));
    await writeJournal(root, userId, existingEntries);

    const plan = await planUserBackupRestore(userId, backup);
    assert.equal(plan.safeToApply, false);
    assert.equal(plan.journal.entriesToAdd, 1);
    assert.equal(plan.evidence.replayToCreate, 1);
    assert.match(plan.conflicts.join("\n"), /exceed the 2,000-entry limit/);
    await assert.rejects(
      () => applyUserBackupRestore(userId, backup, plan.backupHash),
      /unresolved conflicts/i,
    );
    await assert.rejects(
      () => access(join(root, "replay-memory", userId, `${memory.id}.json`)),
      /ENOENT/,
    );
  });
});

test("evidence count and byte limits produce deterministic conflicts", () => {
  assert.deepEqual(
    restoreCollectionCapacityConflicts({
      label: "Replay memory",
      existingCount: 2,
      incomingCount: 1,
      maximumCount: 2,
      existingBytes: 90,
      incomingBytes: 20,
      maximumBytes: 100,
    }),
    [
      "Replay memory restore would exceed the 2-item limit.",
      "Replay memory restore would exceed its storage-byte limit.",
    ],
  );
  assert.deepEqual(
    restoreCollectionCapacityConflicts({
      label: "Replay memory",
      existingCount: 1,
      incomingCount: 1,
      maximumCount: 2,
      existingBytes: 80,
      incomingBytes: 20,
      maximumBytes: 100,
    }),
    [],
  );
});
