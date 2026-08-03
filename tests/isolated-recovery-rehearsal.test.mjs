import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  recoveryCounts,
  runIsolatedRecoveryRehearsal,
  stableRecoveryManifest,
} from "../scripts/isolated-recovery-rehearsal.mjs";

test("stable recovery manifest excludes volatile backup metadata", () => {
  const backup = {
    ownerId: "owner",
    generatedAt: "2026-08-03T18:00:00.000Z",
    data: {
      profile: {
        version: 1,
        updatedAt: "2026-08-03T18:00:00.000Z",
        settings: { market: { symbol: "BTC_USDT" } },
        paperRuns: [{ id: "run-1" }],
      },
      manualPaper: {
        fills: [],
        fundingPayments: [],
      },
      journal: [{ id: "entry-1" }],
      replayMemories: [
        { id: "replay-1", integrity: { contentHash: "a".repeat(64) } },
      ],
      historicalDizyFlow: [
        { id: "flow-1", contentHash: "b".repeat(64) },
      ],
      dizyBrainReviews: [
        {
          id: "review-1",
          generatedFromHash: "c".repeat(64),
          reviewContentHash: "d".repeat(64),
        },
      ],
      workspaceLayouts: [{ id: "layout-1" }],
    },
  };
  const changed = structuredClone(backup);
  changed.generatedAt = "2026-08-03T19:00:00.000Z";
  changed.data.profile.updatedAt = "2026-08-03T19:00:00.000Z";

  assert.deepEqual(
    stableRecoveryManifest(changed),
    stableRecoveryManifest(backup),
  );
  assert.deepEqual(recoveryCounts(backup), {
    paperRuns: 1,
    manualPaperFills: 0,
    manualPaperFundingPayments: 0,
    journalEntries: 1,
    replayMemories: 1,
    historicalDizyFlow: 1,
    dizyBrainReviews: 1,
    workspaceLayouts: 1,
  });
});

test("full backup restores into an isolated data root with owner boundaries intact", async () => {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "dizytrades-recovery-report-"),
  );
  try {
    const report = await runIsolatedRecoveryRehearsal({ outputDirectory });
    assert.equal(report.rehearsal, "isolated-application-backup-recovery");
    assert.equal(report.sourceBackup.version, 2);
    assert.equal(report.sourceBackup.counts.paperRuns, 1);
    assert.equal(report.sourceBackup.counts.journalEntries, 1);
    assert.equal(report.sourceBackup.counts.workspaceLayouts, 1);
    assert.equal(report.restore.dryRunSafe, true);
    assert.equal(report.restore.expectedBackupHashMatched, true);
    assert.equal(report.restore.profileUpdated, true);
    assert.equal(report.restore.manualPaperRestored, true);
    assert.equal(report.restore.created.journalEntries, 1);
    assert.equal(report.restore.created.workspaceLayouts, 1);
    assert.equal(report.restore.idempotentDryRunSafe, true);
    assert.equal(
      report.sourceBackup.manifestHash,
      report.restore.restoredManifestHash,
    );
    assert.deepEqual(report.assertions, {
      isolatedSourceAndTargetRoots: true,
      productionDataDirectoryWasNotUsed: true,
      backupIntegrityVerified: true,
      tamperRejected: true,
      crossOwnerRestoreRejected: true,
      dryRunCompletedBeforeApply: true,
      stableOwnerManifestMatched: true,
      repeatedRestoreWasIdempotent: true,
      unrelatedOwnerRemainedUnchanged: true,
    });

    const persisted = JSON.parse(
      await readFile(join(outputDirectory, "report.json"), "utf8"),
    );
    assert.equal(
      persisted.restore.restoredManifestHash,
      report.restore.restoredManifestHash,
    );
    assert.equal(
      persisted.boundaries.some((item) =>
        item.includes("persistent-disk replacement"),
      ),
      true,
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("recovery workflow remains isolated from Render and production data", async () => {
  const [workflow, script, documentation] = await Promise.all([
    readFile(".github/workflows/isolated-recovery-rehearsal.yml", "utf8"),
    readFile("scripts/isolated-recovery-rehearsal.mjs", "utf8"),
    readFile("docs/ISOLATED_RECOVERY_REHEARSAL.md", "utf8"),
  ]);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /isolated-recovery-rehearsal\.mjs/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.doesNotMatch(workflow, /RENDER_API_KEY|RENDER_SERVICE_ID/);
  assert.match(script, /mkdtemp/);
  assert.match(script, /planUserBackupRestoreWithWorkspaces/);
  assert.match(script, /applyUserBackupRestoreWithWorkspaces/);
  assert.match(script, /crossOwnerRestoreRejected/);
  assert.doesNotMatch(script, /api\.render\.com|onrender\.com/);
  assert.match(documentation, /does not attach or replace a Render disk/i);
});
