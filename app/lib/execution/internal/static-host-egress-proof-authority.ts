import "server-only";

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { databaseSession, verifyAccountPassword, verifyFreshTotp } from "../../auth-db";
import { MEXC_WRITE_EGRESS_ATTESTATION } from "./write-credential-authority-store";
import { isPublicIpv4 } from "./render-egress-proof-authority";

export const STATIC_HOST_EGRESS_ATTESTATION = "static-execution-host-outbound-ip/v1" as const;
export const STATIC_HOST_EGRESS_OBSERVATION_ATTESTATION = "dual-https-egress-observation/v1" as const;
export const STATIC_HOST_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS = 60_000;
export const STATIC_HOST_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS = 10 * 60_000;

const VERSION = 1;
const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const HOST_ID = /^[A-Za-z0-9_.:@-]{1,120}$/;
const SESSION = /^[A-Za-z0-9_-]{43}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PROBES = ["https://api4.ipify.org", "https://checkip.amazonaws.com"] as const;

type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type StaticHostEgressIdentity = Readonly<{
  userId: string;
  accountId: string;
  writeCredentialGeneration: string;
}>;

export type OwnerStaticHostEgressProof = Readonly<{
  sessionToken: string;
  currentPassword: string;
  totp: string;
}>;

export type StaticHostRuntimeEvidence = Readonly<{
  provider: "static";
  hostId: string;
}>;

export type StaticHostEgressStatus = "unknown" | "declared" | "observed" | "allowlisted" | "revoked";

export type StaticHostEgressState = Readonly<{
  revision: number;
  allowlistRevision: number | null;
  status: StaticHostEgressStatus;
  hostId: string | null;
  dedicatedIpv4s: readonly string[];
  ipSetDigestSha256: string | null;
  observationCount: number;
  firstObservedIp: string | null;
  firstObservedAt: string | null;
  lastObservedIp: string | null;
  lastObservedAt: string | null;
  mexcAllowlistAttestation: typeof MEXC_WRITE_EGRESS_ATTESTATION | null;
  allowlistedAt: string | null;
  revokedAt: string | null;
  updatedAt: string | null;
}>;

type Stored = Readonly<{
  hostId: string;
  ip: string;
  digest: string;
  count: number;
  firstIp: string | null;
  firstAt: string | null;
  lastIp: string | null;
  lastAt: string | null;
  mexcAllowlisted: boolean;
  allowlistedAt: string | null;
  revokedAt: string | null;
}>;

type Mutation = Readonly<StaticHostEgressIdentity & {
  expectedRevision: number;
  ownerProof: OwnerStaticHostEgressProof;
}>;

type FileIdentity = Readonly<{ dev: number; ino: number }>;

export class ExecutionStaticHostEgressProofError extends Error {
  constructor(readonly code: "EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE" | "EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID" | "EXECUTION_STATIC_HOST_EGRESS_PROOF_CONFLICT") {
    super(code);
    this.name = "ExecutionStaticHostEgressProofError";
  }
}

function fail(code: ExecutionStaticHostEgressProofError["code"]): never {
  throw new ExecutionStaticHostEgressProofError(code);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
}

function validIdentity(identity: StaticHostEgressIdentity) {
  return ID.test(identity.userId) && ID.test(identity.accountId) && ID.test(identity.writeCredentialGeneration);
}

function validMutation(request: Mutation) {
  return validIdentity(request) && Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 0;
}

function mutationIdentity(request: Mutation): StaticHostEgressIdentity {
  return Object.freeze({
    userId: request.userId,
    accountId: request.accountId,
    writeCredentialGeneration: request.writeCredentialGeneration,
  });
}

export function staticHostIpSetDigestSha256(ip: string) {
  return isPublicIpv4(ip) ? createHash("sha256").update(ip).digest("hex") : null;
}

