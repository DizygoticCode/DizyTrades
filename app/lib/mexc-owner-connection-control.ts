import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  appendOwnerMexcShadowAudit,
  type MexcOwnerShadowAuditEntry,
} from "./mexc-owner-shadow-audit";

export const MEXC_OWNER_CONNECTION_CONTROL_SCHEMA_VERSION =
  "mexc-owner-connection-control/1.0.0" as const;
export const MEXC_OWNER_SHUTDOWN_CONFIRMATION =
  "SHUT DOWN MEXC READS" as const;

export type MexcOwnerConnectionControlState = "active" | "sealed";
export type MexcOwnerConnectionControlReason =
  | "initial-active"
  | "owner-emergency-shutdown"
  | "control-integrity-failed";

export type MexcOwnerConnectionControlReport = Readonly<{
  schemaVersion: typeof MEXC_OWNER_CONNECTION_CONTROL_SCHEMA_VERSION;
  state: MexcOwnerConnectionControlState;
  generation: number;
  updatedAtMs: number | null;
  reason: MexcOwnerConnectionControlReason;
  integrity: "verified" | "missing-default" | "failed";
  localPrivateReadsBlocked: boolean;
  privateConfigurationPresent: boolean;
  credentialPairPresent: boolean;
  permissionAttestationPresent: boolean;
  companionEnabledFlag: "true" | "false" | "unset" | "invalid";
  credentialRemovalConfirmed: boolean;
  message: string | null;
  digest: string | null;
}>;

export type MexcOwnerConnectionShutdownResult = Readonly<{
  control: MexcOwnerConnectionControlReport;
  audit: MexcOwnerShadowAuditEntry | null;
  auditFailure: string | null;
}>;

type Environment = Readonly<Record<string, string | undefined>>;
type Options = Readonly<{
  rootDir?: string;
  now?: () => number;
  appendAudit?: typeof appendOwnerMexcShadowAudit;
}>;

type PersistentControl = Readonly<{
  schemaVersion: typeof MEXC_OWNER_CONNECTION_CONTROL_SCHEMA_VERSION;
  state: MexcOwnerConnectionControlState;
  generation: number;
  updatedAtMs: number;
  reason: Exclude<MexcOwnerConnectionControlReason, "initial-active" | "control-integrity-failed">;
  digest: string;
}>;

const queues = new Map<string, Promise<unknown>>();
const controlFileName = "mexc-owner-connection-control.json";
const printableReason = /^[\x20-\x7e]{0,240}$/;

function root(options: Options) {
  return options.rootDir ?? process.env.DATA_DIR ?? join(process.cwd(), ".data");
}

function controlPath(options: Options) {
  return join(root(options), controlFileName);
}

function temporaryPath(options: Options) {
  return join(root(options), `${controlFileName}.tmp`);
}

function clean(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function enabledFlag(environment: Environment) {
  const value = clean(environment.OWNER_MEXC_ACCOUNT_COMPANION_ENABLED).toLowerCase();
  if (!value) return "unset" as const;
  if (value === "true" || value === "false") return value;
  return "invalid" as const;
}

function environmentStatus(environment: Environment) {
  const keyPresent = Boolean(clean(environment.OWNER_MEXC_READONLY_API_KEY));
  const secretPresent = Boolean(clean(environment.OWNER_MEXC_READONLY_API_SECRET));
  const permissionAttestationPresent = Boolean(
    clean(environment.OWNER_MEXC_READONLY_PERMISSION_ATTESTATION),
  );
  const companionEnabledFlag = enabledFlag(environment);
  const privateConfigurationPresent =
    keyPresent || secretPresent || permissionAttestationPresent;
  const credentialRemovalConfirmed =
    !privateConfigurationPresent &&
    (companionEnabledFlag === "false" || companionEnabledFlag === "unset");
  return Object.freeze({
    privateConfigurationPresent,
    credentialPairPresent: keyPresent && secretPresent,
    permissionAttestationPresent,
    companionEnabledFlag,
    credentialRemovalConfirmed,
  });
}

function digestCore(input: Omit<PersistentControl, "digest">) {
  return createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
}

function persistentCore(input: Readonly<{
  state: MexcOwnerConnectionControlState;
  generation: number;
  updatedAtMs: number;
  reason: PersistentControl["reason"];
}>) {
  return Object.freeze({
    schemaVersion: MEXC_OWNER_CONNECTION_CONTROL_SCHEMA_VERSION,
    state: input.state,
    generation: input.generation,
    updatedAtMs: input.updatedAtMs,
    reason: input.reason,
  });
}

function validatePersistent(value: unknown): PersistentControl {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("MEXC connection control must be an object.");
  }
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== MEXC_OWNER_CONNECTION_CONTROL_SCHEMA_VERSION) {
    throw new TypeError("Unsupported MEXC connection-control schema.");
  }
  if (input.state !== "sealed") {
    throw new TypeError("Persisted MEXC connection control may only contain a sealed state.");
  }
  if (!Number.isSafeInteger(input.generation) || Number(input.generation) < 1) {
    throw new TypeError("MEXC connection-control generation is invalid.");
  }
  if (!Number.isSafeInteger(input.updatedAtMs) || Number(input.updatedAtMs) < 0) {
    throw new TypeError("MEXC connection-control timestamp is invalid.");
  }
  if (input.reason !== "owner-emergency-shutdown") {
    throw new TypeError("MEXC connection-control reason is invalid.");
  }
  if (typeof input.digest !== "string" || !/^[a-f0-9]{64}$/.test(input.digest)) {
    throw new TypeError("MEXC connection-control digest is invalid.");
  }
  const core = persistentCore({
    state: input.state,
    generation: Number(input.generation),
    updatedAtMs: Number(input.updatedAtMs),
    reason: input.reason,
  });
  if (digestCore(core) !== input.digest) {
    throw new TypeError("MEXC connection-control digest does not verify.");
  }
  return Object.freeze({ ...core, digest: input.digest });
}

