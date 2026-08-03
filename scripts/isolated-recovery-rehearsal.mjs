import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_TERMINAL_SETTINGS } from "../app/lib/config.ts";
import { createJournalEntry } from "../app/lib/journal-store.ts";
import {
  validateManualPaperBackup,
  writeManualPaperBackup,
} from "../app/lib/manual-paper-backup.ts";
import { newManualAccount } from "../app/lib/manual-paper.ts";
import { savePaperRun, saveSettings } from "../app/lib/store.ts";
import {
  canonicalBackupJson,
} from "../app/lib/user-backup-model.ts";
import {
  applyUserBackupRestoreWithWorkspaces,
  buildUserBackupWithWorkspaces,
  planUserBackupRestoreWithWorkspaces,
} from "../app/lib/user-backup-workspace.ts";
import {
  readWorkspaceLayouts,
  saveWorkspaceLayout,
} from "../app/lib/workspace-layout-store.ts";

const REHEARSAL_OWNER = "recovery_rehearsal_owner";
const CONTROL_OWNER = "recovery_rehearsal_control";

function sha256(value) {
  return createHash("sha256").update(canonicalBackupJson(value)).digest("hex");
}

export function stableRecoveryManifest(backup) {
  return Object.freeze({
    ownerId: backup.ownerId,
    profile: Object.freeze({
      settings: backup.data.profile.settings,
      paperRuns: backup.data.profile.paperRuns,
    }),
    manualPaper: backup.data.manualPaper,
    journal: backup.data.journal,
    replayMemories: backup.data.replayMemories.map((memory) => ({
      id: memory.id,
      hash: memory.integrity.contentHash,
    })),
    historicalDizyFlow: backup.data.historicalDizyFlow.map((memory) => ({
      id: memory.id,
      hash: memory.contentHash,
    })),
    dizyBrainReviews: backup.data.dizyBrainReviews.map((review) => ({
      id: review.id,
      generatedFromHash: review.generatedFromHash,
      reviewContentHash: review.reviewContentHash,
    })),
    workspaceLayouts: backup.data.workspaceLayouts,
  });
}

export function recoveryCounts(backup) {
  return Object.freeze({
    paperRuns: backup.data.profile.paperRuns.length,
    manualPaperFills: backup.data.manualPaper.fills.length,
    manualPaperFundingPayments:
      backup.data.manualPaper.fundingPayments.length,
    journalEntries: backup.data.journal.length,
    replayMemories: backup.data.replayMemories.length,
    historicalDizyFlow: backup.data.historicalDizyFlow.length,
    dizyBrainReviews: backup.data.dizyBrainReviews.length,
    workspaceLayouts: backup.data.workspaceLayouts.length,
  });
}

async function seedOwner(userId) {
  const settings = structuredClone(DEFAULT_TERMINAL_SETTINGS);
  settings.market.symbol = "ETH_USDT";
  settings.market.marketKey = "mexc:futures:ETH_USDT";
  settings.market.timeframe = "4h";
  settings.market.favourites = [
    "mexc:futures:ETH_USDT",
    "mexc:futures:BTC_USDT",
  ];
  settings.view.volumeProfile = true;
  settings.orderFlow.enabled = true;
  settings.orderFlow.domVisible = true;
  await saveSettings(userId, settings);

  await savePaperRun(userId, {
    symbol: "ETH_USDT",
    timeframe: "4h",
    summary: {
      initialEquity: 10_000,
      endingEquity: 10_625,
      returnPct: 6.25,
      maxDrawdownPct: 2.4,
      trades: 6,
      wins: 4,
      winRatePct: 66.6666666667,
      profitFactor: 1.9,
      closedTrades: [],
    },
  });

  await createJournalEntry(userId, {
    type: "general",
    title: "Isolated recovery checkpoint",
    notes: "Representative retained owner state for the recovery rehearsal.",
    tags: ["recovery", "rehearsal"],
  });

  await saveWorkspaceLayout(userId, "ETH 4h recovery layout", settings);

  const legacyManual = structuredClone(newManualAccount());
  legacyManual.version = 3;
  delete legacyManual.migration;
  legacyManual.cashBalance = 12_345;
  legacyManual.startingBalance = 10_000;
  legacyManual.realisedPnl = 2_345;
  legacyManual.updatedAt = "2026-08-03T18:00:00.000Z";
  const migratedManual = validateManualPaperBackup(legacyManual, userId);
  await writeManualPaperBackup(userId, migratedManual);
}

