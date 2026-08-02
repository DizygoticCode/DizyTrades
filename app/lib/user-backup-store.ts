import "server-only";

import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTradeReview, readTradeReview } from "./dizybrain-review-store";
import {
  createHistoricalDizyFlowMemory,
  readHistoricalDizyFlowMemory,
} from "./historical-dizyflow-store";
import {
  unavailableHistoricalDizyFlowReference,
  type DizyBrainReviewReference,
  type JournalEntry,
} from "./journal-model";
import { readJournal } from "./journal-store";
import {
  manualPaperIsEmpty,
  validateManualPaperBackup,
  writeManualPaperBackup,
} from "./manual-paper-backup";
import { readManualAccount, type ManualAccount } from "./manual-paper";
import { createReplayMemory, readReplayMemory } from "./replay-memory-store";
import { readUserRecord } from "./store";
import {
  USER_BACKUP_VERSION,
  backupContentHash,
  canonicalBackupJson,
  finaliseDizyTradesBackup,
  validateBackupJournalEntry,
  validateBackupProfile,
  validateDizyTradesBackup,
  type BackupProfile,
  type DizyTradesBackup,
  type DizyTradesBackupContent,
} from "./user-backup-model";

const root = () => process.env.DATA_DIR || join(process.cwd(), ".data");
const safeUserId = (value: string) => {
  if (!/^[a-z0-9_-]{1,120}$/i.test(value)) {
    throw new Error("Invalid backup owner identifier.");
  }
  return value;
};
const profilePath = (userId: string) =>
  join(root(), "users", `${safeUserId(userId)}.json`);
const journalPath = (userId: string) =>
  join(root(), "journal", `${safeUserId(userId)}.json`);

export type BackupRestorePlan = Readonly<{
  version: 1;
  ownerId: string;
  generatedAt: string;
  backupHash: string;
  safeToApply: boolean;
  profile: Readonly<{
    settingsWillReplace: boolean;
    paperRunsToAdd: number;
    existingPaperRuns: number;
  }>;
  manualPaper: "unchanged" | "restore" | "skip-existing" | "skip-open-positions";
  journal: Readonly<{
    entriesToAdd: number;
    existingEntries: number;
  }>;
  evidence: Readonly<{
    replayToCreate: number;
    replayExisting: number;
    flowToCreate: number;
    flowExisting: number;
    reviewsToCreate: number;
    reviewsExisting: number;
  }>;
  conflicts: readonly string[];
  warnings: readonly string[];
}>;

export type BackupRestoreResult = Readonly<{
  applied: true;
  plan: BackupRestorePlan;
  created: Readonly<{
    journalEntries: number;
    replayMemories: number;
    historicalDizyFlow: number;
    dizyBrainReviews: number;
  }>;
  profileUpdated: boolean;
  manualPaperRestored: boolean;
}>;

const queues = new Map<string, Promise<unknown>>();
async function serial<T>(userId: string, operation: () => Promise<T>) {
  const prior = queues.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = prior.then(() => gate);
  queues.set(userId, current);
  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(userId) === current) queues.delete(userId);
  }
}

async function listIds(
  directory: string,
  pattern: RegExp,
): Promise<string[]> {
  try {
    return (await readdir(directory))
      .filter((name) => pattern.test(name))
      .map((name) => name.slice(0, -5))
      .sort();
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw reason;
  }
}

async function readCollection<T>(
  ids: readonly string[],
  reader: (id: string) => Promise<T | null>,
  label: string,
  warnings: string[],
) {
  const values: T[] = [];
  for (const id of ids) {
    try {
      const value = await reader(id);
      if (value) values.push(value);
      else warnings.push(`${label} ${id} was referenced on disk but unavailable.`);
    } catch {
      warnings.push(`${label} ${id} is malformed and was omitted from this export.`);
    }
  }
  return values;
}

