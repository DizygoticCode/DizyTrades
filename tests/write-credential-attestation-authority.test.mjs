import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  beginMfaEnrollment,
  closeAuthDatabaseForTests,
  confirmMfaEnrollment,
  createAccount,
  createDatabaseSession,
  createEmailVerificationTokenForUser,
  getAuthDatabase,
  revokeDatabaseSession,
  verifyEmailToken,
} from "../app/lib/auth-db.ts";
import {
  activateWriteCredentialAuthority,
  attestWriteCredentialAuthority,
  revokeWriteCredentialAuthority,
} from "../app/lib/execution/internal/write-credential-attestation-authority.ts";
import {
  ExecutionWriteCredentialAuthorityStoreError,
  MEXC_WRITE_EGRESS_ATTESTATION,
  MEXC_WRITE_PERMISSION_ATTESTATION,
  SqliteExecutionWriteCredentialAuthorityStore,
} from "../app/lib/execution/internal/write-credential-authority-store.ts";

const fingerprint = "a".repeat(64);
const at = index => new Date(1_780_000_000_000 + index * 30_000).toISOString();
const id = generation => ({ userId: "rob", accountId: "account-1", writeCredentialGeneration: generation });
const attest = (store, identity, revision = 0, value = fingerprint, when = at(0)) =>
  store.attest(identity, value, MEXC_WRITE_PERMISSION_ATTESTATION, MEXC_WRITE_EGRESS_ATTESTATION, when, revision);

const conflict = error => error instanceof ExecutionWriteCredentialAuthorityStoreError
  && error.code === "EXECUTION_WRITE_CREDENTIAL_AUTHORITY_CONFLICT";

test("write credential authority is exact-generation, CAS revisioned, rotation isolated and sticky-revoked", () => {
  const store = new SqliteExecutionWriteCredentialAuthorityStore(":memory:");
  try {
    const generationOne = id("generation-1"), generationTwo = id("generation-2");
    assert.deepEqual(store.read(generationOne), {
      revision: 0, status: "unknown", credentialFingerprintSha256: null,
      permissionAttestation: null, egressAttestation: null,
      attestedAt: null, activatedAt: null, revokedAt: null, updatedAt: null,
    });

    const first = attest(store, generationOne);
    assert.equal(first.revision, 1);
    assert.equal(first.status, "attested");
    assert.equal(first.credentialFingerprintSha256, fingerprint);
    assert.equal(first.permissionAttestation, MEXC_WRITE_PERMISSION_ATTESTATION);
    assert.equal(first.egressAttestation, MEXC_WRITE_EGRESS_ATTESTATION);
    assert.throws(() => attest(store, generationOne), conflict);
    assert.throws(() => store.activate(generationOne, at(1), 99), conflict);

    const activeOne = store.activate(generationOne, at(1), first.revision);
    assert.equal(activeOne.status, "active");
    assert.equal(activeOne.revision, 2);

    const second = attest(store, generationTwo, 0, "b".repeat(64), at(2));
    assert.equal(second.status, "attested");
    assert.throws(() => store.activate(generationTwo, at(3), second.revision), conflict);

    const revokedOne = store.revoke(generationOne, at(3), activeOne.revision);
    assert.equal(revokedOne.status, "revoked");
    assert.equal(revokedOne.revision, 3);
    assert.equal(store.revoke(generationOne, at(4), revokedOne.revision).revision, revokedOne.revision);
    assert.throws(() => store.activate(generationOne, at(4), revokedOne.revision), conflict);
    assert.throws(() => attest(store, generationOne), conflict);

    const activeTwo = store.activate(generationTwo, at(4), second.revision);
    assert.equal(activeTwo.status, "active");
    assert.equal(activeTwo.credentialFingerprintSha256, "b".repeat(64));
    assert.deepEqual(store.events(generationOne).map(event => event.kind), ["attested", "activated", "revoked"]);
    assert.deepEqual(store.events(generationTwo).map(event => event.kind), ["attested", "activated"]);
  } finally { store.close(); }
});

test("same generation string is isolated by exact owner account identity", () => {
  const store = new SqliteExecutionWriteCredentialAuthorityStore(":memory:");
  try {
    const first = id("generation-1"), otherAccount = { ...first, accountId: "account-2" }, otherUser = { ...first, userId: "other-owner" };
    attest(store, first);
    attest(store, otherAccount, 0, "b".repeat(64));
    attest(store, otherUser, 0, "c".repeat(64));
    assert.equal(store.read(first).credentialFingerprintSha256, fingerprint);
    assert.equal(store.read(otherAccount).credentialFingerprintSha256, "b".repeat(64));
    assert.equal(store.read(otherUser).credentialFingerprintSha256, "c".repeat(64));
  } finally { store.close(); }
});