function validateStored(value: unknown): Stored {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
  const record = value as Record<string, unknown>;
  const hostId = String(record.hostId ?? "");
  const ip = String(record.ip ?? "");
  const digest = String(record.digest ?? "");
  const count = Number(record.count);
  const firstIp = record.firstIp === null ? null : String(record.firstIp);
  const firstAt = record.firstAt === null ? null : String(record.firstAt);
  const lastIp = record.lastIp === null ? null : String(record.lastIp);
  const lastAt = record.lastAt === null ? null : String(record.lastAt);
  const allowlistedAt = record.allowlistedAt === null ? null : String(record.allowlistedAt);
  const revokedAt = record.revokedAt === null ? null : String(record.revokedAt);
  if (
    !HOST_ID.test(hostId)
    || !isPublicIpv4(ip)
    || !SHA256.test(digest)
    || staticHostIpSetDigestSha256(ip) !== digest
    || !Number.isSafeInteger(count)
    || count < 0
    || (firstIp !== null && firstIp !== ip)
    || (lastIp !== null && lastIp !== ip)
    || (firstAt !== null && !timestamp(firstAt))
    || (lastAt !== null && !timestamp(lastAt))
    || typeof record.mexcAllowlisted !== "boolean"
    || (allowlistedAt !== null && !timestamp(allowlistedAt))
    || (revokedAt !== null && !timestamp(revokedAt))
  ) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
  const observed = count > 0;
  if ((observed && (!firstIp || !firstAt || !lastIp || !lastAt)) || (!observed && (firstIp || firstAt || lastIp || lastAt))) {
    return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
  }
  if (record.mexcAllowlisted === true && (count < 2 || allowlistedAt === null)) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
  return Object.freeze({ hostId, ip, digest, count, firstIp, firstAt, lastIp, lastAt, mexcAllowlisted: record.mexcAllowlisted, allowlistedAt, revokedAt });
}

async function verifyOwner(userId: string, proof: OwnerStaticHostEgressProof, now: Date) {
  if (!ID.test(userId) || !SESSION.test(proof.sessionToken) || proof.currentPassword.length < 1 || proof.currentPassword.length > 128 || !/^\d{6}$/.test(proof.totp) || !Number.isFinite(now.getTime())) return false;
  const first = databaseSession(proof.sessionToken);
  if (!first || first.id !== userId || first.role !== "owner" || !await verifyAccountPassword(first.id, proof.currentPassword)) return false;
  const second = databaseSession(proof.sessionToken);
  if (!second || second.id !== userId || second.role !== "owner" || !verifyFreshTotp(second.id, proof.totp, now.getTime())) return false;
  const final = databaseSession(proof.sessionToken);
  return Boolean(final && final.id === userId && final.role === "owner");
}

export function staticHostRuntimeEvidenceFromEnvironment(env: Readonly<Record<string, string | undefined>> = process.env): StaticHostRuntimeEvidence | null {
  const hostId = env.EXECUTION_HOST_ID?.trim() ?? "";
  if (env.EXECUTION_HOST_PROVIDER !== "static" || !HOST_ID.test(hostId)) return null;
  return Object.freeze({ provider: "static" as const, hostId });
}