export async function buildUserBackup(userId: string): Promise<DizyTradesBackup> {
  const ownerId = safeUserId(userId);
  const warnings: string[] = [];
  const [profileRecord, manualPaper, journalRecord] = await Promise.all([
    readUserRecord(ownerId),
    readManualAccount(ownerId),
    readJournal(ownerId),
  ]);

  const replayIds = await listIds(
    join(root(), "replay-memory", ownerId),
    /^hrm1_[a-f0-9]{40}\.json$/,
  );
  const flowIds = await listIds(
    join(root(), "historical-dizyflow", ownerId),
    /^hdf1_[a-f0-9]{40}\.json$/,
  );
  const reviewIds = await listIds(
    join(root(), "dizybrain-reviews", ownerId),
    /^dbr1_[a-f0-9]{40}\.json$/,
  );

  const [replayMemories, historicalDizyFlow, dizyBrainReviews] =
    await Promise.all([
      readCollection(
        replayIds,
        (id) => readReplayMemory(ownerId, id),
        "Replay memory",
        warnings,
      ),
      readCollection(
        flowIds,
        (id) => readHistoricalDizyFlowMemory(ownerId, id),
        "Historical DizyFlow memory",
        warnings,
      ),
      readCollection(
        reviewIds,
        (id) => readTradeReview(ownerId, id),
        "DizyBrain review",
        warnings,
      ),
    ]);

  const content: DizyTradesBackupContent = Object.freeze({
    version: USER_BACKUP_VERSION,
    ownerId,
    generatedAt: new Date().toISOString(),
    application: Object.freeze({
      name: "DizyTrades" as const,
      version: "0.2.0",
    }),
    data: Object.freeze({
      profile: validateBackupProfile(profileRecord),
      manualPaper: validateManualPaperBackup(manualPaper, ownerId),
      journal: Object.freeze(
        journalRecord.entries.map((entry, index) =>
          validateBackupJournalEntry(entry, index),
        ),
      ),
      replayMemories: Object.freeze(replayMemories),
      historicalDizyFlow: Object.freeze(historicalDizyFlow),
      dizyBrainReviews: Object.freeze(dizyBrainReviews),
    }),
    warnings: Object.freeze(warnings.slice(0, 200)),
  });
  return finaliseDizyTradesBackup(content);
}

const unavailableReview = (): DizyBrainReviewReference =>
  Object.freeze({
    available: false,
    reviewId: null,
    engineVersion: null,
    generatedAt: null,
    generatedFromHash: null,
    reviewConfidence: null,
  });

function repairEntryReferences(
  entry: JournalEntry,
  replayIds: ReadonlySet<string>,
  flowIds: ReadonlySet<string>,
  reviewIds: ReadonlySet<string>,
): JournalEntry {
  if (!entry.trade) return entry;
  let replay = entry.trade.replay;
  if (
    replay?.source === "retained-memory" &&
    (!replay.memoryId || !replayIds.has(replay.memoryId))
  ) {
    replay = Object.freeze({
      ...replay,
      available: false,
      source: "unavailable" as const,
      memoryId: null,
      capturedRangeStartMs: null,
      capturedRangeEndMs: null,
      candleCount: null,
      brainAvailable: false,
      flowAvailability: "unavailable" as const,
      integrityWarnings: Object.freeze([
        ...replay.integrityWarnings,
        "backup-missing-retained-replay-memory",
      ].slice(0, 20)),
    });
  }
  const review =
    entry.trade.dizyBrainReview.available &&
    entry.trade.dizyBrainReview.reviewId &&
    reviewIds.has(entry.trade.dizyBrainReview.reviewId)
      ? entry.trade.dizyBrainReview
      : unavailableReview();
  const flow =
    entry.trade.historicalDizyFlow.available &&
    entry.trade.historicalDizyFlow.memoryId &&
    flowIds.has(entry.trade.historicalDizyFlow.memoryId)
      ? entry.trade.historicalDizyFlow
      : entry.trade.historicalDizyFlow.available
        ? unavailableHistoricalDizyFlowReference()
        : entry.trade.historicalDizyFlow;
  return Object.freeze({
    ...entry,
    trade: Object.freeze({
      ...entry.trade,
      replay,
      dizyBrainReview: review,
      historicalDizyFlow: flow,
    }),
  });
}

function same(left: unknown, right: unknown) {
  return canonicalBackupJson(left) === canonicalBackupJson(right);
}

async function evidencePlan(
  userId: string,
  backup: DizyTradesBackup,
  conflicts: string[],
) {
  let replayToCreate = 0;
  let replayExisting = 0;
  for (const memory of backup.data.replayMemories) {
    const existing = await readReplayMemory(userId, memory.id);
    if (!existing) replayToCreate += 1;
    else if (existing.integrity.contentHash === memory.integrity.contentHash) replayExisting += 1;
    else conflicts.push(`Replay memory ${memory.id} has different content.`);
  }

  let flowToCreate = 0;
  let flowExisting = 0;
  for (const memory of backup.data.historicalDizyFlow) {
    const existing = await readHistoricalDizyFlowMemory(userId, memory.id);
    if (!existing) flowToCreate += 1;
    else if (existing.contentHash === memory.contentHash) flowExisting += 1;
    else conflicts.push(`Historical DizyFlow memory ${memory.id} has different content.`);
  }

  let reviewsToCreate = 0;
  let reviewsExisting = 0;
  for (const review of backup.data.dizyBrainReviews) {
    const existing = await readTradeReview(userId, review.id);
    if (!existing) reviewsToCreate += 1;
    else if (
      existing.generatedFromHash === review.generatedFromHash &&
      existing.reviewContentHash === review.reviewContentHash
    ) {
      reviewsExisting += 1;
    } else conflicts.push(`DizyBrain review ${review.id} has different content.`);
  }

  return {
    replayToCreate,
    replayExisting,
    flowToCreate,
    flowExisting,
    reviewsToCreate,
    reviewsExisting,
  };
}

