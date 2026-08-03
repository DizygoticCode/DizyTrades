import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UserTerminalSettings } from "./config";
import {
  recentMarketFromSettings,
  sanitiseRecentMarketShortcuts,
  type RecentMarketShortcut,
} from "./recent-shortcuts";
import { serialUserOperation } from "./user-operation-lock";

const root = () => process.env.DATA_DIR || join(process.cwd(), ".data");
const safeUserId = (value: string) => {
  if (!/^[a-z0-9_-]{1,120}$/i.test(value)) {
    throw new Error("Invalid recent-shortcut owner identifier.");
  }
  return value;
};
const fileFor = (userId: string) =>
  join(root(), "recent-shortcuts", `${safeUserId(userId)}.json`);

type RecentShortcutRecord = Readonly<{
  version: 1;
  updatedAt: string;
  markets: readonly RecentMarketShortcut[];
}>;

async function writeRecord(
  userId: string,
  markets: readonly RecentMarketShortcut[],
) {
  const directory = join(root(), "recent-shortcuts");
  const target = fileFor(userId);
  await mkdir(directory, { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  const record: RecentShortcutRecord = Object.freeze({
    version: 1,
    updatedAt: new Date().toISOString(),
    markets: sanitiseRecentMarketShortcuts(markets),
  });
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
  return record;
}

export async function readRecentMarketShortcuts(userId: string) {
  try {
    const parsed = JSON.parse(await readFile(fileFor(userId), "utf8")) as {
      markets?: unknown;
    };
    return sanitiseRecentMarketShortcuts(parsed.markets);
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === "ENOENT") {
      return Object.freeze([]);
    }
    return Object.freeze([]);
  }
}

export async function recordRecentMarketShortcut(
  userId: string,
  market: UserTerminalSettings["market"],
) {
  const next = recentMarketFromSettings(market);
  if (!next) return null;
  return serialUserOperation(userId, async () => {
    const current = [...(await readRecentMarketShortcuts(userId))].filter(
      (item) => item.marketKey !== next.marketKey,
    );
    await writeRecord(userId, [next, ...current]);
    return next;
  });
}
