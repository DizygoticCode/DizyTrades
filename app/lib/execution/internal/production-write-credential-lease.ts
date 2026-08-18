import "server-only";

import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  SqliteMexcWriteCredentialCustody,
  mexcWriteCredentialFingerprintSha256,
  type MexcWriteCredentialIdentity,
} from "../../credential-custody/write-credential";
import {
  MEXC_WRITE_PERMISSION_ATTESTATION,
  openProductionMexcWriteProvisioningAuthority,
} from "../write-provisioning-authority";
import {
  MEXC_WRITE_EGRESS_ATTESTATION,
} from "./write-credential-authority-store";
import { RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS } from "./render-egress-proof-authority";
import type { MexcExecutionCredentials } from "./mexc-execution-writer";

const ID = /^[A-Za-z0-9_:@.-]{1,120}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const OWNER_USER_ID = "rob" as const;
const PURPOSE = "mexc-write-provisioning/v1" as const;
const VERSION = 1;
const KEY_DERIVATION_LABEL = "DizyTrades/mexc-write-credential-custody/v1";
const ERROR = "MEXC_PRODUCTION_WRITE_CREDENTIAL_LEASE_UNAVAILABLE";

type Environment = Readonly<Record<string, string | undefined>>;
type EncryptedRow = Readonly<{
  key_version: number | bigint;
  nonce: Buffer;
  ciphertext: Buffer;
  auth_tag: Buffer;
  credential_fingerprint_sha256: string;
}>;

const fail = (): never => { throw new Error(ERROR); };

function decode32(value: string) {
  const text = value.trim();
  let decoded: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(text)) decoded = Buffer.from(text, "hex");
  else if (/^[A-Za-z0-9+/]{43}=$/.test(text)) decoded = Buffer.from(text, "base64");
  else return fail();
  if (decoded.length !== 32) return fail();
  return decoded;
}

function reservedKeyCandidates(value: string | undefined, includeRawUtf8 = false) {
  if (!value) return [];
  const candidates: Buffer[] = [];
  const add = (candidate: Buffer) => {
    if (candidate.length === 32 && !candidates.some((existing) => timingSafeEqual(existing, candidate))) candidates.push(candidate);
  };
  if (/^[0-9a-fA-F]{64}$/.test(value)) add(Buffer.from(value, "hex"));
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) add(Buffer.from(value, "base64"));
  if (/^[A-Za-z0-9_-]{43}=?$/.test(value)) add(Buffer.from(value, "base64url"));
  if (includeRawUtf8) add(Buffer.from(value, "utf8"));
  return candidates;
}

function custodyKey(version: number, environment: Environment) {
  if (environment.MEXC_WRITE_CREDENTIAL_CUSTODY_ENABLED !== "true") return fail();
  let raw: unknown;
  try { raw = JSON.parse(environment.CREDENTIAL_CUSTODY_KEYRING || ""); } catch { return fail(); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
  const encoded = (raw as Record<string, unknown>)[String(version)];
  if (typeof encoded !== "string") return fail();
  const key = decode32(encoded);
  const reserved = [
    ...reservedKeyCandidates(environment.SESSION_SECRET, true),
    ...reservedKeyCandidates(environment.MFA_ENCRYPTION_KEY),
  ];
  if (reserved.some((other) => timingSafeEqual(key, other))) return fail();
  return key;
}

function derivedKey(master: Buffer) {
  return createHmac("sha256", master).update(KEY_DERIVATION_LABEL).digest();
}

function aad(identity: MexcWriteCredentialIdentity, fingerprint: string, keyVersion: number) {
  return Buffer.from(JSON.stringify({
    purpose: PURPOSE,
    version: VERSION,
    keyVersion,
    userId: identity.userId,
    accountId: identity.accountId,
    writeCredentialGeneration: identity.writeCredentialGeneration,
    credentialFingerprintSha256: fingerprint,
  }), "utf8");
}

function custodyPath(environment: Environment) {
  return join(environment.DATA_DIR || join(process.cwd(), ".data"), "mexc-write-credential-custody.sqlite");
}

function decryptExactSealedCredential(
  identity: MexcWriteCredentialIdentity,
  fingerprint: string,
  environment: Environment,
) {
  const db = new DatabaseSync(custodyPath(environment), { readOnly: true });
  try {
    const row = db.prepare(
      "SELECT key_version,nonce,ciphertext,auth_tag,credential_fingerprint_sha256 FROM mexc_write_credential_custody WHERE user_id=? AND account_id=? AND write_generation=? AND status='sealed'",
    ).get(identity.userId, identity.accountId, identity.writeCredentialGeneration) as EncryptedRow | undefined;
    if (!row || row.credential_fingerprint_sha256 !== fingerprint) return fail();
    const keyVersion = Number(row.key_version);
    if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) return fail();
    const master = custodyKey(keyVersion, environment);
    const key = derivedKey(master);
    const decipher = createDecipheriv("aes-256-gcm", key, row.nonce);
    decipher.setAAD(aad(identity, fingerprint, keyVersion));
    decipher.setAuthTag(row.auth_tag);
    let plaintext: Buffer | null = null;
    try {
      plaintext = Buffer.concat([decipher.update(row.ciphertext), decipher.final()]);
      const parsed = JSON.parse(plaintext.toString("utf8")) as Record<string, unknown>;
      if (typeof parsed.accessKey !== "string" || typeof parsed.secretKey !== "string") return fail();
      const secret = Object.freeze({ accessKey: parsed.accessKey, secretKey: parsed.secretKey });
      if (mexcWriteCredentialFingerprintSha256(secret) !== fingerprint) return fail();
      return secret;
    } catch {
      return fail();
    } finally {
      plaintext?.fill(0);
      key.fill(0);
      master.fill(0);
    }
  } finally {
    db.close();
  }
}

