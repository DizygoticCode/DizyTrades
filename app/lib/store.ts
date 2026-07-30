import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BacktestSummary } from "./backtest";
import {
  DEFAULT_TERMINAL_SETTINGS,
  sanitiseTerminalSettings,
  type UserTerminalSettings,
} from "./config";

type UserRecord = {
  version: 1;
  updatedAt: string;
  settings: UserTerminalSettings;
  paperRuns: Array<{
    id: string;
    createdAt: string;
    symbol: string;
    timeframe: string;
    summary: Omit<BacktestSummary, "closedTrades">;
  }>;
};

const root = () => process.env.DATA_DIR || join(process.cwd(), ".data");
const safeUserId = (userId: string) => userId.replace(/[^a-z0-9_-]/gi, "");
const userPath = (userId: string) => join(root(), "users", `${safeUserId(userId)}.json`);

async function ensureDirectories() {
  await mkdir(join(root(), "users"), { recursive: true });
  await mkdir(join(root(), "audit"), { recursive: true });
}

const initialRecord = (): UserRecord => ({
  version: 1,
  updatedAt: new Date(0).toISOString(),
  settings: structuredClone(DEFAULT_TERMINAL_SETTINGS),
  paperRuns: [],
});

export async function readUserRecord(userId: string): Promise<UserRecord> {
  await ensureDirectories();
  try {
    const parsed = JSON.parse(await readFile(userPath(userId), "utf8")) as Partial<UserRecord>;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string"
        ? parsed.updatedAt
        : new Date(0).toISOString(),
      settings: sanitiseTerminalSettings(parsed.settings),
      paperRuns: Array.isArray(parsed.paperRuns)
        ? parsed.paperRuns.slice(-50) as UserRecord["paperRuns"]
        : [],
    };
  } catch {
    return initialRecord();
  }
}

async function writeRecord(userId: string, record: UserRecord) {
  await ensureDirectories();
  const target = userPath(userId);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
}

export async function saveSettings(
  userId: string,
  input: unknown,
): Promise<UserRecord> {
  const current = await readUserRecord(userId);
  const next: UserRecord = {
    ...current,
    updatedAt: new Date().toISOString(),
    settings: sanitiseTerminalSettings(input),
  };
  await writeRecord(userId, next);
  return next;
}

export async function savePaperRun(
  userId: string,
  input: {
    symbol: string;
    timeframe: string;
    summary: BacktestSummary;
  },
) {
  const current = await readUserRecord(userId);
  const { closedTrades: _closedTrades, ...summary } = input.summary;
  void _closedTrades;
  const next: UserRecord = {
    ...current,
    updatedAt: new Date().toISOString(),
    paperRuns: [
      ...current.paperRuns,
      {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        symbol: input.symbol.slice(0, 30),
        timeframe: input.timeframe.slice(0, 10),
        summary,
      },
    ].slice(-50),
  };
  await writeRecord(userId, next);
  return next.paperRuns.at(-1)!;
}

export async function appendAudit(
  userId: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  await ensureDirectories();
  const entry = {
    at: new Date().toISOString(),
    userId: safeUserId(userId),
    action,
    details,
  };
  await appendFile(
    join(root(), "audit", "events.jsonl"),
    `${JSON.stringify(entry)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}
