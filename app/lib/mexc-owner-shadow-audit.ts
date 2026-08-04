import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { safeOwnerId } from "./security-boundaries";

export const MEXC_OWNER_SHADOW_AUDIT_SCHEMA_VERSION =
  "mexc-owner-shadow-audit/1.0.0" as const;

export type MexcOwnerShadowAuditKind =
  | "account-reconciliation"
  | "hypothetical-order-preview"
  | "connection-control";

export type MexcOwnerShadowAuditEntry = Readonly<{
  schemaVersion: typeof MEXC_OWNER_SHADOW_AUDIT_SCHEMA_VERSION;
  sequence: number;
  eventId: string;
  ownerDigest: string;
  recordedAtMs: number;
  kind: MexcOwnerShadowAuditKind;
  sourcePolicyVersion: string;
  previousDigest: string | null;
  payload: Readonly<Record<string, unknown>>;
  digest: string;
}>;

export class MexcOwnerShadowAuditIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MexcOwnerShadowAuditIntegrityError";
  }
}

type Options = Readonly<{
  rootDir?: string;
  now?: () => number;
  eventId?: () => string;
}>;

const MAX_LEDGER_BYTES = 25 * 1024 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;
const digestPattern = /^[a-f0-9]{64}$/;
const eventIdPattern = /^[a-zA-Z0-9_-]{8,120}$/;
const forbiddenKeyPattern = /(?:api.?key|secret|signature|authorization|credential|cookie|token|headers?|raw(?:body|request|response)?)/i;
const forbiddenValuePattern = /(?:OWNER_MEXC_READONLY_API_|authorization\s*:|api[_-]?secret|api[_-]?key)/i;
const queues = new Map<string, Promise<unknown>>();

function root(options: Options) {
  return options.rootDir ?? process.env.DATA_DIR ?? join(process.cwd(), ".data");
}

function ledgerDirectory(options: Options) {
  return join(root(options), "mexc-owner-shadow-audit");
}

function ledgerPath(userId: string, options: Options) {
  return join(
    ledgerDirectory(options),
    `${safeOwnerId(userId, "MEXC shadow audit owner")}.ndjson`,
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function ownerDigest(userId: string) {
  return sha256(`mexc-owner-shadow-audit:${safeOwnerId(userId)}`);
}

function normaliseJson(value: unknown, path = "payload"): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} contains a non-finite number.`);
    }
    return value;
  }
  if (typeof value === "string") {
    if (value.length > 20_000) throw new TypeError(`${path} contains an oversized string.`);
    if (forbiddenValuePattern.test(value)) {
      throw new TypeError(`${path} appears to contain credential material.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 10_000) throw new TypeError(`${path} contains an oversized array.`);
    return Object.freeze(value.map((item, index) => normaliseJson(item, `${path}[${index}]`)));
  }
  if (!value || typeof value !== "object") {
    throw new TypeError(`${path} is not JSON-safe.`);
  }
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(key)) {
      throw new TypeError(`${path} contains an invalid field name.`);
    }
    if (forbiddenKeyPattern.test(key)) {
      throw new TypeError(`${path}.${key} is forbidden in the shadow audit ledger.`);
    }
    const child = record[key];
    if (child === undefined) continue;
    output[key] = normaliseJson(child, `${path}.${key}`);
  }
  return Object.freeze(output);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function digestable(entry: Omit<MexcOwnerShadowAuditEntry, "digest">) {
  return canonicalJson(entry);
}

function validateEntry(
  value: unknown,
  expectedSequence: number,
  expectedPreviousDigest: string | null,
  expectedOwnerDigest: string,
): MexcOwnerShadowAuditEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit entry must be an object.");
  }
  const entry = value as MexcOwnerShadowAuditEntry;
  if (entry.schemaVersion !== MEXC_OWNER_SHADOW_AUDIT_SCHEMA_VERSION) {
    throw new MexcOwnerShadowAuditIntegrityError("Unsupported shadow audit schema version.");
  }
  if (entry.sequence !== expectedSequence) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit sequence is discontinuous.");
  }
  if (entry.previousDigest !== expectedPreviousDigest) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit previous digest does not match.");
  }
  if (entry.ownerDigest !== expectedOwnerDigest) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit owner digest does not match.");
  }
  if (!eventIdPattern.test(entry.eventId)) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit event id is invalid.");
  }
  if (!Number.isSafeInteger(entry.recordedAtMs) || entry.recordedAtMs < 0) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit timestamp is invalid.");
  }
  if (
    entry.kind !== "account-reconciliation" &&
    entry.kind !== "hypothetical-order-preview" &&
    entry.kind !== "connection-control"
  ) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit event kind is invalid.");
  }
  if (typeof entry.sourcePolicyVersion !== "string" || entry.sourcePolicyVersion.length < 1 || entry.sourcePolicyVersion.length > 160) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit source policy version is invalid.");
  }
  if (!digestPattern.test(entry.digest)) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit digest is invalid.");
  }
  let payload: Readonly<Record<string, unknown>>;
  try {
    payload = normaliseJson(entry.payload) as Readonly<Record<string, unknown>>;
  } catch (error) {
    throw new MexcOwnerShadowAuditIntegrityError(
      error instanceof Error ? error.message : "Shadow audit payload is invalid.",
    );
  }
  const candidate = Object.freeze({
    schemaVersion: entry.schemaVersion,
    sequence: entry.sequence,
    eventId: entry.eventId,
    ownerDigest: entry.ownerDigest,
    recordedAtMs: entry.recordedAtMs,
    kind: entry.kind,
    sourcePolicyVersion: entry.sourcePolicyVersion,
    previousDigest: entry.previousDigest,
    payload,
  });
  if (sha256(digestable(candidate)) !== entry.digest) {
    throw new MexcOwnerShadowAuditIntegrityError("Shadow audit entry digest does not verify.");
  }
  return Object.freeze({ ...candidate, digest: entry.digest });
}