export async function planUserBackupRestore(
  userId: string,
  input: unknown,
): Promise<BackupRestorePlan> {
  const ownerId = safeUserId(userId);
  const backup = validateDizyTradesBackup(input, ownerId);
  const [currentProfile, currentManual, currentJournal] = await Promise.all([
    readUserRecord(ownerId),
    readManualAccount(ownerId),
    readJournal(ownerId),
  ]);
  const conflicts: string[] = [];
  const restoreWarnings = [...backup.warnings];
  const currentEntries = new Map(currentJournal.entries.map((entry) => [entry.id, entry]));
  const currentTradeIds = new Map(
    currentJournal.entries
      .filter((entry) => entry.trade)
      .map((entry) => [entry.trade!.tradeId, entry]),
  );
  let entriesToAdd = 0;
  let existingEntries = 0;
  for (const entry of backup.data.journal) {
    const byId = currentEntries.get(entry.id);
    if (byId) {
      if (same(byId, entry)) existingEntries += 1;
      else conflicts.push(`Journal entry ${entry.id} already exists with different content.`);
      continue;
    }
    const byTrade = entry.trade ? currentTradeIds.get(entry.trade.tradeId) : null;
    if (byTrade) {
      conflicts.push(
        `Trade ${entry.trade!.tradeId} already belongs to Journal entry ${byTrade.id}.`,
      );
      continue;
    }
    entriesToAdd += 1;
  }

  const currentRunIds = new Set(currentProfile.paperRuns.map((run) => run.id));
  const paperRunsToAdd = backup.data.profile.paperRuns.filter(
    (run) => !currentRunIds.has(run.id),
  ).length;
  const manualSame = same(currentManual, backup.data.manualPaper);
  let manualPaper: BackupRestorePlan["manualPaper"] = "unchanged";
  if (!manualSame) {
    if (Object.keys(backup.data.manualPaper.positions).length) {
      manualPaper = "skip-open-positions";
      restoreWarnings.push(
        "Manual Paper was not restorable because the backup contains open positions with stale market risk.",
      );
    } else if (manualPaperIsEmpty(currentManual)) {
      manualPaper = "restore";
    } else {
      manualPaper = "skip-existing";
      restoreWarnings.push(
        "Existing Manual Paper history was preserved; restore applies only to an empty Manual Paper account.",
      );
    }
  }

  const evidence = await evidencePlan(ownerId, backup, conflicts);
  return Object.freeze({
    version: 1 as const,
    ownerId,
    generatedAt: new Date().toISOString(),
    backupHash: backup.integrity.contentHash,
    safeToApply: conflicts.length === 0,
    profile: Object.freeze({
      settingsWillReplace: !same(currentProfile.settings, backup.data.profile.settings),
      paperRunsToAdd,
      existingPaperRuns: currentProfile.paperRuns.length,
    }),
    manualPaper,
    journal: Object.freeze({ entriesToAdd, existingEntries }),
    evidence: Object.freeze(evidence),
    conflicts: Object.freeze(conflicts),
    warnings: Object.freeze([...new Set(restoreWarnings)].slice(0, 200)),
  });
}

