import "server-only";

import { constants } from "node:fs";
import {
  access,
  mkdir,
  open,
  readdir,
  stat,
  statfs,
} from "node:fs/promises";
import { join } from "node:path";

export type DiagnosticState = "healthy" | "degraded" | "unavailable";

export type StorageCategoryDiagnostic = Readonly<{
  name: string;
  files: number;
  bytes: number;
  latestModifiedAt: string | null;
}>;

export type OperationalDiagnostics = Readonly<{
  version: 1;
  generatedAt: string;
  overall: DiagnosticState;
  deployment: Readonly<{
    commit: string | null;
    service: string | null;
    instance: string | null;
    deployId: string | null;
  }>;
  runtime: Readonly<{
    node: string;
    platform: string;
    uptimeSeconds: number;
    residentMemoryBytes: number;
    heapUsedBytes: number;
  }>;
  configuration: Readonly<{
    dataDirectoryConfigured: boolean;
    sessionSecretConfigured: boolean;
    publicSignupEnabled: boolean;
    liveTradingEnabled: false;
  }>;
  storage: Readonly<{
    state: DiagnosticState;
    readable: boolean;
    writable: boolean;
    totalBytes: number | null;
    freeBytes: number | null;
    usedBytes: number | null;
    scannedFiles: number;
    scannedBytes: number;
    scanTruncated: boolean;
    categories: readonly StorageCategoryDiagnostic[];
  }>;
  activity: Readonly<{
    state: DiagnosticState;
    retainedEvents: number;
    recentFailures: readonly Readonly<{ at: string; action: string }>[];
    latestEventAt: string | null;
  }>;
  limitations: readonly string[];
}>;

type CollectOptions = Readonly<{
  dataRoot?: string;
  environment?: NodeJS.ProcessEnv;
  now?: Date;
  maxFiles?: number;
  maxDepth?: number;
  auditTailBytes?: number;
}>;

type MutableCategory = {
  name: string;
  files: number;
  bytes: number;
  latestModifiedMs: number | null;
};

const safeText = (value: string | undefined, max = 120) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const safeCategory = (value: string) =>
  value.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80) || "root";

const safeAction = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/[^a-z0-9._:-]/gi, "_").slice(0, 120)
    : "unknown";

const finiteNonNegative = (value: number) =>
  Number.isFinite(value) && value >= 0 ? value : 0;

async function readAuditTail(
  dataRoot: string,
  bytes: number,
): Promise<OperationalDiagnostics["activity"]> {
  const target = join(dataRoot, "audit", "events.jsonl");
  try {
    const metadata = await stat(target);
    const length = Math.min(metadata.size, Math.max(4_096, bytes));
    const file = await open(target, "r");
    try {
      const buffer = Buffer.alloc(length);
      await file.read(buffer, 0, length, Math.max(0, metadata.size - length));
      const text = buffer.toString("utf8");
      const rawLines = text.split("\n");
      if (metadata.size > length) rawLines.shift();
      const entries = rawLines
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as { at?: unknown; action?: unknown };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is { at?: unknown; action?: unknown } => Boolean(entry));
      const latest = entries.at(-1);
      const failures = entries
        .filter((entry) =>
          /fail|error|reject|unavailable|denied/i.test(safeAction(entry.action)),
        )
        .slice(-20)
        .map((entry) => ({
          at:
            typeof entry.at === "string" && Number.isFinite(Date.parse(entry.at))
              ? new Date(entry.at).toISOString()
              : "unknown",
          action: safeAction(entry.action),
        }));
      return Object.freeze({
        state: "healthy" as const,
        retainedEvents: entries.length,
        recentFailures: Object.freeze(failures),
        latestEventAt:
          typeof latest?.at === "string" && Number.isFinite(Date.parse(latest.at))
            ? new Date(latest.at).toISOString()
            : null,
      });
    } finally {
      await file.close();
    }
  } catch {
    return Object.freeze({
      state: "unavailable" as const,
      retainedEvents: 0,
      recentFailures: Object.freeze([]),
      latestEventAt: null,
    });
  }
}

