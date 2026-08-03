import "server-only";

import {
  backupContentHash,
  canonicalBackupJson,
  validateDizyTradesBackup,
  type DizyTradesBackup,
  type DizyTradesBackupContent,
} from "./user-backup-model";
import {
  applyUserBackupRestore,
  buildUserBackup,
  planUserBackupRestore,
  type BackupRestorePlan as BaseBackupRestorePlan,
  type BackupRestoreResult as BaseBackupRestoreResult,
} from "./user-backup-store";
import { serialUserOperation } from "./user-operation-lock";
import {
  MAX_WORKSPACE_LAYOUTS,
  validateWorkspaceLayoutBackupCollection,
  type SavedWorkspaceLayout,
} from "./workspace-layout";
import {
  mergeWorkspaceLayoutsUnlocked,
  readWorkspaceLayouts,
} from "./workspace-layout-store";

export type DizyTradesWorkspaceBackup = Omit<DizyTradesBackup, "data"> &
  Readonly<{
    data: DizyTradesBackup["data"] &
      Readonly<{ workspaceLayouts: readonly SavedWorkspaceLayout[] }>;
  }>;

export type DizyTradesWorkspaceBackupUpload = Omit<DizyTradesBackup, "data"> &
  Readonly<{
    data: DizyTradesBackup["data"] &
      Readonly<{ workspaceLayouts?: readonly SavedWorkspaceLayout[] }>;
  }>;

export type BackupRestorePlan = Omit<
  BaseBackupRestorePlan,
  "backupHash" | "safeToApply" | "conflicts"
> &
  Readonly<{
    backupHash: string;
    safeToApply: boolean;
    workspaces: Readonly<{
      layoutsToAdd: number;
      matchingLayouts: number;
      existingLayouts: number;
    }>;
    conflicts: readonly string[];
  }>;

export type BackupRestoreResult = Omit<
  BaseBackupRestoreResult,
  "plan" | "created"
> &
  Readonly<{
    plan: BackupRestorePlan;
    created: BaseBackupRestoreResult["created"] &
      Readonly<{ workspaceLayouts: number }>;
  }>;

type ValidatedWorkspaceBackup = Readonly<{
  baseBackup: DizyTradesBackup;
  workspaceLayouts: readonly SavedWorkspaceLayout[];
  fullHash: string;
}>;

const record = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const hash = (value: unknown, field: string) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
};

function withoutWorkspaceLayouts(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== "workspaceLayouts"),
  );
}

function validateWorkspaceBackup(
  value: unknown,
  expectedOwnerId: string,
): ValidatedWorkspaceBackup {
  const input = record(value, "backup");
  const sourceVersion = input.version;
  const data = record(input.data, "data");
  const integrity = record(input.integrity, "integrity");
  if (integrity.algorithm !== "sha256") {
    throw new Error("Unsupported backup integrity algorithm.");
  }
  const suppliedHash = hash(integrity.contentHash, "integrity.contentHash");
  const hasWorkspaceLayouts = Object.prototype.hasOwnProperty.call(
    data,
    "workspaceLayouts",
  );
  if (sourceVersion === 1 && hasWorkspaceLayouts) {
    throw new Error("Legacy backup v1 cannot contain workspace layouts.");
  }
  const workspaceLayouts = validateWorkspaceLayoutBackupCollection(
    data.workspaceLayouts,
  );
  const baseData = withoutWorkspaceLayouts(data);
  const baseContent = {
    version: input.version,
    ownerId: input.ownerId,
    generatedAt: input.generatedAt,
    application: input.application,
    migration: input.migration,
    data: baseData,
    warnings: input.warnings,
  };
  if (sourceVersion === 1) {
    const legacyContent = {
      version: 1,
      ownerId: input.ownerId,
      generatedAt: input.generatedAt,
      application: input.application,
      data: baseData,
      warnings: input.warnings,
    };
    if (backupContentHash(legacyContent) !== suppliedHash) {
      throw new Error("Backup integrity check failed before migration.");
    }
  }
  const baseCandidate = {
    ...baseContent,
    integrity: {
      algorithm: "sha256" as const,
      contentHash: backupContentHash(baseContent),
    },
  };
  const baseBackup = validateDizyTradesBackup(baseCandidate, expectedOwnerId);
  if (sourceVersion === 1) {
    return Object.freeze({
      baseBackup,
      workspaceLayouts: Object.freeze([]),
      fullHash: baseBackup.integrity.contentHash,
    });
  }
  const { integrity: _baseIntegrity, ...normalisedBaseContent } = baseBackup;
  void _baseIntegrity;
  const extendedContent = hasWorkspaceLayouts
    ? {
        ...normalisedBaseContent,
        data: {
          ...normalisedBaseContent.data,
          workspaceLayouts,
        },
      }
    : normalisedBaseContent;
  const expectedFullHash = backupContentHash(extendedContent);
  if (suppliedHash !== expectedFullHash) {
    throw new Error("Backup integrity check failed.");
  }
  return Object.freeze({
    baseBackup,
    workspaceLayouts,
    fullHash: expectedFullHash,
  });
}