async function atomicWrite(path: string, value: unknown) {
  await mkdir(join(path, ".."), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}

async function writeProfile(userId: string, profile: BackupProfile) {
  const current = await readUserRecord(userId);
  const byId = new Map(current.paperRuns.map((run) => [run.id, run]));
  for (const run of profile.paperRuns) {
    if (!byId.has(run.id)) byId.set(run.id, run);
  }
  const merged: BackupProfile = Object.freeze({
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    settings: profile.settings,
    paperRuns: Object.freeze([...byId.values()].slice(-50)),
  });
  await atomicWrite(profilePath(userId), merged);
}

async function writeMergedJournal(
  userId: string,
  backup: DizyTradesBackup,
) {
  const current = await readJournal(userId);
  const currentIds = new Set(current.entries.map((entry) => entry.id));
  const replayIds = new Set(backup.data.replayMemories.map((item) => item.id));
  const flowIds = new Set(backup.data.historicalDizyFlow.map((item) => item.id));
  const reviewIds = new Set(backup.data.dizyBrainReviews.map((item) => item.id));
  const additions = backup.data.journal
    .filter((entry) => !currentIds.has(entry.id))
    .map((entry) => repairEntryReferences(entry, replayIds, flowIds, reviewIds));
  const entries = [...current.entries, ...additions];
  if (entries.length > 2_000) {
    throw new Error("Restored Journal would exceed its 2,000-entry limit.");
  }
  await atomicWrite(journalPath(userId), { version: 5, entries });
  return additions.length;
}

export async function applyUserBackupRestore(
  userId: string,
  input: unknown,
  expectedBackupHash: string,
): Promise<BackupRestoreResult> {
  return serial(userId, async () => {
    const ownerId = safeUserId(userId);
    const backup = validateDizyTradesBackup(input, ownerId);
    if (backup.integrity.contentHash !== expectedBackupHash) {
      throw new Error("Backup changed after dry-run. Run the dry-run again.");
    }
    const plan = await planUserBackupRestore(ownerId, backup);
    if (!plan.safeToApply) {
      throw new Error("Backup has unresolved conflicts and cannot be applied.");
    }

    let replayCreated = 0;
    for (const memory of backup.data.replayMemories) {
      const result = await createReplayMemory(ownerId, memory);
      if (result.created) replayCreated += 1;
    }
    let flowCreated = 0;
    for (const memory of backup.data.historicalDizyFlow) {
      const result = await createHistoricalDizyFlowMemory(ownerId, memory);
      if (result.created) flowCreated += 1;
    }
    let reviewsCreated = 0;
    for (const review of backup.data.dizyBrainReviews) {
      const result = await createTradeReview(ownerId, review);
      if (result.created) reviewsCreated += 1;
    }

    const journalEntries = await writeMergedJournal(ownerId, backup);
    const profileUpdated =
      plan.profile.settingsWillReplace || plan.profile.paperRunsToAdd > 0;
    if (profileUpdated) await writeProfile(ownerId, backup.data.profile);
    const manualPaperRestored = plan.manualPaper === "restore";
    if (manualPaperRestored) {
      await writeManualPaperBackup(ownerId, backup.data.manualPaper);
    }

    return Object.freeze({
      applied: true as const,
      plan,
      created: Object.freeze({
        journalEntries,
        replayMemories: replayCreated,
        historicalDizyFlow: flowCreated,
        dizyBrainReviews: reviewsCreated,
      }),
      profileUpdated,
      manualPaperRestored,
    });
  });
}

const csvCell = (value: unknown) => {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function journalTradesCsv(entries: readonly JournalEntry[]) {
  const header = [
    "Trade ID",
    "Symbol",
    "Timeframe",
    "Direction",
    "Open Time",
    "Close Time",
    "Entry",
    "Exit",
    "PnL",
    "PnL %",
    "R Multiple",
    "Fees",
    "Close Reason",
    "Quality",
    "Plan Discipline",
    "Mood",
    "Tags",
    "Archived",
  ];
  const rows = entries
    .filter((entry) => entry.trade)
    .sort((left, right) =>
      left.trade!.closeTime.localeCompare(right.trade!.closeTime),
    )
    .map((entry) => {
      const trade = entry.trade!;
      return [
        trade.tradeId,
        trade.symbol,
        trade.timeframe,
        trade.direction,
        trade.openTime,
        trade.closeTime,
        trade.entry,
        trade.exit,
        trade.pnl,
        trade.pnlPct,
        trade.rMultiple,
        trade.fees,
        trade.closeReason,
        entry.quality,
        entry.planDiscipline,
        entry.mood,
        entry.tags.join(" | "),
        entry.archived,
      ]
        .map(csvCell)
        .join(",");
    });
  return `\uFEFF${[header.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

export function backupFilename(backup: DizyTradesBackup) {
  const day = backup.generatedAt.slice(0, 10);
  return `dizytrades-backup-${day}-${backup.integrity.contentHash.slice(0, 10)}.json`;
}

export function backupEncodedBytes(backup: DizyTradesBackup) {
  return Buffer.byteLength(JSON.stringify(backup));
}

export function backupFingerprint(backup: DizyTradesBackup) {
  return backupContentHash({
    ...backup,
    integrity: undefined,
  } as unknown as DizyTradesBackupContent);
}
