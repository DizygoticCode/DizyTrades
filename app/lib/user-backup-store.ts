import "server-only";

import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MAX_TRADE_REVIEWS_PER_USER,
  MAX_TRADE_REVIEW_BYTES_PER_USER,
} from "./dizybrain-trade-review";
import { createTradeReview, readTradeReview } from "./dizybrain-review-store";
import { HISTORICAL_DIZYFLOW_LIMITS } from "./historical-dizyflow";
import {
  createHistoricalDizyFlowMemory,
  readHistoricalDizyFlowMemory,
} from "./historical-dizyflow-store";
import {
  MAX_REPLAY_MEMORIES_PER_USER,
  MAX_REPLAY_MEMORY_BYTES_PER_USER,
} from "./historical-replay-memory";
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
import { readManualAccount } from "./manual-paper";
import { createReplayMemory, readReplayMemory } from "./replay-memory-store";
import { readUserRecord } from "./store";
import {
  USER_BACKUP_VERSION,
  backupContentHash,
  canonicalBackupJson,
  finaliseDizyTradesBackup,
  nativeDizyTradesBackupMigration,
  validateBackupJournalEntry,
  validateBackupProfile,
  validateDizyTradesBackup,
  type BackupProfile,
  type DizyTradesBackup,
  type DizyTradesBackupContent,
} from "./user-backup-model";

const MAX_PROFILE_PAPER_RUNS = 50;
const MAX_RESTORE_JOURNAL_ENTRIES = 2_000;
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
  migration:DizyTradesBackup["migration"];
  safeToApply: boolean;
  profile: Readonly<{
    settingsWillReplace: boolean;
    paperRunsToAdd: number;
    matchingPaperRuns: number;
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

async function collectionStorage(directory: string, pattern: RegExp) {
  try {
    const files = (await readdir(directory)).filter((name) => pattern.test(name));
    let bytes = 0;
    for (const file of files) bytes += (await stat(join(directory, file))).size;
    return Object.freeze({ count: files.length, bytes });
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === "ENOENT") {
      return Object.freeze({ count: 0, bytes: 0 });
    }
    throw reason;
  }
}