export async function buildUserBackupWithWorkspaces(
  userId: string,
): Promise<DizyTradesWorkspaceBackup> {
  const [baseBackup, workspaceLayouts] = await Promise.all([
    buildUserBackup(userId),
    readWorkspaceLayouts(userId),
  ]);
  const { integrity: _integrity, ...baseContent } = baseBackup;
  void _integrity;
  const content = Object.freeze({
    ...baseContent,
    data: Object.freeze({
      ...baseContent.data,
      workspaceLayouts: Object.freeze([...workspaceLayouts]),
    }),
  }) as DizyTradesBackupContent & {
    data: DizyTradesBackupContent["data"] & {
      workspaceLayouts: readonly SavedWorkspaceLayout[];
    };
  };
  return Object.freeze({
    ...content,
    integrity: Object.freeze({
      algorithm: "sha256" as const,
      contentHash: backupContentHash(content),
    }),
  }) as DizyTradesWorkspaceBackup;
}

function workspaceRestorePlan(
  current: readonly SavedWorkspaceLayout[],
  incoming: readonly SavedWorkspaceLayout[],
) {
  const conflicts: string[] = [];
  const byId = new Map(current.map((layout) => [layout.id, layout]));
  const byName = new Map(
    current.map((layout) => [layout.name.toLocaleLowerCase(), layout]),
  );
  let layoutsToAdd = 0;
  let matchingLayouts = 0;
  for (const layout of incoming) {
    const existingById = byId.get(layout.id);
    if (existingById) {
      if (canonicalBackupJson(existingById) === canonicalBackupJson(layout)) {
        matchingLayouts += 1;
      } else {
        conflicts.push(`Workspace layout ${layout.id} has different content.`);
      }
      continue;
    }
    const existingByName = byName.get(layout.name.toLocaleLowerCase());
    if (existingByName) {
      conflicts.push(
        `Workspace layout name "${layout.name}" is already used by a different snapshot.`,
      );
      continue;
    }
    layoutsToAdd += 1;
  }
  if (current.length + layoutsToAdd > MAX_WORKSPACE_LAYOUTS) {
    conflicts.push(
      `Restored workspaces would exceed the ${MAX_WORKSPACE_LAYOUTS}-layout limit.`,
    );
  }
  return Object.freeze({
    layoutsToAdd,
    matchingLayouts,
    existingLayouts: current.length,
    conflicts: Object.freeze(conflicts),
  });
}

async function buildRestorePlan(
  userId: string,
  validated: ValidatedWorkspaceBackup,
): Promise<BackupRestorePlan> {
  const [basePlan, currentLayouts] = await Promise.all([
    planUserBackupRestore(userId, validated.baseBackup),
    readWorkspaceLayouts(userId),
  ]);
  const layoutPlan = workspaceRestorePlan(
    currentLayouts,
    validated.workspaceLayouts,
  );
  const conflicts = Object.freeze([
    ...basePlan.conflicts,
    ...layoutPlan.conflicts,
  ]);
  return Object.freeze({
    ...basePlan,
    backupHash: validated.fullHash,
    safeToApply: conflicts.length === 0,
    workspaces: Object.freeze({
      layoutsToAdd: layoutPlan.layoutsToAdd,
      matchingLayouts: layoutPlan.matchingLayouts,
      existingLayouts: layoutPlan.existingLayouts,
    }),
    conflicts,
  });
}

export async function planUserBackupRestoreWithWorkspaces(
  userId: string,
  input: unknown,
): Promise<BackupRestorePlan> {
  return buildRestorePlan(userId, validateWorkspaceBackup(input, userId));
}

export async function applyUserBackupRestoreWithWorkspaces(
  userId: string,
  input: unknown,
  expectedBackupHash: string,
): Promise<BackupRestoreResult> {
  return serialUserOperation(userId, async () => {
    const validated = validateWorkspaceBackup(input, userId);
    if (validated.fullHash !== expectedBackupHash) {
      throw new Error("Backup changed after dry-run. Run the dry-run again.");
    }
    const plan = await buildRestorePlan(userId, validated);
    if (!plan.safeToApply) {
      throw new Error("Backup has unresolved conflicts and cannot be applied.");
    }
    const baseResult = await applyUserBackupRestore(
      userId,
      validated.baseBackup,
      validated.baseBackup.integrity.contentHash,
    );
    const workspaceLayouts = await mergeWorkspaceLayoutsUnlocked(
      userId,
      validated.workspaceLayouts,
    );
    return Object.freeze({
      ...baseResult,
      plan,
      created: Object.freeze({
        ...baseResult.created,
        workspaceLayouts,
      }),
    });
  });
}

export function workspaceBackupFilename(backup: DizyTradesWorkspaceBackupUpload) {
  const day = backup.generatedAt.slice(0, 10);
  return `dizytrades-backup-${day}-${backup.integrity.contentHash.slice(0, 10)}.json`;
}

export function workspaceBackupEncodedBytes(backup: DizyTradesWorkspaceBackupUpload) {
  return Buffer.byteLength(JSON.stringify(backup));
}
