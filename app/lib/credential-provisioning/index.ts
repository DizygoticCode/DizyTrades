import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getAuthDatabase, verifyAccountPassword, verifyFreshTotp } from "../auth-db";
import { inspectActiveCredential, revokeCredentials, storeCredentials, type CustodyMetadata } from "../credential-custody";

export const PROVISIONING_TTL_MS = 5 * 60_000;
export type ProvisioningPurpose = "provision" | "revoke";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const ACCOUNT_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function enabled() {
  return process.env.CREDENTIAL_PROVISIONING_ENABLED === "true" && process.env.CREDENTIAL_CUSTODY_ENABLED === "true";
}
function tables() {
  const db = getAuthDatabase(); if (!db) throw new Error("PROVISIONING_UNAVAILABLE");
  db.exec(`CREATE TABLE IF NOT EXISTS credential_provisioning_authorizations (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_hash TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK(purpose IN ('provision','revoke')), expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL, consumed_at INTEGER
  ); CREATE INDEX IF NOT EXISTS provisioning_owner_purpose_idx
    ON credential_provisioning_authorizations(user_id,purpose);
  CREATE TABLE IF NOT EXISTS credential_provisioning_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, event_type TEXT NOT NULL,
    purpose TEXT, created_at INTEGER NOT NULL
  )`);
  return db;
}
function audit(userId: string, event: string, purpose: ProvisioningPurpose | null, now = Date.now()) {
  tables().prepare("INSERT INTO credential_provisioning_audit(user_id,event_type,purpose,created_at) VALUES(?,?,?,?)")
    .run(userId, event.slice(0, 64), purpose, now);
}
export function provisioningAvailability() {
  return { enabled: enabled(), liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === "true" };
}
export async function beginProvisioningAuthorization(input: { userId: string; sessionToken: string; purpose: ProvisioningPurpose; password: string; totp: string }, now = Date.now()) {
  if (!enabled() || input.userId !== "rob" || !input.sessionToken) throw new Error("PROVISIONING_UNAVAILABLE");
  const passwordValid = await verifyAccountPassword(input.userId, input.password);
  const mfaValid = passwordValid && verifyFreshTotp(input.userId, input.totp, now);
  if (!mfaValid) { audit(input.userId, "reauth-failed", input.purpose, now); throw new Error("REAUTH_FAILED"); }
  const token = randomBytes(32).toString("base64url"), db = tables(), sessionHash = digest(input.sessionToken);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM credential_provisioning_authorizations WHERE user_id=? AND purpose=? AND consumed_at IS NULL").run(input.userId, input.purpose);
    db.prepare("INSERT INTO credential_provisioning_authorizations VALUES(?,?,?,?,?,?,NULL)")
      .run(digest(token), input.userId, sessionHash, input.purpose, now + PROVISIONING_TTL_MS, now);
    db.exec("COMMIT"); audit(input.userId, "authorization-issued", input.purpose, now); return token;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
function consume(token: string, userId: string, sessionToken: string, purpose: ProvisioningPurpose, now = Date.now()) {
  if (!enabled() || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const db = tables(); db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare(`UPDATE credential_provisioning_authorizations SET consumed_at=?
      WHERE token_hash=? AND user_id=? AND session_hash=? AND purpose=? AND consumed_at IS NULL AND expires_at>?`)
      .run(now, digest(token), userId, digest(sessionToken), purpose, now);
    db.exec("COMMIT");
    if (result.changes === 1) audit(userId, "authorization-consumed", purpose, now);
    return result.changes === 1;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function provisionCredential(input: { token: string; userId: string; sessionToken: string; accountRef: string; apiKey: string; apiSecret: string }) {
  if (!ACCOUNT_REF.test(input.accountRef) || !input.apiKey || !input.apiSecret || input.apiKey.length > 512 || input.apiSecret.length > 512) throw new Error("INVALID_REQUEST");
  if (!consume(input.token, input.userId, input.sessionToken, "provision")) throw new Error("AUTHORIZATION_INVALID");
  if (inspectActiveCredential(input.userId, input.accountRef)) throw new Error("ALREADY_CONFIGURED");
  const metadata = storeCredentials({ userId: input.userId, accountRef: input.accountRef, credentials: { apiKey: input.apiKey, apiSecret: input.apiSecret } });
  audit(input.userId, "custody-created", "provision"); return metadata;
}
export function revokeCredential(input: { token: string; userId: string; sessionToken: string; accountRef: string }) {
  if (!ACCOUNT_REF.test(input.accountRef) || !consume(input.token, input.userId, input.sessionToken, "revoke")) throw new Error("AUTHORIZATION_INVALID");
  const active = inspectActiveCredential(input.userId, input.accountRef); if (!active) throw new Error("NOT_CONFIGURED");
  revokeCredentials({ userId: input.userId, accountRef: input.accountRef, recordId: active.recordId }); audit(input.userId, "custody-revoked", "revoke");
}
export function credentialStatus(userId: string, accountRef: string): CustodyMetadata | null {
  if (!enabled() || !ACCOUNT_REF.test(accountRef)) return null;
  return inspectActiveCredential(userId, accountRef);
}
