import "server-only";

import { createHash } from "node:crypto";
import type { BacktestSummary } from "./backtest";
import {
  sanitiseTerminalSettings,
  type UserTerminalSettings,
} from "./config";
import {
  validateDizyBrainTradeReview,
  type DizyBrainTradeReview,
} from "./dizybrain-trade-review";
import {
  validateHistoricalDizyFlowMemory,
  type HistoricalDizyFlowMemory,
} from "./historical-dizyflow";
import {
  validateHistoricalReplayMemory,
  type HistoricalReplayMemory,
} from "./historical-replay-memory";
import {
  JOURNAL_SCHEMA_VERSION,
  type DizyBrainReviewReference,
  type JournalEntry,
} from "./journal-model";
import { migrateJournalEntry } from "./journal-store";
import {
  journalCreateFields,
  journalEditableFields,
  validateTradeSnapshot,
} from "./journal-validation";
import type { ManualAccount } from "./manual-paper";
import { validateManualPaperBackup } from "./manual-paper-backup";

export const USER_BACKUP_VERSION = 2 as const;
export const USER_BACKUP_MIGRATION_SCHEMA_VERSION = 1 as const;
export const MAX_USER_BACKUP_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_WARNINGS = 200;


export type DizyTradesBackupMigration=Readonly<{
  schemaVersion:typeof USER_BACKUP_MIGRATION_SCHEMA_VERSION;
  sourceBackupVersion:1|2;
  targetBackupVersion:typeof USER_BACKUP_VERSION;
  migrated:boolean;
  sourceContentHash:string|null;
  steps:readonly string[];
  manualPaper:Readonly<{
    sourceAccountVersion:2|3|4;
    targetAccountVersion:4;
    migrated:boolean;
    fillCount:number;
    fundingPaymentCount:number;
    historyContentHash:string;
  }>;
}>;

export type BackupPaperRun = Readonly<{
  id: string;
  createdAt: string;
  symbol: string;
  timeframe: string;
  summary: Omit<BacktestSummary, "closedTrades">;
}>;

export type BackupProfile = Readonly<{
  version: 1;
  updatedAt: string;
  settings: UserTerminalSettings;
  paperRuns: readonly BackupPaperRun[];
}>;

export type DizyTradesBackupContent = Readonly<{
  version: typeof USER_BACKUP_VERSION;
  ownerId: string;
  generatedAt: string;
  application: Readonly<{
    name: "DizyTrades";
    version: string;
  }>;
  migration:DizyTradesBackupMigration;
  data: Readonly<{
    profile: BackupProfile;
    manualPaper: ManualAccount;
    journal: readonly JournalEntry[];
    replayMemories: readonly HistoricalReplayMemory[];
    historicalDizyFlow: readonly HistoricalDizyFlowMemory[];
    dizyBrainReviews: readonly DizyBrainTradeReview[];
  }>;
  warnings: readonly string[];
}>;

export type DizyTradesBackup = DizyTradesBackupContent &
  Readonly<{
    integrity: Readonly<{
      algorithm: "sha256";
      contentHash: string;
    }>;
  }>;

