import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  beginMfaEnrollment, closeAuthDatabaseForTests, confirmMfaEnrollment, createAccount, createDatabaseSession,
  createEmailVerificationTokenForUser, getAuthDatabase, revokeDatabaseSession, verifyEmailToken,
} from "../app/lib/auth-db.ts";
import {
  SqliteMexcWriteCredentialCustody, mexcWriteCredentialFingerprintSha256,
} from "../app/lib/credential-custody/write-credential.ts";
import {
  provisionMexcWriteCredential, revokeProvisionedMexcWriteCredential,
} from "../app/lib/credential-provisioning/write-credential.ts";
import { SqliteRenderEgressProofStore } from "../app/lib/execution/internal/render-egress-proof-authority.ts";

const secret = Object.freeze({ accessKey: "synthetic-write-access-key-331", secretKey: "synthetic-write-secret-key-331" });
const master = Buffer.alloc(32, 61).toString("base64");
const ips = Object.freeze(["1.1.1.1", "8.8.8.8", "9.9.9.9"]);
const serviceId = "srv-aaaaaaaaaaaaaaaaaaaa";
const iso = (ms) => new Date(ms).toISOString();
const identity = (generation = "write-generation-1", accountId = "account-1", userId = "owner-1") =>
  ({ userId, accountId, writeCredentialGeneration: generation });

function enableCustody(root) {
  process.env.DATA_DIR = root;
  process.env.MEXC_WRITE_CREDENTIAL_CUSTODY_ENABLED = "true";
  process.env.CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION = "1";
  process.env.CREDENTIAL_CUSTODY_KEYRING = JSON.stringify({ 1: master });
  delete process.env.MFA_ENCRYPTION_KEY;
  delete process.env.SESSION_SECRET;
}
function clearCustodyEnvironment() {
  for (const key of ["DATA_DIR", "MEXC_WRITE_CREDENTIAL_CUSTODY_ENABLED", "CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION", "CREDENTIAL_CUSTODY_KEYRING"])
    delete process.env[key];
}
function allowlist(store, id, base) {
  let state = store.declare(id, serviceId, "oregon", ips, iso(base - 120_000), 0);
  state = store.observe(id, serviceId, "1.1.1.1", "a".repeat(40), "instance-1", iso(base - 60_000), state.revision);
  state = store.observe(id, serviceId, "8.8.8.8", "b".repeat(40), "instance-2", iso(base), state.revision);
  return store.allowlist(id, state.ipSetDigestSha256, iso(base + 10_000), state.revision);
}
function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, accumulator = 0; const bytes = [];
  for (const char of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char); if (index < 0) throw new Error("bad base32");
    accumulator = (accumulator << 5) | index; bits += 5; if (bits >= 8) bytes.push((accumulator >>> (bits -= 8)) & 255);
  }
  return Buffer.from(bytes);
}
function totp(secretValue, time) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const mac = createHmac("sha1", decodeBase32(secretValue)).update(counter).digest(), offset = mac[19] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

