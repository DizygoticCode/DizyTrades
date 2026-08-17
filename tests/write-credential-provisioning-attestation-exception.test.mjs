import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
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
  verifyEmailToken,
} from "../app/lib/auth-db.ts";
import { SqliteMexcWriteCredentialCustody } from "../app/lib/credential-custody/write-credential.ts";
import { provisionMexcWriteCredential } from "../app/lib/credential-provisioning/write-credential.ts";
import {
  MexcWriteProvisioningAuthority,
  MEXC_WRITE_PERMISSION_ATTESTATION,
} from "../app/lib/execution/write-provisioning-authority.ts";
import { SqliteRenderEgressProofStore } from "../app/lib/execution/internal/render-egress-proof-authority.ts";
import { SqliteExecutionWriteCredentialAuthorityStore } from "../app/lib/execution/internal/write-credential-authority-store.ts";

const secret = Object.freeze({
  accessKey: "synthetic-write-access-key-338",
  secretKey: "synthetic-write-secret-key-338",
});
const master = Buffer.alloc(32, 62).toString("base64");
const serviceId = "srv-aaaaaaaaaaaaaaaaaaaa";
const ips = Object.freeze(["1.1.1.1"]);
const iso = (ms) => new Date(ms).toISOString();

function enableCustody(root) {
  process.env.DATA_DIR = root;
  process.env.MEXC_WRITE_CREDENTIAL_CUSTODY_ENABLED = "true";
  process.env.CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION = "1";
  process.env.CREDENTIAL_CUSTODY_KEYRING = JSON.stringify({ 1: master });
  delete process.env.MFA_ENCRYPTION_KEY;
  delete process.env.SESSION_SECRET;
}

function clearCustodyEnvironment() {
  for (const key of [
    "DATA_DIR",
    "MEXC_WRITE_CREDENTIAL_CUSTODY_ENABLED",
    "CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION",
    "CREDENTIAL_CUSTODY_KEYRING",
  ]) delete process.env[key];
}

function allowlist(store, id, base) {
  let state = store.declare(id, serviceId, "oregon", ips, iso(base - 120_000), 0);
  state = store.observe(id, serviceId, "1.1.1.1", "a".repeat(40), "instance-1", iso(base - 60_000), state.revision);
  state = store.observe(id, serviceId, "1.1.1.1", "b".repeat(40), "instance-2", iso(base), state.revision);
  return store.allowlist(id, state.ipSetDigestSha256, iso(base), state.revision);
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const char of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("bad base32");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) bytes.push((accumulator >>> (bits -= 8)) & 255);
  }
  return Buffer.from(bytes);
}

function totp(secretValue, time) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const mac = createHmac("sha1", decodeBase32(secretValue)).update(counter).digest();
  const offset = mac[19] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

test("attestation exception discards sealed custody and leaves authority untouched", async () => {
  const root = mkdtempSync(join(tmpdir(), "write-provisioning-attestation-exception-"));
  const priorData = process.env.DATA_DIR;
  enableCustody(root);
  closeAuthDatabaseForTests();

  const custody = new SqliteMexcWriteCredentialCustody(join(root, "write.sqlite"));
  const egress = new SqliteRenderEgressProofStore(join(root, "egress.sqlite"));
  const credentialAuthority = new SqliteExecutionWriteCredentialAuthorityStore(join(root, "authority.sqlite"));
  const authority = new MexcWriteProvisioningAuthority(egress, credentialAuthority);

  try {
    const password = "correct-horse-battery-staple";
    const user = await createAccount({ email: "owner-write-attestation-exception@example.test", password });
    verifyEmailToken(createEmailVerificationTokenForUser(user.id).token);
    getAuthDatabase().prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);

    const mfaSecret = beginMfaEnrollment(user.id);
    assert.ok(mfaSecret);
    const base = Math.floor(Date.now() / 30_000) * 30_000;
    assert.ok(confirmMfaEnrollment(user.id, totp(mfaSecret, base), base));
    const session = createDatabaseSession(user, 3600, "password");
    assert.ok(session);

    const id = {
      userId: user.id,
      accountId: "account-338",
      writeCredentialGeneration: "write-generation-338",
    };
    allowlist(egress, id, base);
    const mutationTime = base + 30_000;

    authority.attestSealedCredential = async () => {
      throw new Error("synthetic attestation outage");
    };

    const result = await provisionMexcWriteCredential(custody, authority, {
      ...id,
      expectedRevision: 0,
      credentials: secret,
      permissionAttestation: MEXC_WRITE_PERMISSION_ATTESTATION,
      ownerProof: {
        sessionToken: session,
        currentPassword: password,
        totp: totp(mfaSecret, mutationTime),
      },
    }, new Date(mutationTime));

    assert.equal(result, null);
    assert.equal(custody.read(id), null);
    assert.deepEqual(custody.events(id).map((event) => event.kind), ["sealed", "discarded"]);
    assert.equal(credentialAuthority.read(id).status, "unknown");
    assert.throws(
      () => custody.seal(id, secret, {
        revision: 4,
        ipSetDigestSha256: "d".repeat(64),
        allowlistedAt: iso(base),
      }, iso(mutationTime), 0),
      /MEXC_WRITE_CREDENTIAL_CUSTODY_UNAVAILABLE/,
    );
  } finally {
    custody.close();
    egress.close();
    credentialAuthority.close();
    closeAuthDatabaseForTests();
    clearCustodyEnvironment();
    if (priorData === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = priorData;
    rmSync(root, { recursive: true, force: true });
  }
});