const record = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
};
const text = (value: unknown, field: string, max = 300) => {
  if (typeof value !== "string" || !value || value.length > max) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
};
const iso = (value: unknown, field: string) => {
  const candidate = text(value, field, 50);
  const milliseconds = Date.parse(candidate);
  if (!Number.isFinite(milliseconds)) throw new Error(`${field} is invalid.`);
  return new Date(milliseconds).toISOString();
};
const finite = (
  value: unknown,
  field: string,
  minimum = Number.NEGATIVE_INFINITY,
) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum
  ) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
};
const integer = (value: unknown, field: string, minimum = 0) => {
  const parsed = finite(value, field, minimum);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} is invalid.`);
  return parsed;
};
const nullableFinite = (value: unknown, field: string, minimum = 0) =>
  value == null ? null : finite(value, field, minimum);

function canonicalValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Backup contains a non-finite number.");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  throw new Error("Backup contains an unsupported value.");
}

export function canonicalBackupJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

export function backupContentHash(content: unknown) {
  return createHash("sha256").update(canonicalBackupJson(content)).digest("hex");
}

function summary(value: unknown): BackupPaperRun["summary"] {
  const input = record(value, "profile.paperRun.summary");
  return Object.freeze({
    initialEquity: finite(input.initialEquity, "summary.initialEquity", 0),
    endingEquity: finite(input.endingEquity, "summary.endingEquity", 0),
    returnPct: finite(input.returnPct, "summary.returnPct"),
    maxDrawdownPct: finite(input.maxDrawdownPct, "summary.maxDrawdownPct", 0),
    trades: integer(input.trades, "summary.trades"),
    wins: integer(input.wins, "summary.wins"),
    winRatePct: finite(input.winRatePct, "summary.winRatePct", 0),
    profitFactor: nullableFinite(input.profitFactor, "summary.profitFactor", 0),
  });
}

function paperRun(value: unknown, index: number): BackupPaperRun {
  const input = record(value, `profile.paperRuns.${index}`);
  return Object.freeze({
    id: text(input.id, `profile.paperRuns.${index}.id`, 120),
    createdAt: iso(input.createdAt, `profile.paperRuns.${index}.createdAt`),
    symbol: text(input.symbol, `profile.paperRuns.${index}.symbol`, 80),
    timeframe: text(input.timeframe, `profile.paperRuns.${index}.timeframe`, 10),
    summary: summary(input.summary),
  });
}

export function validateBackupProfile(value: unknown): BackupProfile {
  const input = record(value, "profile");
  if (input.version !== 1) throw new Error("Unsupported profile backup version.");
  if (!Array.isArray(input.paperRuns) || input.paperRuns.length > 50) {
    throw new Error("Profile paper-run history is invalid.");
  }
  const paperRuns = input.paperRuns.map(paperRun);
  if (new Set(paperRuns.map((item) => item.id)).size !== paperRuns.length) {
    throw new Error("Profile paper-run IDs are duplicated.");
  }
  return Object.freeze({
    version: 1 as const,
    updatedAt: iso(input.updatedAt, "profile.updatedAt"),
    settings: sanitiseTerminalSettings(input.settings),
    paperRuns: Object.freeze(paperRuns),
  });
}

function reviewReference(value: unknown): DizyBrainReviewReference {
  const input = record(value, "journal.trade.dizyBrainReview");
  if (input.available !== true) {
    return Object.freeze({
      available: false,
      reviewId: null,
      engineVersion: null,
      generatedAt: null,
      generatedFromHash: null,
      reviewConfidence: null,
    });
  }
  const confidence = finite(
    input.reviewConfidence,
    "journal.trade.dizyBrainReview.reviewConfidence",
    0,
  );
  if (confidence > 100) throw new Error("Review confidence is invalid.");
  const generatedFromHash = text(
    input.generatedFromHash,
    "journal.trade.dizyBrainReview.generatedFromHash",
    64,
  );
  if (!/^[a-f0-9]{64}$/.test(generatedFromHash)) {
    throw new Error("Review source hash is invalid.");
  }
  return Object.freeze({
    available: true,
    reviewId: text(input.reviewId, "journal.trade.dizyBrainReview.reviewId", 120),
    engineVersion: text(
      input.engineVersion,
      "journal.trade.dizyBrainReview.engineVersion",
      80,
    ),
    generatedAt: iso(
      input.generatedAt,
      "journal.trade.dizyBrainReview.generatedAt",
    ),
    generatedFromHash,
    reviewConfidence: confidence,
  });
}

export function validateBackupJournalEntry(
  value: unknown,
  index: number,
): JournalEntry {
  const migrated = migrateJournalEntry(value);
  if (!migrated) throw new Error(`journal.${index} is invalid.`);
  const input = record(value, `journal.${index}`);
  const id = text(input.id, `journal.${index}.id`, 120);
  if (!/^[a-z0-9_-]{1,120}$/i.test(id)) {
    throw new Error(`journal.${index}.id is invalid.`);
  }
  const createdAt = iso(input.createdAt, `journal.${index}.createdAt`);
  const editedAt = iso(input.editedAt, `journal.${index}.editedAt`);
  const fields = journalCreateFields(migrated);
  const base = {
    id,
    ...fields,
    createdAt,
    editedAt,
  } as JournalEntry;
  const editable = journalEditableFields(migrated, base);
  const archived = input.archived === true;
  const archivedAt = archived
    ? iso(input.archivedAt, `journal.${index}.archivedAt`)
    : null;
  const trade = migrated.trade
    ? Object.freeze({
        ...validateTradeSnapshot(migrated.trade),
        dizyBrainReview: reviewReference(migrated.trade.dizyBrainReview),
      })
    : null;
  return Object.freeze({
    ...editable,
    id,
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    archived,
    archivedAt,
    trade,
    createdAt,
    editedAt,
  });
}

function uniqueById<T extends { id: string }>(
  values: readonly T[],
  field: string,
): readonly T[] {
  if (new Set(values.map((item) => item.id)).size !== values.length) {
    throw new Error(`${field} contains duplicate IDs.`);
  }
  return Object.freeze([...values]);
}

function warnings(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_BACKUP_WARNINGS) {
    throw new Error("Backup warnings are invalid.");
  }
  return Object.freeze(
    value.map((item, index) => text(item, `warnings.${index}`, 300)),
  );
}


function migrationSteps(value:unknown){
  if(!Array.isArray(value)||value.length>50)throw new Error("Backup migration steps are invalid.");
  const steps=value.map((item,index)=>text(item,"migration.steps."+index,100));
  if(new Set(steps).size!==steps.length)throw new Error("Backup migration steps contain duplicates.");
  return Object.freeze(steps)
}
function manualPaperMigrationSummary(manualPaper:ManualAccount):DizyTradesBackupMigration["manualPaper"]{
  const ledger=manualPaper.migration;
  return Object.freeze({sourceAccountVersion:ledger.sourceAccountVersion,targetAccountVersion:ledger.targetAccountVersion,migrated:ledger.migrated,fillCount:ledger.fillCount,fundingPaymentCount:ledger.fundingPaymentCount,historyContentHash:ledger.historyContentHash})
}
export function nativeDizyTradesBackupMigration(manualPaper:ManualAccount):DizyTradesBackupMigration{
  return Object.freeze({schemaVersion:USER_BACKUP_MIGRATION_SCHEMA_VERSION,sourceBackupVersion:USER_BACKUP_VERSION,targetBackupVersion:USER_BACKUP_VERSION,migrated:false,sourceContentHash:null,steps:Object.freeze([]),manualPaper:manualPaperMigrationSummary(manualPaper)})
}
function migratedV1BackupReport(sourceContentHash:string,manualPaper:ManualAccount):DizyTradesBackupMigration{
  return Object.freeze({schemaVersion:USER_BACKUP_MIGRATION_SCHEMA_VERSION,sourceBackupVersion:1,targetBackupVersion:USER_BACKUP_VERSION,migrated:true,sourceContentHash,steps:Object.freeze(["verify-v1-integrity-before-migration","upgrade-user-backup-v1-to-v2","migrate-manual-paper-history"]),manualPaper:manualPaperMigrationSummary(manualPaper)})
}
function validateBackupMigration(value:unknown,manualPaper:ManualAccount):DizyTradesBackupMigration{
  const input=record(value,"migration");
  if(input.schemaVersion!==USER_BACKUP_MIGRATION_SCHEMA_VERSION)throw new Error("Unsupported backup migration schema.");
  if(input.sourceBackupVersion!==1&&input.sourceBackupVersion!==2)throw new Error("Backup migration source version is invalid.");
  if(input.targetBackupVersion!==USER_BACKUP_VERSION)throw new Error("Backup migration target version is invalid.");
  if(typeof input.migrated!=="boolean"||input.migrated!==(input.sourceBackupVersion!==USER_BACKUP_VERSION))throw new Error("Backup migration state does not reconcile.");
  const sourceContentHash=input.sourceContentHash==null?null:text(input.sourceContentHash,"migration.sourceContentHash",64);
  if(sourceContentHash!==null&&!/^[a-f0-9]{64}$/.test(sourceContentHash))throw new Error("Backup migration source hash is invalid.");
  if((input.sourceBackupVersion===1)!==(sourceContentHash!==null))throw new Error("Backup migration source hash does not reconcile.");
  const steps=migrationSteps(input.steps),paper=record(input.manualPaper,"migration.manualPaper"),expected=manualPaperMigrationSummary(manualPaper),historyContentHash=text(paper.historyContentHash,"migration.manualPaper.historyContentHash",64);
  if(!/^[a-f0-9]{64}$/.test(historyContentHash))throw new Error("Backup Manual Paper history hash is invalid.");
  const parsed=Object.freeze({sourceAccountVersion:finite(paper.sourceAccountVersion,"migration.manualPaper.sourceAccountVersion",2) as 2|3|4,targetAccountVersion:finite(paper.targetAccountVersion,"migration.manualPaper.targetAccountVersion",4) as 4,migrated:paper.migrated===true,fillCount:integer(paper.fillCount,"migration.manualPaper.fillCount"),fundingPaymentCount:integer(paper.fundingPaymentCount,"migration.manualPaper.fundingPaymentCount"),historyContentHash});
  if(parsed.sourceAccountVersion!==expected.sourceAccountVersion||parsed.targetAccountVersion!==expected.targetAccountVersion||parsed.migrated!==expected.migrated||parsed.fillCount!==expected.fillCount||parsed.fundingPaymentCount!==expected.fundingPaymentCount||parsed.historyContentHash!==expected.historyContentHash)throw new Error("Backup Manual Paper migration summary does not reconcile.");
  return Object.freeze({schemaVersion:USER_BACKUP_MIGRATION_SCHEMA_VERSION,sourceBackupVersion:input.sourceBackupVersion,targetBackupVersion:USER_BACKUP_VERSION,migrated:input.migrated,sourceContentHash,steps,manualPaper:parsed})
}
function verifyLegacyV1Integrity(input:Record<string,unknown>){
  const integrity=record(input.integrity,"integrity");
  if(integrity.algorithm!=="sha256")throw new Error("Unsupported backup integrity algorithm.");
  const supplied=text(integrity.contentHash,"integrity.contentHash",64);
  if(!/^[a-f0-9]{64}$/.test(supplied))throw new Error("Backup integrity hash is invalid.");
  const legacyContent={version:1,ownerId:input.ownerId,generatedAt:input.generatedAt,application:input.application,data:input.data,warnings:input.warnings};
  if(backupContentHash(legacyContent)!==supplied)throw new Error("Backup integrity check failed before migration.");
  return supplied
}

export function validateDizyTradesBackup(
  value: unknown,
  expectedOwnerId: string,
): DizyTradesBackup {
  const input = record(value, "backup"),sourceBackupVersion=input.version;
  if(sourceBackupVersion!==1&&sourceBackupVersion!==USER_BACKUP_VERSION)throw new Error("Unsupported DizyTrades backup version.");
  const legacySourceContentHash=sourceBackupVersion===1?verifyLegacyV1Integrity(input):null;
  const ownerId = text(input.ownerId, "ownerId", 120);
  if (ownerId !== expectedOwnerId) {
    throw new Error("Backup owner does not match the signed-in account.");
  }
  const applicationInput = record(input.application, "application");
  if (applicationInput.name !== "DizyTrades") {
    throw new Error("Backup application identity is invalid.");
  }
  const dataInput = record(input.data, "data");
  if (!Array.isArray(dataInput.journal) || dataInput.journal.length > 2_000) {
    throw new Error("Backup Journal is invalid.");
  }
  if (
    !Array.isArray(dataInput.replayMemories) ||
    !Array.isArray(dataInput.historicalDizyFlow) ||
    !Array.isArray(dataInput.dizyBrainReviews)
  ) {
    throw new Error("Backup evidence collections are invalid.");
  }

  const journal = dataInput.journal.map(validateBackupJournalEntry);
  if (new Set(journal.map((entry) => entry.id)).size !== journal.length) {
    throw new Error("Backup Journal contains duplicate entry IDs.");
  }
  const tradeIds = journal
    .map((entry) => entry.trade?.tradeId)
    .filter((item): item is string => Boolean(item));
  if (new Set(tradeIds).size !== tradeIds.length) {
    throw new Error("Backup Journal contains duplicate trade IDs.");
  }

  const replayMemories = uniqueById(
    dataInput.replayMemories.map(validateHistoricalReplayMemory),
    "Replay memories",
  );
  const historicalDizyFlow = uniqueById(
    dataInput.historicalDizyFlow.map(validateHistoricalDizyFlowMemory),
    "Historical DizyFlow memories",
  );
  const dizyBrainReviews = uniqueById(
    dataInput.dizyBrainReviews.map(validateDizyBrainTradeReview),
    "DizyBrain reviews",
  );

  const manualPaper=validateManualPaperBackup(dataInput.manualPaper, ownerId);
  const migration=sourceBackupVersion===1?migratedV1BackupReport(legacySourceContentHash!,manualPaper):validateBackupMigration(input.migration,manualPaper);

  const content: DizyTradesBackupContent = Object.freeze({
    version: USER_BACKUP_VERSION,
    ownerId,
    generatedAt: iso(input.generatedAt, "generatedAt"),
    application: Object.freeze({
      name: "DizyTrades" as const,
      version: text(applicationInput.version, "application.version", 40),
    }),
    migration,
    data: Object.freeze({
      profile: validateBackupProfile(dataInput.profile),
      manualPaper,
      journal: Object.freeze(journal),
      replayMemories,
      historicalDizyFlow,
      dizyBrainReviews,
    }),
    warnings: warnings(input.warnings),
  });

  const integrityInput = record(input.integrity, "integrity");
  if (integrityInput.algorithm !== "sha256") throw new Error("Unsupported backup integrity algorithm.");
  const expectedHash = backupContentHash(content);
  if(sourceBackupVersion===USER_BACKUP_VERSION){const suppliedHash=text(integrityInput.contentHash,"integrity.contentHash",64);if(suppliedHash!==expectedHash)throw new Error("Backup integrity check failed.")}

  return Object.freeze({
    ...content,
    integrity: Object.freeze({
      algorithm: "sha256" as const,
      contentHash: expectedHash,
    }),
  });
}

export function finaliseDizyTradesBackup(
  content: DizyTradesBackupContent,
): DizyTradesBackup {
  const hash = backupContentHash(content);
  return Object.freeze({
    ...content,
    integrity: Object.freeze({
      algorithm: "sha256" as const,
      contentHash: hash,
    }),
  });
}