async function seedControlOwner(userId) {
  const settings = structuredClone(DEFAULT_TERMINAL_SETTINGS);
  settings.market.symbol = "SOL_USDT";
  settings.market.marketKey = "mexc:futures:SOL_USDT";
  settings.market.timeframe = "1h";
  await saveSettings(userId, settings);
  await createJournalEntry(userId, {
    type: "general",
    title: "Control account",
    notes: "Must remain byte-equivalent across another owner's restore.",
    tags: ["control"],
  });
}

function assertInitialPlan(plan) {
  assert.equal(plan.safeToApply, true);
  assert.equal(plan.profile.settingsWillReplace, true);
  assert.equal(plan.profile.paperRunsToAdd, 1);
  assert.equal(plan.manualPaper, "restore");
  assert.equal(plan.journal.entriesToAdd, 1);
  assert.equal(plan.workspaces.layoutsToAdd, 1);
  assert.equal(plan.conflicts.length, 0);
}

function assertIdempotentPlan(plan) {
  assert.equal(plan.safeToApply, true);
  assert.equal(plan.profile.settingsWillReplace, false);
  assert.equal(plan.profile.paperRunsToAdd, 0);
  assert.equal(plan.manualPaper, "unchanged");
  assert.equal(plan.journal.entriesToAdd, 0);
  assert.equal(plan.journal.existingEntries, 1);
  assert.equal(plan.workspaces.layoutsToAdd, 0);
  assert.equal(plan.workspaces.matchingLayouts, 1);
  assert.equal(plan.conflicts.length, 0);
}

