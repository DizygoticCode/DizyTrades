import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UserTerminalSettings } from "./config";
import {
  MAX_WORKSPACE_LAYOUTS,
  WORKSPACE_LAYOUT_VERSION,
  normaliseWorkspaceLayoutName,
  sanitiseSavedWorkspaceLayouts,
  type SavedWorkspaceLayout,
} from "./workspace-layout";

const root = () => process.env.DATA_DIR || join(process.cwd(), ".data");
const safeUserId = (value: string) => {
  if (!/^[a-z0-9_-]{1,120}$/i.test(value)) throw new Error("Invalid workspace owner identifier.");
  return value;
};
const pathFor = (userId: string) =>
  join(root(), "workspace-layouts", `${safeUserId(userId)}.json`);
const queues = new Map<string, Promise<unknown>>();

type WorkspaceLayoutRecord = Readonly<{
  version: 1;
  updatedAt: string;
  layouts: readonly SavedWorkspaceLayout[];
}>;

async function serial<T>(userId: string, operation: () => Promise<T>) {
  const key = safeUserId(userId);
  const prior = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = prior.then(() => gate);
  queues.set(key, current);
  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(key) === current) queues.delete(key);
  }
}

async function writeRecord(userId: string, layouts: readonly SavedWorkspaceLayout[]) {
  const target = pathFor(userId);
  await mkdir(join(root(), "workspace-layouts"), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  const record: WorkspaceLayoutRecord = Object.freeze({
    version: 1,
    updatedAt: new Date().toISOString(),
    layouts: sanitiseSavedWorkspaceLayouts(layouts),
  });
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
  return record;
}

export async function readWorkspaceLayouts(userId: string) {
  const target = pathFor(userId);
  try {
    const parsed = JSON.parse(await readFile(target, "utf8")) as {
      layouts?: unknown;
    };
    return sanitiseSavedWorkspaceLayouts(parsed.layouts);
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === "ENOENT") return Object.freeze([]);
    return Object.freeze([]);
  }
}

export async function saveWorkspaceLayout(
  userId: string,
  nameInput: unknown,
  settings: UserTerminalSettings,
) {
  const name = normaliseWorkspaceLayoutName(nameInput);
  return serial(userId, async () => {
    const layouts = [...(await readWorkspaceLayouts(userId))];
    const existingIndex = layouts.findIndex(
      (layout) => layout.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    const now = new Date().toISOString();
    const existing = existingIndex >= 0 ? layouts[existingIndex] : null;
    if (!existing && layouts.length >= MAX_WORKSPACE_LAYOUTS) {
      throw new Error(`A maximum of ${MAX_WORKSPACE_LAYOUTS} saved workspaces is supported.`);
    }
    const layout: SavedWorkspaceLayout = Object.freeze({
      version: WORKSPACE_LAYOUT_VERSION,
      id: existing?.id ?? `wsl1_${randomUUID()}`,
      name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      settings,
    });
    if (existingIndex >= 0) layouts.splice(existingIndex, 1, layout);
    else layouts.unshift(layout);
    await writeRecord(userId, layouts);
    return Object.freeze({ layout, created: !existing });
  });
}

export async function deleteWorkspaceLayout(userId: string, id: string) {
  if (!/^wsl1_[a-z0-9-]{8,80}$/i.test(id)) throw new Error("Invalid workspace identifier.");
  return serial(userId, async () => {
    const layouts = [...(await readWorkspaceLayouts(userId))];
    const next = layouts.filter((layout) => layout.id !== id);
    if (next.length === layouts.length) return false;
    await writeRecord(userId, next);
    return true;
  });
}

export async function findWorkspaceLayout(userId: string, id: string) {
  if (!/^wsl1_[a-z0-9-]{8,80}$/i.test(id)) return null;
  return (await readWorkspaceLayouts(userId)).find((layout) => layout.id === id) ?? null;
}