test("sealed write custody is exact-generation, secret-free in metadata, persistent and sticky-revoked", () => {
  const root = mkdtempSync(join(tmpdir(), "write-custody-")), path = join(root, "write.sqlite"); enableCustody(root);
  try {
    const id = identity(), store = new SqliteMexcWriteCredentialCustody(path), at = Date.now(), evidence = {
      revision: 4, ipSetDigestSha256: "c".repeat(64), allowlistedAt: iso(at - 10_000),
    };
    const sealed = store.seal(id, secret, evidence, iso(at), 0);
    assert.equal(sealed.status, "sealed"); assert.equal(sealed.revision, 1);
    assert.equal(sealed.credentialFingerprintSha256, mexcWriteCredentialFingerprintSha256(secret));
    assert.equal(JSON.stringify(sealed).includes(secret.accessKey), false); assert.equal(JSON.stringify(sealed).includes(secret.secretKey), false);
    assert.throws(() => store.seal(id, secret, evidence, iso(at + 1), 0), /MEXC_WRITE_CREDENTIAL_CUSTODY_UNAVAILABLE/);
    const other = store.seal(identity("write-generation-1", "account-2"), secret, evidence, iso(at + 2), 0);
    assert.equal(other.accountId, "account-2");
    const bytes = [path, `${path}-wal`, `${path}-shm`].filter(existsSync).map((candidate) => readFileSync(candidate));
    assert.equal(bytes.some((buffer) => buffer.includes(Buffer.from(secret.accessKey))), false);
    assert.equal(bytes.some((buffer) => buffer.includes(Buffer.from(secret.secretKey))), false);
    const db = new DatabaseSync(path), columns = db.prepare("PRAGMA table_info(mexc_write_credential_custody)").all().map((row) => row.name); db.close();
    assert.equal(columns.includes("access_key"), false); assert.equal(columns.includes("secret_key"), false);
    const revoked = store.revoke(id, iso(at + 60_000), 1); assert.equal(revoked.status, "revoked"); assert.equal(revoked.revision, 2);
    assert.equal(store.revoke(id, iso(at + 120_000), 2).revision, 2);
    assert.deepEqual(store.events(id).map((event) => event.kind), ["sealed", "revoked"]); store.close();
    const reopened = new SqliteMexcWriteCredentialCustody(path); assert.equal(reopened.read(id)?.status, "revoked"); reopened.close();
  } finally { clearCustodyEnvironment(); rmSync(root, { recursive: true, force: true }); }
});

test("custody is disabled by default, rejects reserved keys and poisons a replaced backing file", () => {
  const root = mkdtempSync(join(tmpdir(), "write-custody-hardening-")), path = join(root, "write.sqlite"), id = identity();
  try {
    process.env.DATA_DIR = root; delete process.env.MEXC_WRITE_CREDENTIAL_CUSTODY_ENABLED;
    assert.throws(() => new SqliteMexcWriteCredentialCustody(path).read(id), /MEXC_WRITE_CREDENTIAL_CUSTODY_UNAVAILABLE/);
    enableCustody(root); process.env.MFA_ENCRYPTION_KEY = master;
    assert.throws(() => new SqliteMexcWriteCredentialCustody(path).read(id), /MEXC_WRITE_CREDENTIAL_CUSTODY_UNAVAILABLE/);
    delete process.env.MFA_ENCRYPTION_KEY;
    const store = new SqliteMexcWriteCredentialCustody(path), at = Date.now();
    store.seal(id, secret, { revision: 4, ipSetDigestSha256: "d".repeat(64), allowlistedAt: iso(at - 1_000) }, iso(at), 0);
    renameSync(path, `${path}.detached`); writeFileSync(path, "replacement");
    assert.throws(() => store.read(id), /MEXC_WRITE_CREDENTIAL_CUSTODY_UNAVAILABLE/);
    assert.throws(() => store.read(id), /MEXC_WRITE_CREDENTIAL_CUSTODY_UNAVAILABLE/); store.close();
  } finally { clearCustodyEnvironment(); delete process.env.MFA_ENCRYPTION_KEY; rmSync(root, { recursive: true, force: true }); }
});

