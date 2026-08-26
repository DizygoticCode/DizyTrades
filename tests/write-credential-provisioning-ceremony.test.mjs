import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
import { MexcWriteProvisioningAuthority } from "../app/lib/execution/write-provisioning-authority.ts";
import { SqliteRenderEgressProofStore } from "../app/lib/execution/internal/render-egress-proof-authority.ts";
import { SqliteExecutionWriteCredentialAuthorityStore } from "../app/lib/execution/internal/write-credential-authority-store.ts";
import {
  MEXC_WRITE_PROVISIONING_ACCOUNT_ID_ENV,
  MEXC_WRITE_PROVISIONING_GENERATION_ENV,
  productionWriteCredentialCeremonyIdentity,
} from "../app/lib/write-credential-provisioning-ceremony.ts";

const iso = (ms) => new Date(ms).toISOString();
const serviceId = "srv-aaaaaaaaaaaaaaaaaaaa";

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

function totp(secret, time) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const mac = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = mac[19] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

test("#339 production identity is server-owned, exact and fail-closed", () => {
  assert.equal(productionWriteCredentialCeremonyIdentity({}), null);
  assert.equal(productionWriteCredentialCeremonyIdentity({
    [MEXC_WRITE_PROVISIONING_ACCOUNT_ID_ENV]: "account with spaces",
    [MEXC_WRITE_PROVISIONING_GENERATION_ENV]: "write-generation-1",
  }), null);
  assert.deepEqual(productionWriteCredentialCeremonyIdentity({
    [MEXC_WRITE_PROVISIONING_ACCOUNT_ID_ENV]: "mexc-owner-primary",
    [MEXC_WRITE_PROVISIONING_GENERATION_ENV]: "write-generation-1",
  }), {
    userId: "rob",
    accountId: "mexc-owner-primary",
    writeCredentialGeneration: "write-generation-1",
  });
});

test("#339 MEXC /32 attestation requires exact observed generation plus owner password and fresh TOTP", async () => {
  const root = mkdtempSync(join(tmpdir(), "write-ceremony-"));
  const priorData = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  closeAuthDatabaseForTests();
  const egress = new SqliteRenderEgressProofStore(join(root, "egress.sqlite"));
  const credentialAuthority = new SqliteExecutionWriteCredentialAuthorityStore(join(root, "authority.sqlite"));
  const authority = new MexcWriteProvisioningAuthority(egress, credentialAuthority);
  try {
    const password = "correct-horse-battery-staple";
    const user = await createAccount({ email: "owner-write-ceremony@example.test", password });
    verifyEmailToken(createEmailVerificationTokenForUser(user.id).token);
    getAuthDatabase().prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
    const mfaSecret = beginMfaEnrollment(user.id);
    assert.ok(mfaSecret);
    const base = Math.floor(Date.now() / 30_000) * 30_000;
    assert.ok(confirmMfaEnrollment(user.id, totp(mfaSecret, base), base));
    const session = createDatabaseSession(user, 3600, "password");
    assert.ok(session);

    const identity = { userId: user.id, accountId: "account-339", writeCredentialGeneration: "generation-339" };
    let state = egress.declare(identity, serviceId, "frankfurt", ["1.1.1.1"], iso(base - 120_000), 0);
    state = egress.observe(identity, serviceId, "1.1.1.1", "a".repeat(40), "instance-1", iso(base - 60_000), state.revision);
    state = egress.observe(identity, serviceId, "1.1.1.1", "b".repeat(40), "instance-2", iso(base), state.revision);
    assert.equal(state.status, "observed");
    assert.equal(state.observationCount, 2);

    const mutationTime = base + 30_000;
    const wrongPassword = await authority.attestCurrentEgressAllowlist(identity, {
      sessionToken: session,
      currentPassword: "wrong-password",
      totp: totp(mfaSecret, mutationTime),
    }, new Date(mutationTime));
    assert.equal(wrongPassword, null);
    assert.equal(egress.read(identity).status, "observed");

    const allowlisted = await authority.attestCurrentEgressAllowlist(identity, {
      sessionToken: session,
      currentPassword: password,
      totp: totp(mfaSecret, mutationTime),
    }, new Date(mutationTime));
    assert.equal(allowlisted?.status, "allowlisted");
    assert.equal(allowlisted?.mexcAllowlistAttestation, "mexc-write-egress-allowlisted-for-generation/v1");
    assert.equal(credentialAuthority.read(identity).status, "unknown");
  } finally {
    egress.close();
    credentialAuthority.close();
    closeAuthDatabaseForTests();
    if (priorData === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = priorData;
    rmSync(root, { recursive: true, force: true });
  }
});

test("#339 route stays owner-only, server-identity-bound, non-activating and non-transporting", () => {
  const route = readFileSync(new URL("../app/api/account/write-credential/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/account/write-credential/page.tsx", import.meta.url), "utf8");
  const ceremony = readFileSync(new URL("../app/lib/write-credential-provisioning-ceremony.ts", import.meta.url), "utf8");

  assert.match(route, /user\?\.id === "rob" && user\.role === "owner"/);
  assert.match(route, /validRequestOrigin\(request\)/);
  assert.match(route, /productionWriteCredentialCeremonyIdentity\(\)/);
  assert.doesNotMatch(route, /body\.accountId|body\.writeCredentialGeneration|body\.generation/);
  assert.doesNotMatch(page, /name=["']accountId["']|name=["'](?:writeCredentialGeneration|generation)["']/);
  assert.match(ceremony, /userId: OWNER_USER_ID/);
  assert.match(ceremony, /MEXC_WRITE_PROVISIONING_ACCOUNT_ID/);
  assert.match(ceremony, /MEXC_WRITE_PROVISIONING_GENERATION/);

  for (const source of [route, page, ceremony]) {
    assert.doesNotMatch(source, /execution\/internal/);
    assert.doesNotMatch(source, /ModernMexcReduceOnlyWriter|ProductionMexcWriteComposition/);
    assert.doesNotMatch(source, /activateWriteCredentialAuthority|\.activate\(/);
    assert.doesNotMatch(source, /api\.mexc\.com|private\/order\/create/);
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
  }

  assert.match(route, /orderPlacingOnlyConfirmed !== "confirmed"/);
  assert.match(route, /mexcIpAllowlistConfirmed !== "confirmed"/);
  assert.match(page, /type="password"[^>]*name="accessKey"|name="accessKey"[^>]*type="password"/);
  assert.match(page, /type="password"[^>]*name="secretKey"|name="secretKey"[^>]*type="password"/);
  assert.match(page, /#339 contains no activation capability/);
  assert.doesNotMatch(page, /Render \/32/);
});