export type ProductionWriteCredentialExecutionIdentity = MexcWriteCredentialIdentity & Readonly<{ userId: typeof OWNER_USER_ID }>;

export function productionWriteCredentialExecutionIdentity(
  environment: Environment = process.env,
): ProductionWriteCredentialExecutionIdentity | null {
  const accountId = environment.MEXC_WRITE_PROVISIONING_ACCOUNT_ID?.trim() || "";
  const writeCredentialGeneration = environment.MEXC_WRITE_PROVISIONING_GENERATION?.trim() || "";
  if (!ID.test(accountId) || !ID.test(writeCredentialGeneration)) return null;
  return Object.freeze({ userId: OWNER_USER_ID, accountId, writeCredentialGeneration });
}

/**
 * Execution-only lease. Plaintext exists only in the returned writer-slot context
 * and is never persisted, logged, exposed through a route, or accepted from the browser.
 * Every lease re-reads #329, #330 and #331 for the exact server-owned generation.
 */
export function readProductionMexcWriteCredentialLease(
  identity: ProductionWriteCredentialExecutionIdentity,
  environment: Environment = process.env,
  now: Date = new Date(),
): MexcExecutionCredentials {
  if (!Number.isFinite(now.getTime())) return fail();
  const configured = productionWriteCredentialExecutionIdentity(environment);
  if (!configured || configured.userId !== identity.userId || configured.accountId !== identity.accountId || configured.writeCredentialGeneration !== identity.writeCredentialGeneration) return fail();

  const authorityHandle = openProductionMexcWriteProvisioningAuthority();
  const custody = new SqliteMexcWriteCredentialCustody();
  try {
    const authority = authorityHandle.authority.inspectCredentialAuthority(identity);
    const egress = authorityHandle.authority.inspectEgress(identity);
    const receipt = custody.read(identity);
    if (
      authority.status !== "active"
      || !authority.credentialFingerprintSha256
      || !SHA256.test(authority.credentialFingerprintSha256)
      || authority.permissionAttestation !== MEXC_WRITE_PERMISSION_ATTESTATION
      || authority.egressAttestation !== MEXC_WRITE_EGRESS_ATTESTATION
      || !authority.activatedAt
      || !receipt
      || receipt.status !== "sealed"
      || receipt.credentialFingerprintSha256 !== authority.credentialFingerprintSha256
      || egress.status !== "allowlisted"
      || egress.mexcAllowlistAttestation !== MEXC_WRITE_EGRESS_ATTESTATION
      || !egress.ipSetDigestSha256
      || !egress.allowlistedAt
      || !egress.lastObservedAt
      || receipt.egressProofRevision !== egress.revision
      || receipt.egressIpSetDigestSha256 !== egress.ipSetDigestSha256
      || receipt.egressAllowlistedAt !== egress.allowlistedAt
    ) return fail();

    const observedAt = Date.parse(egress.lastObservedAt);
    const allowlistedAt = Date.parse(egress.allowlistedAt);
    const nowMs = now.getTime();
    if (
      !Number.isFinite(observedAt)
      || !Number.isFinite(allowlistedAt)
      || observedAt > nowMs
      || allowlistedAt > nowMs
      || nowMs - observedAt > RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS
    ) return fail();

    const secret = decryptExactSealedCredential(identity, authority.credentialFingerprintSha256, environment);
    return Object.freeze({
      accessKey: secret.accessKey,
      secretKey: secret.secretKey,
      generation: identity.writeCredentialGeneration,
    });
  } finally {
    try { custody.close(); } finally { authorityHandle.close(); }
  }
}
