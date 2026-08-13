import "server-only";

import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ExecutionKillSwitches } from "./kill-switch";

const DATABASE_VERSION = 1;
export const EXECUTION_CONTROL_VERSION = "execution-control/1.0.0" as const;
const MAX_DOCUMENT_BYTES = 32_768;
const MAX_IDENTITIES = 1_000;
const IDENTITY = /^[A-Za-z0-9_:@.-]{1,120}$/;
type FileIdentity = Readonly<{ dev: number; ino: number }>;

export type ExecutionControlDocument = Readonly<{
  schemaVersion: typeof EXECUTION_CONTROL_VERSION;
  revision: number;
  armed: boolean;
  globalDisabled: boolean;
  disabledUserIds: readonly string[];
  disabledAccountKeys: readonly string[];
  maintenance: boolean;
  emergencyStop: boolean;
  providerObservedAt: string | null;
  providerValidForMs: number;
  updatedAt: string;
}>;

export class ExecutionControlStoreError extends Error {
  constructor(readonly code: "EXECUTION_CONTROL_UNAVAILABLE" | "EXECUTION_CONTROL_INVALID" | "EXECUTION_CONTROL_CONFLICT") {
    super("EXECUTION_CONTROL_STORE_FAILURE");
    this.name = "ExecutionControlStoreError";
  }
}

const unavailable = (): never => { throw new ExecutionControlStoreError("EXECUTION_CONTROL_UNAVAILABLE"); };
const invalid = (): never => { throw new ExecutionControlStoreError("EXECUTION_CONTROL_INVALID"); };

const validDate = (value: unknown) => typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
export function validateExecutionControlDocument(value: unknown): ExecutionControlDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  const keys = ["schemaVersion", "revision", "armed", "globalDisabled", "disabledUserIds", "disabledAccountKeys", "maintenance", "emergencyStop", "providerObservedAt", "providerValidForMs", "updatedAt"];
  if (Object.keys(row).length !== keys.length || Object.keys(row).some((key) => !keys.includes(key))) invalid();
  const identitiesValid = (candidate: unknown) => Array.isArray(candidate) && candidate.length <= MAX_IDENTITIES
    && candidate.every((entry) => typeof entry === "string" && IDENTITY.test(entry))
    && new Set(candidate).size === candidate.length;
  const accountKeysValid = (candidate: unknown) => Array.isArray(candidate) && candidate.length <= MAX_IDENTITIES
    && candidate.every((entry) => {
      if (typeof entry !== "string") return false;
      try {
        const pair: unknown = JSON.parse(entry);
        return Array.isArray(pair) && pair.length === 2 && pair.every((part) => typeof part === "string" && IDENTITY.test(part))
          && JSON.stringify(pair) === entry;
      } catch { return false; }
    }) && new Set(candidate).size === candidate.length;
  if (row.schemaVersion !== EXECUTION_CONTROL_VERSION || !Number.isSafeInteger(row.revision) || (row.revision as number) < 1
    || typeof row.armed !== "boolean" || typeof row.globalDisabled !== "boolean"
    || !identitiesValid(row.disabledUserIds) || !accountKeysValid(row.disabledAccountKeys)
    || typeof row.maintenance !== "boolean" || typeof row.emergencyStop !== "boolean"
    || (row.providerObservedAt !== null && !validDate(row.providerObservedAt))
    || !Number.isSafeInteger(row.providerValidForMs) || (row.providerValidForMs as number) < 1 || (row.providerValidForMs as number) > 86_400_000
    || !validDate(row.updatedAt)) invalid();
  if (Buffer.byteLength(JSON.stringify(row), "utf8") > MAX_DOCUMENT_BYTES) invalid();
  return Object.freeze({ ...(row as ExecutionControlDocument), disabledUserIds: Object.freeze([...(row.disabledUserIds as string[])]), disabledAccountKeys: Object.freeze([...(row.disabledAccountKeys as string[])]) });
}

export const failClosedExecutionControl = (now = new Date()): ExecutionControlDocument => Object.freeze({
  schemaVersion: EXECUTION_CONTROL_VERSION, revision: 1, armed: false, globalDisabled: true,
  disabledUserIds: Object.freeze([]), disabledAccountKeys: Object.freeze([]), maintenance: false,
  emergencyStop: false, providerObservedAt: null, providerValidForMs: 60_000, updatedAt: now.toISOString(),
});

export interface ExecutionControlStore {
  read(): ExecutionControlDocument;
  replace(expectedRevision: number, next: Omit<ExecutionControlDocument, "schemaVersion" | "revision" | "updatedAt">, now?: Date): ExecutionControlDocument;
  switches(now?: Date): ExecutionKillSwitches;
}

export function executionControlDatabasePath() {
  return join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-control.sqlite");
}