export async function runIsolatedRecoveryRehearsal(options = {}) {
  const previousDataDirectory = process.env.DATA_DIR;
  const outputDirectory = resolve(
    options.outputDirectory ??
      process.env.RECOVERY_REHEARSAL_OUTPUT_DIR ??
      "artifacts/isolated-recovery-rehearsal",
  );
  const sourceRoot = await mkdtemp(
    join(tmpdir(), "dizytrades-recovery-source-"),
  );
  const targetRoot = await mkdtemp(
    join(tmpdir(), "dizytrades-recovery-target-"),
  );
  const startedAt = new Date().toISOString();

  try {
    assert.notEqual(sourceRoot, targetRoot);
    assert.equal(sourceRoot.startsWith(tmpdir()), true);
    assert.equal(targetRoot.startsWith(tmpdir()), true);

    process.env.DATA_DIR = sourceRoot;
    await seedOwner(REHEARSAL_OWNER);
    const sourceBackup = await buildUserBackupWithWorkspaces(REHEARSAL_OWNER);
    const sourceManifest = stableRecoveryManifest(sourceBackup);
    const sourceManifestHash = sha256(sourceManifest);

    const tampered = structuredClone(sourceBackup);
    tampered.data.workspaceLayouts[0].name = "Tampered recovery layout";

    process.env.DATA_DIR = targetRoot;
    await seedControlOwner(CONTROL_OWNER);
    const controlBefore = await buildUserBackupWithWorkspaces(CONTROL_OWNER);
    const controlBeforeHash = sha256(stableRecoveryManifest(controlBefore));

    await assert.rejects(
      () =>
        planUserBackupRestoreWithWorkspaces(REHEARSAL_OWNER, tampered),
      /integrity check failed/i,
    );
    await assert.rejects(
      () =>
        planUserBackupRestoreWithWorkspaces(CONTROL_OWNER, sourceBackup),
      /owner does not match/i,
    );

    const dryRun = await planUserBackupRestoreWithWorkspaces(
      REHEARSAL_OWNER,
      sourceBackup,
    );
    assertInitialPlan(dryRun);

    const restored = await applyUserBackupRestoreWithWorkspaces(
      REHEARSAL_OWNER,
      sourceBackup,
      dryRun.backupHash,
    );
    assert.equal(restored.applied, true);
    assert.equal(restored.profileUpdated, true);
    assert.equal(restored.manualPaperRestored, true);
    assert.equal(restored.created.journalEntries, 1);
    assert.equal(restored.created.workspaceLayouts, 1);

    const restoredBackup = await buildUserBackupWithWorkspaces(
      REHEARSAL_OWNER,
    );
    const restoredManifest = stableRecoveryManifest(restoredBackup);
    const restoredManifestHash = sha256(restoredManifest);
    assert.equal(restoredManifestHash, sourceManifestHash);
    assert.deepEqual(restoredManifest, sourceManifest);
    assert.equal(
      (await readWorkspaceLayouts(REHEARSAL_OWNER))[0]?.name,
      "ETH 4h recovery layout",
    );

    const repeatedDryRun = await planUserBackupRestoreWithWorkspaces(
      REHEARSAL_OWNER,
      sourceBackup,
    );
    assertIdempotentPlan(repeatedDryRun);

    const controlAfter = await buildUserBackupWithWorkspaces(CONTROL_OWNER);
    const controlAfterHash = sha256(stableRecoveryManifest(controlAfter));
    assert.equal(controlAfterHash, controlBeforeHash);

    const report = Object.freeze({
      schemaVersion: 1,
      rehearsal: "isolated-application-backup-recovery",
      startedAt,
      completedAt: new Date().toISOString(),
      sourceBackup: Object.freeze({
        version: sourceBackup.version,
        integrityHash: sourceBackup.integrity.contentHash,
        manifestHash: sourceManifestHash,
        counts: recoveryCounts(sourceBackup),
      }),
      restore: Object.freeze({
        dryRunSafe: dryRun.safeToApply,
        expectedBackupHashMatched:
          restored.plan.backupHash === sourceBackup.integrity.contentHash,
        profileUpdated: restored.profileUpdated,
        manualPaperRestored: restored.manualPaperRestored,
        created: restored.created,
        restoredManifestHash,
        idempotentDryRunSafe: repeatedDryRun.safeToApply,
      }),
      assertions: Object.freeze({
        isolatedSourceAndTargetRoots: true,
        productionDataDirectoryWasNotUsed: true,
        backupIntegrityVerified: true,
        tamperRejected: true,
        crossOwnerRestoreRejected: true,
        dryRunCompletedBeforeApply: true,
        stableOwnerManifestMatched: true,
        repeatedRestoreWasIdempotent: true,
        unrelatedOwnerRemainedUnchanged: true,
      }),
      boundaries: Object.freeze([
        "The rehearsal used two fresh operating-system temporary data roots.",
        "No Render API, production DATA_DIR, persistent disk, environment setting or live service was modified.",
        "Empty retained-evidence collections were verified as empty; their individual validators remain covered by the repository unit suite.",
        "A Render persistent-disk replacement or staging-disk attachment remains a separate infrastructure exercise.",
      ]),
    });

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      join(outputDirectory, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    return report;
  } finally {
    if (previousDataDirectory === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDirectory;
    if (options.keepRoots !== true) {
      await Promise.all([
        rm(sourceRoot, { recursive: true, force: true }),
        rm(targetRoot, { recursive: true, force: true }),
      ]);
    }
  }
}

async function main() {
  try {
    const report = await runIsolatedRecoveryRehearsal();
    console.log("Isolated recovery rehearsal passed.");
    console.log(`Backup: v${report.sourceBackup.version} ${report.sourceBackup.integrityHash}`);
    console.log(`Manifest: ${report.restore.restoredManifestHash}`);
    console.log(
      `Restored: profile=${report.restore.profileUpdated} manualPaper=${report.restore.manualPaperRestored} journal=${report.restore.created.journalEntries} layouts=${report.restore.created.workspaceLayouts}`,
    );
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    await mkdir(
      resolve(
        process.env.RECOVERY_REHEARSAL_OUTPUT_DIR ??
          "artifacts/isolated-recovery-rehearsal",
      ),
      { recursive: true },
    );
    await writeFile(
      resolve(
        process.env.RECOVERY_REHEARSAL_OUTPUT_DIR ??
          "artifacts/isolated-recovery-rehearsal",
        "failure.json",
      ),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          rehearsal: "isolated-application-backup-recovery",
          generatedAt: new Date().toISOString(),
          error: message,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    console.error(`Isolated recovery rehearsal failed: ${message}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