export function restoreCollectionCapacityConflicts(input: {
  label: string;
  existingCount: number;
  incomingCount: number;
  maximumCount: number;
  existingBytes: number;
  incomingBytes: number;
  maximumBytes: number;
}) {
  const conflicts: string[] = [];
  if (input.existingCount + input.incomingCount > input.maximumCount) {
    conflicts.push(
      `${input.label} restore would exceed the ${input.maximumCount}-item limit.`,
    );
  }
  if (input.existingBytes + input.incomingBytes > input.maximumBytes) {
    conflicts.push(`${input.label} restore would exceed its storage-byte limit.`);
  }
  return Object.freeze(conflicts);
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

  const validatedManualPaper=validateManualPaperBackup(manualPaper,ownerId);
  const content: DizyTradesBackupContent = Object.freeze({
    version: USER_BACKUP_VERSION,
    ownerId,
    generatedAt: new Date().toISOString(),
    application: Object.freeze({
      name: "DizyTrades" as const,
      version: "0.2.0",
    }),
    migration:nativeDizyTradesBackupMigration(validatedManualPaper),
    data: Object.freeze({
      profile: validateBackupProfile(profileRecord),
      manualPaper: validatedManualPaper,
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
  const replayNew = [] as DizyTradesBackup["data"]["replayMemories"][number][];
  let replayExisting = 0;
  for (const memory of backup.data.replayMemories) {
    const existing = await readReplayMemory(userId, memory.id);
    if (!existing) replayNew.push(memory);
    else if (existing.integrity.contentHash === memory.integrity.contentHash) replayExisting += 1;
    else conflicts.push(`Replay memory ${memory.id} has different content.`);
  }

  const flowNew = [] as DizyTradesBackup["data"]["historicalDizyFlow"][number][];
  let flowExisting = 0;
  for (const memory of backup.data.historicalDizyFlow) {
    const existing = await readHistoricalDizyFlowMemory(userId, memory.id);
    if (!existing) flowNew.push(memory);
    else if (existing.contentHash === memory.contentHash) flowExisting += 1;
    else conflicts.push(`Historical DizyFlow memory ${memory.id} has different content.`);
  }

  const reviewsNew = [] as DizyTradesBackup["data"]["dizyBrainReviews"][number][];
  let reviewsExisting = 0;
  for (const review of backup.data.dizyBrainReviews) {
    const existing = await readTradeReview(userId, review.id);
    if (!existing) reviewsNew.push(review);
    else if (
      existing.generatedFromHash === review.generatedFromHash &&
      existing.reviewContentHash === review.reviewContentHash
    ) {
      reviewsExisting += 1;
    } else conflicts.push(`DizyBrain review ${review.id} has different content.`);
  }

  const [replayStorage, flowStorage, reviewStorage] = await Promise.all([
    collectionStorage(
      join(root(), "replay-memory", userId),
      /^hrm1_[a-f0-9]{40}\.json$/,
    ),
    collectionStorage(
      join(root(), "historical-dizyflow", userId),
      /^hdf1_[a-f0-9]{40}\.json$/,
    ),
    collectionStorage(
      join(root(), "dizybrain-reviews", userId),
      /^dbr1_[a-f0-9]{40}\.json$/,
    ),
  ]);
  conflicts.push(
    ...restoreCollectionCapacityConflicts({
      label: "Replay memory",
      existingCount: replayStorage.count,
      incomingCount: replayNew.length,
      maximumCount: MAX_REPLAY_MEMORIES_PER_USER,
      existingBytes: replayStorage.bytes,
      incomingBytes: replayNew.reduce(
        (total, memory) => total + Buffer.byteLength(`${JSON.stringify(memory, null, 2)}\n`),
        0,
      ),
      maximumBytes: MAX_REPLAY_MEMORY_BYTES_PER_USER,
    }),
    ...restoreCollectionCapacityConflicts({
      label: "Historical DizyFlow memory",
      existingCount: flowStorage.count,
      incomingCount: flowNew.length,
      maximumCount: HISTORICAL_DIZYFLOW_LIMITS.maximumMemoriesPerUser,
      existingBytes: flowStorage.bytes,
      incomingBytes: flowNew.reduce(
        (total, memory) => total + Buffer.byteLength(`${JSON.stringify(memory, null, 2)}\n`),
        0,
      ),
      maximumBytes: HISTORICAL_DIZYFLOW_LIMITS.maximumTotalBytesPerUser,
    }),
    ...restoreCollectionCapacityConflicts({
      label: "DizyBrain review",
      existingCount: reviewStorage.count,
      incomingCount: reviewsNew.length,
      maximumCount: MAX_TRADE_REVIEWS_PER_USER,
      existingBytes: reviewStorage.bytes,
      incomingBytes: reviewsNew.reduce(
        (total, review) => total + Buffer.byteLength(`${JSON.stringify(review, null, 2)}\n`),
        0,
      ),
      maximumBytes: MAX_TRADE_REVIEW_BYTES_PER_USER,
    }),
  );

  return {
    replayToCreate: replayNew.length,
    replayExisting,
    flowToCreate: flowNew.length,
    flowExisting,
    reviewsToCreate: reviewsNew.length,
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
  if(backup.migration.migrated)restoreWarnings.push("Backup schema v"+backup.migration.sourceBackupVersion+" was integrity-verified and migrated to v"+backup.migration.targetBackupVersion+" for this restore.");
  if(backup.migration.manualPaper.migrated)restoreWarnings.push("Manual Paper history was migrated from account v"+backup.migration.manualPaper.sourceAccountVersion+" without rewriting recorded prices, quantities, fees or P/L.");
  const currentEntries = new Map(currentJournal.entries.map((entry) => [entry.id, entry]));
  if (currentEntries.size !== currentJournal.entries.length) {
    conflicts.push("Existing Journal contains duplicate entry IDs.");
  }
  const tradeEntries = currentJournal.entries.filter((entry) => entry.trade);
  const currentTradeIds = new Map(
    tradeEntries.map((entry) => [entry.trade!.tradeId, entry]),
  );
  if (currentTradeIds.size !== tradeEntries.length) {
    conflicts.push("Existing Journal contains duplicate trade IDs.");
  }
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
  if (currentJournal.entries.length + entriesToAdd > MAX_RESTORE_JOURNAL_ENTRIES) {
    conflicts.push(
      `Restored Journal would exceed the ${MAX_RESTORE_JOURNAL_ENTRIES.toLocaleString("en-US")}-entry limit.`,
    );
  }

  const currentRuns = new Map(currentProfile.paperRuns.map((run) => [run.id, run]));
  if (currentRuns.size !== currentProfile.paperRuns.length) {
    conflicts.push("Existing profile contains duplicate Paper run IDs.");
  }
  let paperRunsToAdd = 0;
  let matchingPaperRuns = 0;
  for (const run of backup.data.profile.paperRuns) {
    const existing = currentRuns.get(run.id);
    if (!existing) paperRunsToAdd += 1;
    else if (same(existing, run)) matchingPaperRuns += 1;
    else conflicts.push(`Paper run ${run.id} already exists with different content.`);
  }
  if (currentProfile.paperRuns.length + paperRunsToAdd > MAX_PROFILE_PAPER_RUNS) {
    conflicts.push(
      `Restored Paper runs would exceed the ${MAX_PROFILE_PAPER_RUNS}-run limit.`,
    );
  }

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
    migration:backup.migration,
    safeToApply: conflicts.length === 0,
    profile: Object.freeze({
      settingsWillReplace: !same(currentProfile.settings, backup.data.profile.settings),
      paperRunsToAdd,
      matchingPaperRuns,
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
  if (byId.size !== current.paperRuns.length) {
    throw new Error("Existing profile contains duplicate Paper run IDs.");
  }
  for (const run of profile.paperRuns) {
    const existing = byId.get(run.id);
    if (existing && !same(existing, run)) {
      throw new Error(`Paper run ${run.id} already exists with different content.`);
    }
    if (!existing) byId.set(run.id, run);
  }
  if (byId.size > MAX_PROFILE_PAPER_RUNS) {
    throw new Error(
      `Restored Paper runs would exceed the ${MAX_PROFILE_PAPER_RUNS}-run limit.`,
    );
  }
  const merged: BackupProfile = Object.freeze({
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    settings: profile.settings,
    paperRuns: Object.freeze([...byId.values()]),
  });
  await atomicWrite(profilePath(userId), merged);
}

async function writeMergedJournal(
  userId: string,
  backup: DizyTradesBackup,
) {
  const current = await readJournal(userId);
  const currentEntries = new Map(current.entries.map((entry) => [entry.id, entry]));
  if (currentEntries.size !== current.entries.length) {
    throw new Error("Existing Journal contains duplicate entry IDs.");
  }
  const currentTradeIds = new Map(
    current.entries
      .filter((entry) => entry.trade)
      .map((entry) => [entry.trade!.tradeId, entry]),
  );
  const replayIds = new Set(backup.data.replayMemories.map((item) => item.id));
  const flowIds = new Set(backup.data.historicalDizyFlow.map((item) => item.id));
  const reviewIds = new Set(backup.data.dizyBrainReviews.map((item) => item.id));
  const additions: JournalEntry[] = [];
  for (const entry of backup.data.journal) {
    const existing = currentEntries.get(entry.id);
    if (existing) {
      if (!same(existing, entry)) {
        throw new Error(`Journal entry ${entry.id} already exists with different content.`);
      }
      continue;
    }
    const tradeEntry = entry.trade ? currentTradeIds.get(entry.trade.tradeId) : null;
    if (tradeEntry) {
      throw new Error(
        `Trade ${entry.trade!.tradeId} already belongs to Journal entry ${tradeEntry.id}.`,
      );
    }
    const repaired = repairEntryReferences(entry, replayIds, flowIds, reviewIds);
    additions.push(repaired);
    currentEntries.set(repaired.id, repaired);
    if (repaired.trade) currentTradeIds.set(repaired.trade.tradeId, repaired);
  }
  const entries = [...current.entries, ...additions];
  if (entries.length > MAX_RESTORE_JOURNAL_ENTRIES) {
    throw new Error(
      `Restored Journal would exceed the ${MAX_RESTORE_JOURNAL_ENTRIES.toLocaleString("en-US")}-entry limit.`,
    );
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