export class SqliteExecutionControlStore implements ExecutionControlStore {
  private database: DatabaseSync | null = null;
  private fileIdentity: FileIdentity | null = null;
  constructor(private readonly path = executionControlDatabasePath(), private readonly clock: () => Date = () => new Date()) {}
  private harden() { if (this.path !== ":memory:") for (const file of [this.path, `${this.path}-wal`, `${this.path}-shm`]) if (existsSync(file)) chmodSync(file, 0o600); }
  private currentFileIdentity(): FileIdentity {
    try {
      const { dev, ino } = statSync(this.path);
      return { dev, ino };
    } catch { return unavailable(); }
  }
  private discardDatabase() {
    try { this.database?.close(); } catch {}
    this.database = null;
    this.fileIdentity = null;
  }
  private assertBackingFile() {
    if (this.path === ":memory:") return;
    const current = this.currentFileIdentity();
    if (!this.fileIdentity || current.dev !== this.fileIdentity.dev || current.ino !== this.fileIdentity.ino) {
      this.discardDatabase();
      unavailable();
    }
  }
  private db(): DatabaseSync {
    if (this.database) { this.assertBackingFile(); return this.database; }
    let db: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      db = new DatabaseSync(this.path);
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
      if (version !== 0 && version !== DATABASE_VERSION) invalid();
      if (version === 0) {
        const initial = JSON.stringify(failClosedExecutionControl(this.clock()));
        db.exec(`BEGIN IMMEDIATE; CREATE TABLE execution_control (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL CHECK(revision > 0), document TEXT NOT NULL CHECK(length(document) BETWEEN 2 AND ${MAX_DOCUMENT_BYTES}));`);
        db.prepare("INSERT INTO execution_control(singleton,revision,document) VALUES(1,1,?)").run(initial);
        db.exec(`PRAGMA user_version=${DATABASE_VERSION}; COMMIT;`);
      }
      this.database = db; this.harden();
      if (this.path !== ":memory:") this.fileIdentity = this.currentFileIdentity();
      this.read(); return db;
    } catch (error) { try { db?.close(); } catch {} this.database = null; this.fileIdentity = null; if (error instanceof ExecutionControlStoreError) throw error; return unavailable(); }
  }
  read(): ExecutionControlDocument {
    try {
      const row = this.db().prepare("SELECT revision,document FROM execution_control WHERE singleton=1").get() as { revision: number; document: string } | undefined;
      if (!row || typeof row.document !== "string" || Buffer.byteLength(row.document, "utf8") > MAX_DOCUMENT_BYTES) invalid();
      const validRow = row as { revision: number; document: string };
      let parsed: unknown; try { parsed = JSON.parse(validRow.document); } catch { return invalid(); }
      const document = validateExecutionControlDocument(parsed);
      if (document.revision !== validRow.revision) invalid();
      this.assertBackingFile();
      return document;
    } catch (error) { if (error instanceof ExecutionControlStoreError) throw error; return unavailable(); }
  }
  replace(expectedRevision: number, next: Omit<ExecutionControlDocument, "schemaVersion" | "revision" | "updatedAt">, now = this.clock()): ExecutionControlDocument {
    const candidate = validateExecutionControlDocument({ ...next, schemaVersion: EXECUTION_CONTROL_VERSION, revision: expectedRevision + 1, updatedAt: now.toISOString() });
    try {
      const result = this.db().prepare("UPDATE execution_control SET revision=?,document=? WHERE singleton=1 AND revision=?").run(candidate.revision, JSON.stringify(candidate), expectedRevision);
      if (result.changes !== 1) throw new ExecutionControlStoreError("EXECUTION_CONTROL_CONFLICT");
      // A pathname can be atomically replaced while SQLite continues writing to
      // the unlinked file behind its cached descriptor. Never acknowledge such
      // an update: verify the generation both immediately after the write and
      // after hardening the path.
      this.assertBackingFile();
      this.harden();
      this.assertBackingFile();
      return candidate;
    } catch (error) { if (error instanceof ExecutionControlStoreError) throw error; return unavailable(); }
  }
  switches(now = this.clock()): ExecutionKillSwitches {
    const state = this.read();
    const observed = state.providerObservedAt === null ? Number.NaN : Date.parse(state.providerObservedAt);
    const age = now.getTime() - observed;
    return Object.freeze({ armed: state.armed, globalDisabled: state.globalDisabled,
      disabledUserIds: new Set(state.disabledUserIds), disabledAccountKeys: new Set(state.disabledAccountKeys),
      maintenance: state.maintenance, emergencyStop: state.emergencyStop,
      providerStateFresh: Number.isFinite(age) && age >= 0 && age <= state.providerValidForMs });
  }
}

export const createProductionExecutionControlStore = () => new SqliteExecutionControlStore();