export async function readOwnerMexcShadowAudit(
  userId: string,
  options: Options = {},
): Promise<readonly MexcOwnerShadowAuditEntry[]> {
  let source: string;
  try {
    source = await readFile(ledgerPath(userId, options), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return Object.freeze([]);
    throw error;
  }
  const lines = source.split("\n").filter((line) => line.length > 0);
  const entries: MexcOwnerShadowAuditEntry[] = [];
  let previousDigest: string | null = null;
  const expectedOwnerDigest = ownerDigest(userId);
  for (const [index, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new MexcOwnerShadowAuditIntegrityError("Shadow audit ledger contains invalid JSON.");
    }
    const entry = validateEntry(parsed, index + 1, previousDigest, expectedOwnerDigest);
    entries.push(entry);
    previousDigest = entry.digest;
  }
  return Object.freeze(entries);
}

async function serial<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const owner = safeOwnerId(userId, "MEXC shadow audit owner");
  const previous = queues.get(owner) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const current = previous.then(() => gate);
  queues.set(owner, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(owner) === current) queues.delete(owner);
  }
}

export async function appendOwnerMexcShadowAudit(
  userId: string,
  input: Readonly<{
    kind: MexcOwnerShadowAuditKind;
    sourcePolicyVersion: string;
    payload: Readonly<Record<string, unknown>>;
  }>,
  options: Options = {},
): Promise<MexcOwnerShadowAuditEntry> {
  return serial(userId, async () => {
    if (typeof input.sourcePolicyVersion !== "string" || input.sourcePolicyVersion.length < 1 || input.sourcePolicyVersion.length > 160) {
      throw new TypeError("Shadow audit source policy version is invalid.");
    }
    const payload = normaliseJson(input.payload) as Readonly<Record<string, unknown>>;
    const existing = await readOwnerMexcShadowAudit(userId, options);
    const previousDigest = existing.at(-1)?.digest ?? null;
    const recordedAtMs = (options.now ?? Date.now)();
    if (!Number.isSafeInteger(recordedAtMs) || recordedAtMs < 0) {
      throw new TypeError("Shadow audit timestamp is invalid.");
    }
    const eventId = (options.eventId ?? (() => randomUUID().replaceAll("-", "")))();
    if (!eventIdPattern.test(eventId)) throw new TypeError("Shadow audit event id is invalid.");
    const candidate = Object.freeze({
      schemaVersion: MEXC_OWNER_SHADOW_AUDIT_SCHEMA_VERSION,
      sequence: existing.length + 1,
      eventId,
      ownerDigest: ownerDigest(userId),
      recordedAtMs,
      kind: input.kind,
      sourcePolicyVersion: input.sourcePolicyVersion,
      previousDigest,
      payload,
    });
    const entry = Object.freeze({
      ...candidate,
      digest: sha256(digestable(candidate)),
    });
    const line = `${JSON.stringify(entry)}\n`;
    if (Buffer.byteLength(line, "utf8") > MAX_EVENT_BYTES) {
      throw new TypeError("Shadow audit event exceeds the bounded event size.");
    }
    const directory = ledgerDirectory(options);
    const target = ledgerPath(userId, options);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      const current = await stat(target);
      if (current.size + Buffer.byteLength(line, "utf8") > MAX_LEDGER_BYTES) {
        throw new TypeError("Shadow audit ledger reached its bounded size limit.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await appendFile(target, line, { encoding: "utf8", mode: 0o600, flag: "a" });
    return entry;
  });
}