async function scanStorage(
  dataRoot: string,
  maxFiles: number,
  maxDepth: number,
) {
  const categories = new Map<string, MutableCategory>();
  let scannedFiles = 0;
  let scannedBytes = 0;
  let scanTruncated = false;

  const scan = async (directory: string, depth: number, category: string) => {
    if (scanTruncated || depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (scanTruncated) break;
      const nextCategory = depth === 0 ? safeCategory(entry.name) : category;
      const target = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await scan(target, depth + 1, nextCategory);
        continue;
      }
      if (!entry.isFile()) continue;
      if (scannedFiles >= maxFiles) {
        scanTruncated = true;
        break;
      }
      try {
        const metadata = await stat(target);
        scannedFiles += 1;
        scannedBytes += metadata.size;
        const current = categories.get(nextCategory) ?? {
          name: nextCategory,
          files: 0,
          bytes: 0,
          latestModifiedMs: null,
        };
        current.files += 1;
        current.bytes += metadata.size;
        current.latestModifiedMs = Math.max(
          current.latestModifiedMs ?? 0,
          metadata.mtimeMs,
        );
        categories.set(nextCategory, current);
      } catch {
        // A file can disappear during an active write or cleanup. Skip it safely.
      }
    }
  };

  await scan(dataRoot, 0, "root");
  return {
    scannedFiles,
    scannedBytes,
    scanTruncated,
    categories: [...categories.values()]
      .sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name))
      .map((category) =>
        Object.freeze({
          name: category.name,
          files: category.files,
          bytes: category.bytes,
          latestModifiedAt: category.latestModifiedMs
            ? new Date(category.latestModifiedMs).toISOString()
            : null,
        }),
      ),
  };
}

export async function collectOperationalDiagnostics(
  options: CollectOptions = {},
): Promise<OperationalDiagnostics> {
  const environment = options.environment ?? process.env;
  const dataRoot =
    options.dataRoot ?? environment.DATA_DIR ?? join(process.cwd(), ".data");
  const now = options.now ?? new Date();
  const limitations: string[] = [
    "External exchange and provider latency is not actively probed by this endpoint.",
    "Recent failures are derived only from retained audit action names; raw user details are never returned.",
    "Filesystem usage describes the current Render instance and mounted data volume only.",
  ];

  await mkdir(dataRoot, { recursive: true });
  let readable = false;
  let writable = false;
  try {
    await access(dataRoot, constants.R_OK);
    readable = true;
  } catch {
    readable = false;
  }
  try {
    await access(dataRoot, constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }

  let totalBytes: number | null = null;
  let freeBytes: number | null = null;
  let usedBytes: number | null = null;
  try {
    const filesystem = await statfs(dataRoot);
    totalBytes = finiteNonNegative(filesystem.blocks * filesystem.bsize);
    freeBytes = finiteNonNegative(filesystem.bavail * filesystem.bsize);
    usedBytes = Math.max(0, totalBytes - freeBytes);
  } catch {
    limitations.push("Filesystem capacity metrics are unavailable in this runtime.");
  }

  const scanned = readable
    ? await scanStorage(
        dataRoot,
        Math.max(1, options.maxFiles ?? 20_000),
        Math.max(0, options.maxDepth ?? 5),
      )
    : { scannedFiles: 0, scannedBytes: 0, scanTruncated: false, categories: [] };
  const activity = await readAuditTail(
    dataRoot,
    Math.max(4_096, options.auditTailBytes ?? 262_144),
  );
  if (scanned.scanTruncated) {
    limitations.push("Storage scan reached its bounded file limit; totals are partial.");
  }

  const storageState: DiagnosticState =
    readable && writable
      ? scanned.scanTruncated
        ? "degraded"
        : "healthy"
      : readable || writable
        ? "degraded"
        : "unavailable";
  const overall: DiagnosticState =
    storageState === "unavailable"
      ? "unavailable"
      : storageState === "degraded"
        ? "degraded"
        : "healthy";
  const memory = process.memoryUsage();

  return Object.freeze({
    version: 1 as const,
    generatedAt: now.toISOString(),
    overall,
    deployment: Object.freeze({
      commit: safeText(
        environment.RENDER_GIT_COMMIT ?? environment.GITHUB_SHA,
        40,
      ),
      service: safeText(environment.RENDER_SERVICE_NAME),
      instance: safeText(environment.RENDER_INSTANCE_ID),
      deployId: safeText(environment.RENDER_DEPLOY_ID),
    }),
    runtime: Object.freeze({
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      uptimeSeconds: Math.floor(process.uptime()),
      residentMemoryBytes: finiteNonNegative(memory.rss),
      heapUsedBytes: finiteNonNegative(memory.heapUsed),
    }),
    configuration: Object.freeze({
      dataDirectoryConfigured: Boolean(environment.DATA_DIR),
      sessionSecretConfigured: Boolean(environment.SESSION_SECRET),
      publicSignupEnabled: environment.PUBLIC_SIGNUP_ENABLED !== "false",
      liveTradingEnabled: false as const,
    }),
    storage: Object.freeze({
      state: storageState,
      readable,
      writable,
      totalBytes,
      freeBytes,
      usedBytes,
      scannedFiles: scanned.scannedFiles,
      scannedBytes: scanned.scannedBytes,
      scanTruncated: scanned.scanTruncated,
      categories: Object.freeze(scanned.categories),
    }),
    activity,
    limitations: Object.freeze(limitations),
  });
}