function report(
  persistent: PersistentControl | null,
  environment: Environment,
  integrity: MexcOwnerConnectionControlReport["integrity"],
  message: string | null,
): MexcOwnerConnectionControlReport {
  const derived = environmentStatus(environment);
  const failed = integrity === "failed";
  const state = failed ? "sealed" : persistent?.state ?? "active";
  return Object.freeze({
    schemaVersion: MEXC_OWNER_CONNECTION_CONTROL_SCHEMA_VERSION,
    state,
    generation: persistent?.generation ?? 0,
    updatedAtMs: persistent?.updatedAtMs ?? null,
    reason: failed
      ? "control-integrity-failed"
      : persistent?.reason ?? "initial-active",
    integrity,
    localPrivateReadsBlocked: state === "sealed",
    ...derived,
    message,
    digest: persistent?.digest ?? null,
  });
}

function safeMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  return message && message.length <= 220 ? message : fallback;
}

async function readPersistent(options: Options): Promise<PersistentControl | null> {
  try {
    return validatePersistent(JSON.parse(await readFile(controlPath(options), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readOwnerMexcConnectionControl(
  environment: Environment = process.env,
  options: Options = {},
): Promise<MexcOwnerConnectionControlReport> {
  try {
    const persistent = await readPersistent(options);
    return report(
      persistent,
      environment,
      persistent ? "verified" : "missing-default",
      null,
    );
  } catch (error) {
    return report(
      null,
      environment,
      "failed",
      safeMessage(error, "MEXC connection-control state could not be verified."),
    );
  }
}

export function scrubMexcPrivateEnvironmentForLocalSeal(
  environment: Environment,
): Environment {
  return Object.freeze({
    ...environment,
    OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "false",
    OWNER_MEXC_READONLY_API_KEY: undefined,
    OWNER_MEXC_READONLY_API_SECRET: undefined,
    OWNER_MEXC_READONLY_PERMISSION_ATTESTATION: undefined,
  });
}

async function atomicWrite(control: PersistentControl, options: Options) {
  await mkdir(root(options), { recursive: true, mode: 0o700 });
  const temporary = temporaryPath(options);
  await writeFile(temporary, `${JSON.stringify(control)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "w",
  });
  await rename(temporary, controlPath(options));
}

async function serial<T>(operation: () => Promise<T>): Promise<T> {
  const key = controlFileName;
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const current = previous.then(() => gate);
  queues.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(key) === current) queues.delete(key);
  }
}

export async function sealOwnerMexcConnection(input: Readonly<{
  userId: string;
  confirmation: string;
  operatorReason?: string;
  environment?: Environment;
}>, options: Options = {}): Promise<MexcOwnerConnectionShutdownResult> {
  if (input.confirmation !== MEXC_OWNER_SHUTDOWN_CONFIRMATION) {
    throw new TypeError(`Confirmation must be exactly ${MEXC_OWNER_SHUTDOWN_CONFIRMATION}.`);
  }
  const operatorReason = (input.operatorReason ?? "").trim();
  if (!printableReason.test(operatorReason)) {
    throw new TypeError("Shutdown reason contains unsupported characters or is too long.");
  }
  const environment = input.environment ?? process.env;
  return serial(async () => {
    const existing = await readOwnerMexcConnectionControl(environment, options);
    const now = (options.now ?? Date.now)();
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new TypeError("Shutdown timestamp is invalid.");
    }
    const core = persistentCore({
      state: "sealed",
      generation: Math.max(0, existing.generation) + 1,
      updatedAtMs: now,
      reason: "owner-emergency-shutdown",
    });
    const persistent = Object.freeze({ ...core, digest: digestCore(core) });
    await atomicWrite(persistent, options);
    const control = report(persistent, environment, "verified", null);

    let audit: MexcOwnerShadowAuditEntry | null = null;
    let auditFailure: string | null = null;
    try {
      audit = await (options.appendAudit ?? appendOwnerMexcShadowAudit)(input.userId, {
        kind: "connection-control",
        sourcePolicyVersion: MEXC_OWNER_CONNECTION_CONTROL_SCHEMA_VERSION,
        payload: Object.freeze({
          action: "local-private-read-sealed",
          generation: control.generation,
          updatedAtMs: control.updatedAtMs,
          reason: control.reason,
          operatorReason: operatorReason || null,
          privateConfigurationPresent: control.privateConfigurationPresent,
          credentialPairPresent: control.credentialPairPresent,
          credentialRemovalConfirmed: control.credentialRemovalConfirmed,
          localPrivateReadsBlocked: true,
          exchangeWriteCapability: "none",
        }),
      });
    } catch (error) {
      auditFailure = safeMessage(error, "Shutdown was sealed, but audit persistence failed.");
    }
    return Object.freeze({ control, audit, auditFailure });
  });
}