test("provisioning requires exact current #330 allowlist plus owner password and a fresh non-replayable TOTP", async () => {
  const root = mkdtempSync(join(tmpdir(), "write-provisioning-owner-")), priorData = process.env.DATA_DIR; enableCustody(root); closeAuthDatabaseForTests();
  const custody = new SqliteMexcWriteCredentialCustody(join(root, "write.sqlite")), egress = new SqliteRenderEgressProofStore(join(root, "egress.sqlite"));
  try {
    const password = "correct-horse-battery-staple", user = await createAccount({ email: "owner-write-provisioning@example.test", password });
    verifyEmailToken(createEmailVerificationTokenForUser(user.id).token); getAuthDatabase().prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
    const mfaSecret = beginMfaEnrollment(user.id); assert.ok(mfaSecret); const base = Math.floor(Date.now() / 30_000) * 30_000;
    assert.ok(confirmMfaEnrollment(user.id, totp(mfaSecret, base), base)); const session = createDatabaseSession(user, 3600, "password"); assert.ok(session);
    const id = identity("write-generation-331", "account-331", user.id), allowlisted = allowlist(egress, id, base);
    assert.equal(allowlisted.status, "allowlisted");
    const mutationTime = base + 30_000, request = (target = id, proof = {}) => ({ ...target, expectedRevision: 0, credentials: secret,
      ownerProof: { sessionToken: session, currentPassword: password, totp: totp(mfaSecret, mutationTime), ...proof } });
    assert.equal(await provisionMexcWriteCredential(custody, egress, request(identity("other-generation", "account-331", user.id)), new Date(mutationTime)), null);
    assert.equal(await provisionMexcWriteCredential(custody, egress, request(id, { currentPassword: "wrong" }), new Date(mutationTime)), null);
    const receipt = await provisionMexcWriteCredential(custody, egress, request(), new Date(mutationTime)); assert.equal(receipt?.status, "sealed");
    assert.equal(receipt?.egressProofRevision, allowlisted.revision); assert.equal(receipt?.egressIpSetDigestSha256, allowlisted.ipSetDigestSha256);
    assert.equal(await revokeProvisionedMexcWriteCredential(custody, { ...id, expectedRevision: 1,
      ownerProof: { sessionToken: session, currentPassword: password, totp: totp(mfaSecret, mutationTime) } }, new Date(mutationTime)), null);
    const revokeTime = mutationTime + 30_000, revoked = await revokeProvisionedMexcWriteCredential(custody, { ...id, expectedRevision: 1,
      ownerProof: { sessionToken: session, currentPassword: password, totp: totp(mfaSecret, revokeTime) } }, new Date(revokeTime));
    assert.equal(revoked?.status, "revoked"); revokeDatabaseSession(session);
    const later = revokeTime + 30_000; assert.equal(await revokeProvisionedMexcWriteCredential(custody, { ...id, expectedRevision: 2,
      ownerProof: { sessionToken: session, currentPassword: password, totp: totp(mfaSecret, later) } }, new Date(later)), null);
  } finally {
    custody.close(); egress.close(); closeAuthDatabaseForTests(); clearCustodyEnvironment();
    if (priorData === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = priorData;
    rmSync(root, { recursive: true, force: true });
  }
});

test("provisioning rejects an allowlisted proof whose live observation has become stale", async () => {
  const root = mkdtempSync(join(tmpdir(), "write-provisioning-stale-")), priorData = process.env.DATA_DIR; enableCustody(root); closeAuthDatabaseForTests();
  const custody = new SqliteMexcWriteCredentialCustody(join(root, "write.sqlite")), egress = new SqliteRenderEgressProofStore(join(root, "egress.sqlite"));
  try {
    const password = "correct-horse-battery-staple", user = await createAccount({ email: "owner-write-stale@example.test", password });
    verifyEmailToken(createEmailVerificationTokenForUser(user.id).token); getAuthDatabase().prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
    const mfaSecret = beginMfaEnrollment(user.id), base = Math.floor(Date.now() / 30_000) * 30_000; assert.ok(mfaSecret);
    assert.ok(confirmMfaEnrollment(user.id, totp(mfaSecret, base), base)); const session = createDatabaseSession(user, 3600, "password"); assert.ok(session);
    const id = identity("stale-generation", "account-stale", user.id); allowlist(egress, id, base - 11 * 60_000);
    const now = base + 30_000, result = await provisionMexcWriteCredential(custody, egress, { ...id, expectedRevision: 0, credentials: secret,
      ownerProof: { sessionToken: session, currentPassword: password, totp: totp(mfaSecret, now) } }, new Date(now));
    assert.equal(result, null); assert.equal(custody.read(id), null);
  } finally {
    custody.close(); egress.close(); closeAuthDatabaseForTests(); clearCustodyEnvironment();
    if (priorData === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = priorData;
    rmSync(root, { recursive: true, force: true });
  }
});