async function probe(fetchImpl: FetchLike, url: string) {
  try {
    const response = await fetchImpl(url, { method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (!response.ok || response.status !== 200) return null;
    const body = (await response.text()).trim();
    return body.length <= 64 && isPublicIpv4(body) ? body : null;
  } catch {
    return null;
  }
}

export async function probeProductionStaticHostEgressIpv4(fetchImpl: FetchLike = fetch as unknown as FetchLike) {
  const first = await probe(fetchImpl, PROBES[0]);
  if (!first) return null;
  const second = await probe(fetchImpl, PROBES[1]);
  return second === first ? first : null;
}

export class SqliteStaticHostEgressProofStore {
  private database: DatabaseSync | null = null;
  private fileIdentity: FileIdentity | null = null;
  private poisoned = false;

  constructor(private readonly path = join(process.env.DATA_DIR || join(process.cwd(), ".data"), "execution-static-host-egress-proof.sqlite")) {}

  private harden() {
    if (this.path === ":memory:") return;
    for (const path of [this.path, `${this.path}-wal`, `${this.path}-shm`]) if (existsSync(path)) chmodSync(path, 0o600);
  }

  private currentFileIdentity() {
    try {
      const stat = statSync(this.path);
      return { dev: stat.dev, ino: stat.ino };
    } catch {
      return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE");
    }
  }

  private assertBacking() {
    if (this.poisoned) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE");
    if (this.path === ":memory:") return;
    const current = this.currentFileIdentity();
    if (!this.fileIdentity || current.dev !== this.fileIdentity.dev || current.ino !== this.fileIdentity.ino) {
      this.poisoned = true;
      this.close();
      return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE");
    }
  }

  private db() {
    if (this.poisoned) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE");
    if (this.database) {
      this.assertBacking();
      return this.database;
    }
    let database: DatabaseSync | null = null;
    try {
      if (this.path !== ":memory:") mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      database = new DatabaseSync(this.path);
      database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      const version = Number((database.prepare("PRAGMA user_version").get() as { user_version: number | bigint }).user_version);
      if (version !== 0 && version !== VERSION) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
      if (version === 0) database.exec(`BEGIN IMMEDIATE;
        CREATE TABLE static_host_egress_proof(schema_version INTEGER NOT NULL CHECK(schema_version=1),user_id TEXT NOT NULL,account_id TEXT NOT NULL,
          write_generation TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),status TEXT NOT NULL CHECK(status IN ('declared','observed','allowlisted','revoked')),
          payload_json TEXT NOT NULL CHECK(length(payload_json)<=4096),updated_at TEXT NOT NULL CHECK(length(updated_at)<=64),PRIMARY KEY(user_id,account_id,write_generation));
        CREATE TABLE static_host_egress_proof_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,account_id TEXT NOT NULL,write_generation TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK(revision>=1),kind TEXT NOT NULL CHECK(kind IN ('declared','observed','allowlisted','revoked')),occurred_at TEXT NOT NULL CHECK(length(occurred_at)<=64));
        PRAGMA user_version=1; COMMIT;`);
      this.database = database;
      this.harden();
      if (this.path !== ":memory:") this.fileIdentity = this.currentFileIdentity();
      return database;
    } catch (error) {
      try { database?.close(); } catch {}
      this.database = null;
      this.fileIdentity = null;
      if (error instanceof ExecutionStaticHostEgressProofError) throw error;
      return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE");
    }
  }

  private row(identity: StaticHostEgressIdentity) {
    return this.db().prepare("SELECT revision,status,payload_json,updated_at FROM static_host_egress_proof WHERE user_id=? AND account_id=? AND write_generation=?")
      .get(identity.userId, identity.accountId, identity.writeCredentialGeneration) as { revision: number; status: string; payload_json: string; updated_at: string } | undefined;
  }

  private allowlistRevision(identity: StaticHostEgressIdentity, stored: Stored, revision: number) {
    const rows = this.db().prepare("SELECT revision,occurred_at FROM static_host_egress_proof_events WHERE user_id=? AND account_id=? AND write_generation=? AND kind='allowlisted' ORDER BY sequence")
      .all(identity.userId, identity.accountId, identity.writeCredentialGeneration) as Array<{ revision: number | bigint; occurred_at: string }>;
    if (!stored.mexcAllowlisted) {
      if (rows.length !== 0) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
      return null;
    }
    if (rows.length !== 1 || !stored.allowlistedAt) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
    const eventRevision = Number(rows[0].revision);
    if (!Number.isSafeInteger(eventRevision) || eventRevision < 1 || eventRevision > revision || !timestamp(rows[0].occurred_at) || rows[0].occurred_at !== stored.allowlistedAt) {
      return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
    }
    return eventRevision;
  }

  read(identity: StaticHostEgressIdentity): StaticHostEgressState {
    if (!validIdentity(identity)) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
    try {
      const row = this.row(identity);
      if (!row) return Object.freeze({ revision: 0, allowlistRevision: null, status: "unknown" as const, hostId: null, dedicatedIpv4s: Object.freeze([]), ipSetDigestSha256: null, observationCount: 0, firstObservedIp: null, firstObservedAt: null, lastObservedIp: null, lastObservedAt: null, mexcAllowlistAttestation: null, allowlistedAt: null, revokedAt: null, updatedAt: null });
      if (!Number.isSafeInteger(Number(row.revision)) || Number(row.revision) < 1 || !["declared", "observed", "allowlisted", "revoked"].includes(row.status) || !timestamp(row.updated_at) || row.payload_json.length > 4096) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
      let parsed: unknown;
      try { parsed = JSON.parse(row.payload_json); } catch { return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID"); }
      const stored = validateStored(parsed);
      const status: StaticHostEgressStatus = stored.revokedAt ? "revoked" : stored.mexcAllowlisted ? "allowlisted" : stored.count > 0 ? "observed" : "declared";
      if (status !== row.status) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
      const revision = Number(row.revision);
      const allowlistRevision = this.allowlistRevision(identity, stored, revision);
      this.assertBacking();
      return Object.freeze({ revision, allowlistRevision, status, hostId: stored.hostId, dedicatedIpv4s: Object.freeze([stored.ip]), ipSetDigestSha256: stored.digest, observationCount: stored.count, firstObservedIp: stored.firstIp, firstObservedAt: stored.firstAt, lastObservedIp: stored.lastIp, lastObservedAt: stored.lastAt, mexcAllowlistAttestation: stored.mexcAllowlisted ? MEXC_WRITE_EGRESS_ATTESTATION : null, allowlistedAt: stored.allowlistedAt, revokedAt: stored.revokedAt, updatedAt: row.updated_at });
    } catch (error) {
      if (error instanceof ExecutionStaticHostEgressProofError) throw error;
      return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE");
    }
  }

  private mutate(identity: StaticHostEgressIdentity, expectedRevision: number, kind: "declared" | "observed" | "allowlisted" | "revoked", at: string, build: (stored: Stored | null) => Stored) {
    if (!validIdentity(identity) || !timestamp(at) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
    const database = this.db();
    try {
      database.exec("BEGIN IMMEDIATE");
      const row = this.row(identity);
      const current = row ? validateStored(JSON.parse(row.payload_json)) : null;
      const revision = row ? Number(row.revision) : 0;
      if (revision !== expectedRevision || (row && Date.parse(at) < Date.parse(row.updated_at))) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_CONFLICT");
      const next = build(current);
      const nextRevision = expectedRevision + 1;
      const status = next.revokedAt ? "revoked" : next.mexcAllowlisted ? "allowlisted" : next.count > 0 ? "observed" : "declared";
      const payload = JSON.stringify(next);
      if (payload.length > 4096) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
      const changes = row
        ? Number(database.prepare("UPDATE static_host_egress_proof SET revision=?,status=?,payload_json=?,updated_at=? WHERE user_id=? AND account_id=? AND write_generation=? AND revision=?").run(nextRevision, status, payload, at, identity.userId, identity.accountId, identity.writeCredentialGeneration, expectedRevision).changes)
        : Number(database.prepare("INSERT INTO static_host_egress_proof(schema_version,user_id,account_id,write_generation,revision,status,payload_json,updated_at) VALUES(1,?,?,?,?,?,?,?)").run(identity.userId, identity.accountId, identity.writeCredentialGeneration, nextRevision, status, payload, at).changes);
      if (changes !== 1) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_CONFLICT");
      database.prepare("INSERT INTO static_host_egress_proof_events(user_id,account_id,write_generation,revision,kind,occurred_at) VALUES(?,?,?,?,?,?)").run(identity.userId, identity.accountId, identity.writeCredentialGeneration, nextRevision, kind, at);
      database.exec("COMMIT");
      this.harden();
      this.assertBacking();
      return this.read(identity);
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      if (error instanceof ExecutionStaticHostEgressProofError) throw error;
      return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE");
    }
  }

  declare(identity: StaticHostEgressIdentity, hostId: string, ip: string, at: string, expectedRevision = 0) {
    const digest = staticHostIpSetDigestSha256(ip);
    if (!HOST_ID.test(hostId) || !digest || expectedRevision !== 0) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
    return this.mutate(identity, expectedRevision, "declared", at, current => {
      if (current) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_CONFLICT");
      return Object.freeze({ hostId, ip, digest, count: 0, firstIp: null, firstAt: null, lastIp: null, lastAt: null, mexcAllowlisted: false, allowlistedAt: null, revokedAt: null });
    });
  }

  observe(identity: StaticHostEgressIdentity, hostId: string, ip: string, at: string, expectedRevision: number) {
    if (!HOST_ID.test(hostId) || !isPublicIpv4(ip)) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
    return this.mutate(identity, expectedRevision, "observed", at, current => {
      if (!current || current.revokedAt || current.hostId !== hostId || current.ip !== ip) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_CONFLICT");
      if (current.lastAt && Date.parse(at) - Date.parse(current.lastAt) < STATIC_HOST_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_CONFLICT");
      return Object.freeze({ ...current, count: current.count + 1, firstIp: current.firstIp ?? ip, firstAt: current.firstAt ?? at, lastIp: ip, lastAt: at });
    });
  }

  allowlist(identity: StaticHostEgressIdentity, digest: string, at: string, expectedRevision: number) {
    if (!SHA256.test(digest)) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_INVALID");
    return this.mutate(identity, expectedRevision, "allowlisted", at, current => {
      if (!current || current.revokedAt || current.mexcAllowlisted || current.count < 2 || current.digest !== digest) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_CONFLICT");
      return Object.freeze({ ...current, mexcAllowlisted: true, allowlistedAt: at });
    });
  }

  revoke(identity: StaticHostEgressIdentity, at: string, expectedRevision: number) {
    return this.mutate(identity, expectedRevision, "revoked", at, current => {
      if (!current || current.revokedAt) return fail("EXECUTION_STATIC_HOST_EGRESS_PROOF_CONFLICT");
      return Object.freeze({ ...current, revokedAt: at });
    });
  }

  close() {
    try { this.database?.close(); } finally { this.database = null; this.fileIdentity = null; }
  }
}

export async function declareStaticHostEgress(store: SqliteStaticHostEgressProofStore, request: Mutation & Readonly<{ hostId: string; dedicatedIpv4: string; staticHostAttestation: typeof STATIC_HOST_EGRESS_ATTESTATION }>, now = new Date()) {
  if (!validMutation(request) || request.expectedRevision !== 0 || request.staticHostAttestation !== STATIC_HOST_EGRESS_ATTESTATION || !await verifyOwner(request.userId, request.ownerProof, now)) return null;
  return store.declare(mutationIdentity(request), request.hostId, request.dedicatedIpv4, now.toISOString(), 0);
}

export async function observeStaticHostEgress(store: SqliteStaticHostEgressProofStore, request: Mutation, runtime: StaticHostRuntimeEvidence, observedIp: string, now = new Date()) {
  if (!validMutation(request) || request.expectedRevision < 1 || runtime.provider !== "static" || !HOST_ID.test(runtime.hostId) || !isPublicIpv4(observedIp) || !await verifyOwner(request.userId, request.ownerProof, now)) return null;
  const current = store.read(mutationIdentity(request));
  if (current.revision !== request.expectedRevision || current.hostId !== runtime.hostId) return null;
  return store.observe(mutationIdentity(request), runtime.hostId, observedIp, now.toISOString(), request.expectedRevision);
}

export async function attestStaticHostMexcEgressAllowlisted(store: SqliteStaticHostEgressProofStore, request: Mutation & Readonly<{ ipSetDigestSha256: string; mexcAllowlistAttestation: typeof MEXC_WRITE_EGRESS_ATTESTATION }>, now = new Date()) {
  if (!validMutation(request) || request.expectedRevision < 1 || !SHA256.test(request.ipSetDigestSha256) || request.mexcAllowlistAttestation !== MEXC_WRITE_EGRESS_ATTESTATION || !await verifyOwner(request.userId, request.ownerProof, now)) return null;
  const state = store.read(mutationIdentity(request));
  const age = state.lastObservedAt ? now.getTime() - Date.parse(state.lastObservedAt) : Number.NaN;
  if (state.revision !== request.expectedRevision || state.status !== "observed" || state.observationCount < 2 || state.ipSetDigestSha256 !== request.ipSetDigestSha256 || !Number.isFinite(age) || age < 0 || age > STATIC_HOST_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS) return null;
  return store.allowlist(mutationIdentity(request), request.ipSetDigestSha256, now.toISOString(), request.expectedRevision);
}

export function currentStaticHostMatches(state: StaticHostEgressState, runtime: StaticHostRuntimeEvidence, observedIp: string, now: Date) {
  if (!Number.isFinite(now.getTime()) || runtime.provider !== "static" || !HOST_ID.test(runtime.hostId) || !isPublicIpv4(observedIp)) return false;
  if (state.status !== "allowlisted" || state.mexcAllowlistAttestation !== MEXC_WRITE_EGRESS_ATTESTATION || state.hostId !== runtime.hostId || state.dedicatedIpv4s.length !== 1 || state.dedicatedIpv4s[0] !== observedIp || !state.ipSetDigestSha256 || !SHA256.test(state.ipSetDigestSha256) || !state.allowlistedAt || !state.lastObservedAt) return false;
  const observedAt = Date.parse(state.lastObservedAt);
  const allowlistedAt = Date.parse(state.allowlistedAt);
  const nowMs = now.getTime();
  return Number.isFinite(observedAt) && Number.isFinite(allowlistedAt) && observedAt <= nowMs && allowlistedAt <= nowMs && nowMs - observedAt <= STATIC_HOST_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS;
}