test("authority survives restart and cached backing replacement permanently poisons the handle", () => {
  const root = mkdtempSync(join(tmpdir(), "write-authority-")), path = join(root, "authority.sqlite"), identity = id("generation-1");
  try {
    const first = new SqliteExecutionWriteCredentialAuthorityStore(path);
    attest(first, identity);
    first.close();
    const reopened = new SqliteExecutionWriteCredentialAuthorityStore(path);
    assert.equal(reopened.read(identity).status, "attested");
    renameSync(path, `${path}.detached`);
    writeFileSync(path, "replacement");
    assert.throws(() => reopened.read(identity), error => error instanceof ExecutionWriteCredentialAuthorityStoreError && error.code === "EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    assert.throws(() => reopened.read(identity), error => error instanceof ExecutionWriteCredentialAuthorityStoreError && error.code === "EXECUTION_WRITE_CREDENTIAL_AUTHORITY_UNAVAILABLE");
    reopened.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("two durable handles cannot win the same attestation CAS", () => {
  const root = mkdtempSync(join(tmpdir(), "write-authority-cas-")), path = join(root, "authority.sqlite"), identity = id("generation-1");
  const first = new SqliteExecutionWriteCredentialAuthorityStore(path), second = new SqliteExecutionWriteCredentialAuthorityStore(path);
  try {
    assert.equal(attest(first, identity).revision, 1);
    assert.throws(() => attest(second, identity), conflict);
  } finally { first.close(); second.close(); rmSync(root, { recursive: true, force: true }); }
});

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, accumulator = 0;
  const bytes = [];
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("bad base32");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) bytes.push((accumulator >>> (bits -= 8)) & 0xff);
  }
  return Buffer.from(bytes);
}

function totp(base32Secret, time) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const mac = createHmac("sha1", decodeBase32(base32Secret)).update(counter).digest();
  const offset = mac[19] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

test("authority mutations require owner DB session + current password + fresh non-replayable TOTP", async () => {
  const root = mkdtempSync(join(tmpdir(), "write-authority-owner-")), priorData = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  closeAuthDatabaseForTests();
  const store = new SqliteExecutionWriteCredentialAuthorityStore(join(root, "write-authority.sqlite"));
  try {
    const password = "correct-horse-battery-staple";
    const user = await createAccount({ email: "owner-write-authority@example.test", password });
    verifyEmailToken(createEmailVerificationTokenForUser(user.id).token);
    const authDb = getAuthDatabase();
    authDb.prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
    const secret = beginMfaEnrollment(user.id);
    assert.ok(secret);

    const base = Math.floor(Date.now() / 30_000) * 30_000;
    assert.ok(confirmMfaEnrollment(user.id, totp(secret, base), base));
    const session = createDatabaseSession(user, 3600, "password");
    assert.ok(session);
    const identity = { userId: user.id, accountId: "account-1", writeCredentialGeneration: "generation-1" };
    const request = (time, expectedRevision, overrides = {}) => ({
      ...identity,
      expectedRevision,
      ownerProof: { sessionToken: session, currentPassword: password, totp: totp(secret, time) },
      ...overrides,
    });

    const firstTime = base + 30_000;
    const wrongPassword = request(firstTime, 0, {
      credentialFingerprintSha256: fingerprint,
      permissionAttestation: MEXC_WRITE_PERMISSION_ATTESTATION,
      egressAttestation: MEXC_WRITE_EGRESS_ATTESTATION,
      ownerProof: { sessionToken: session, currentPassword: "wrong-password", totp: totp(secret, firstTime) },
    });
    assert.equal(await attestWriteCredentialAuthority(store, wrongPassword, new Date(firstTime)), null);

    const attested = await attestWriteCredentialAuthority(store, request(firstTime, 0, {
      credentialFingerprintSha256: fingerprint,
      permissionAttestation: MEXC_WRITE_PERMISSION_ATTESTATION,
      egressAttestation: MEXC_WRITE_EGRESS_ATTESTATION,
    }), new Date(firstTime));
    assert.equal(attested?.status, "attested");

    // Same TOTP counter cannot authorize a second mutation.
    assert.equal(await activateWriteCredentialAuthority(store, request(firstTime, 1), new Date(firstTime)), null);
    const activeTime = firstTime + 30_000;
    const active = await activateWriteCredentialAuthority(store, request(activeTime, 1), new Date(activeTime));
    assert.equal(active?.status, "active");

    const revokeTime = activeTime + 30_000;
    const revoked = await revokeWriteCredentialAuthority(store, request(revokeTime, 2), new Date(revokeTime));
    assert.equal(revoked?.status, "revoked");

    // A revoked database session fails even with the next correct password/TOTP pair.
    revokeDatabaseSession(session);
    const afterRevocation = revokeTime + 30_000;
    assert.equal(await revokeWriteCredentialAuthority(store, request(afterRevocation, 3), new Date(afterRevocation)), null);
  } finally {
    store.close();
    closeAuthDatabaseForTests();
    if (priorData === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = priorData;
    rmSync(root, { recursive: true, force: true });
  }
});
