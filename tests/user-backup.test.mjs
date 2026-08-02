import assert from "node:assert/strict";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_TERMINAL_SETTINGS } from "../app/lib/config.ts";
import { createJournalEntry, readJournal } from "../app/lib/journal-store.ts";
import { newManualAccount } from "../app/lib/manual-paper.ts";
import { validateManualPaperBackup } from "../app/lib/manual-paper-backup.ts";
import { readUserRecord, savePaperRun, saveSettings } from "../app/lib/store.ts";
import {
  validateDizyTradesBackup,
} from "../app/lib/user-backup-model.ts";
import {
  applyUserBackupRestore,
  buildUserBackup,
  journalTradesCsv,
  planUserBackupRestore,
} from "../app/lib/user-backup-store.ts";

async function withDataRoot(operation) {
  const previous = process.env.DATA_DIR;
  const root = await mkdtemp(join(tmpdir(), "dizy-backup-"));
  process.env.DATA_DIR = root;
  try {
    return await operation(root);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
}

async function seed(userId) {
  const settings = structuredClone(DEFAULT_TERMINAL_SETTINGS);
  settings.market.symbol = "ETH_USDT";
  settings.market.marketKey = "mexc:futures:ETH_USDT";
  settings.market.timeframe = "4h";
  settings.market.favourites = ["mexc:futures:ETH_USDT"];
  await saveSettings(userId, settings);
  await savePaperRun(userId, {
    symbol: "ETH_USDT",
    timeframe: "4h",
    summary: {
      initialEquity: 1_000,
      endingEquity: 1_125,
      returnPct: 12.5,
      maxDrawdownPct: 3.2,
      trades: 8,
      wins: 5,
      winRatePct: 62.5,
      profitFactor: 1.8,
      closedTrades: [],
    },
  });
  await createJournalEntry(userId, {
    type: "general",
    title: "Recovery checkpoint",
    notes: "Validated backup round trip.",
    tags: ["backup"],
  });
}

test("full backup round-trips profile and Journal additively", async () => {
  await withDataRoot(async (root) => {
    const userId = "backup_user";
    await seed(userId);
    const backup = await buildUserBackup(userId);

    assert.equal(backup.version, 1);
    assert.equal(backup.ownerId, userId);
    assert.equal(backup.data.profile.settings.market.symbol, "ETH_USDT");
    assert.equal(backup.data.profile.paperRuns.length, 1);
    assert.equal(backup.data.journal.length, 1);
    assert.equal(backup.data.manualPaper.version, 3);
    assert.match(backup.integrity.contentHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(validateDizyTradesBackup(backup, userId), backup);

    await unlink(join(root, "users", `${userId}.json`));
    await unlink(join(root, "journal", `${userId}.json`));

    const plan = await planUserBackupRestore(userId, backup);
    assert.equal(plan.safeToApply, true);
    assert.equal(plan.profile.settingsWillReplace, true);
    assert.equal(plan.profile.paperRunsToAdd, 1);
    assert.equal(plan.journal.entriesToAdd, 1);

    const result = await applyUserBackupRestore(
      userId,
      backup,
      plan.backupHash,
    );
    assert.equal(result.applied, true);
    assert.equal(result.created.journalEntries, 1);
    assert.equal(result.profileUpdated, true);

    const profile = await readUserRecord(userId);
    assert.equal(profile.settings.market.symbol, "ETH_USDT");
    assert.equal(profile.paperRuns.length, 1);
    assert.equal((await readJournal(userId)).entries.length, 1);

    const repeated = await planUserBackupRestore(userId, backup);
    assert.equal(repeated.safeToApply, true);
    assert.equal(repeated.journal.entriesToAdd, 0);
    assert.equal(repeated.journal.existingEntries, 1);
    assert.equal(repeated.profile.paperRunsToAdd, 0);
  });
});

test("integrity tampering and cross-account restore are rejected", async () => {
  await withDataRoot(async () => {
    const userId = "backup_owner";
    await seed(userId);
    const backup = await buildUserBackup(userId);
    const tampered = structuredClone(backup);
    tampered.data.profile.settings.market.symbol = "BTC_USDT";
    assert.throws(
      () => validateDizyTradesBackup(tampered, userId),
      /integrity check failed/i,
    );
    assert.throws(
      () => validateDizyTradesBackup(backup, "different_user"),
      /owner does not match/i,
    );
  });
});

test("Manual Paper backups require matching fill ownership and never restore open positions", async () => {
  await withDataRoot(async () => {
    const userId = "paper_backup_user";
    const account = newManualAccount();
    const validated = validateManualPaperBackup(account, userId);
    assert.equal(validated.version, 3);

    const foreign = structuredClone(account);
    foreign.fills.push({
      orderId: "order-1",
      fillId: "fill-1",
      idempotencyKey: "abcdefghijklmnop",
      userId: "another_user",
      symbol: "BTC_USDT",
      side: "long",
      price: 10,
      quantity: 1,
      notional: 10,
      fee: 0.01,
      timestamp: "2026-08-02T10:00:00.000Z",
      realisedPnl: 0,
      resultingBalance: 9_999.99,
    });
    assert.throws(
      () => validateManualPaperBackup(foreign, userId),
      /owner mismatch/i,
    );
  });
});

test("Journal CSV neutralises spreadsheet formulas and uses a UTF-8 BOM", () => {
  const csv = journalTradesCsv([
    {
      id: "entry-1",
      type: "trade-review",
      title: "",
      archived: false,
      archivedAt: null,
      createdAt: "2026-08-02T10:00:00.000Z",
      editedAt: "2026-08-02T10:00:00.000Z",
      tags: ["=DANGEROUS()"],
      quality: null,
      planDiscipline: null,
      mood: null,
      dismissedPrompts: [],
      notes: "",
      marketContext: null,
      trade: {
        tradeId: "=1+1",
        symbol: "BTC_USDT",
        timeframe: "15m",
        direction: "long",
        openTime: "2026-08-02T10:00:00.000Z",
        closeTime: "2026-08-02T10:15:00.000Z",
        entry: 100,
        exit: 101,
        pnl: 1,
        pnlPct: 1,
        rMultiple: 1,
        fees: 0.1,
        closeReason: "manual",
      },
    },
  ]);
  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"'=DANGEROUS\(\)"/);
});
