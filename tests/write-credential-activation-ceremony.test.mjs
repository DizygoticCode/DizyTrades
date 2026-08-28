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
import {
  MEXC_WRITE_EGRESS_ATTESTATION,
  MEXC_WRITE_PERMISSION_ATTESTATION,
  SqliteExecutionWriteCredentialAuthorityStore,
} from "../app/lib/execution/internal/write-credential-authority-store.ts";

const iso = ms => new Date(ms).toISOString();
const serviceId = "srv-aaaaaaaaaaaaaaaaaaaa";
const ip = "1.1.1.1";
const fingerprint = "a".repeat(64);

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
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

test("#340 activation requires matching attested fingerprint, sealed egress receipt, current runtime /32 and fresh owner proof", async () => {
  const root = mkdtempSync(join(tmpdir(), "write-activation-"));
  const priorData = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  closeAuthDatabaseForTests();
  const egress = new SqliteRenderEgressProofStore(join(root, "egress.sqlite"));
  const credentialAuthority = new SqliteExecutionWriteCredentialAuthorityStore(join(root, "authority.sqlite"));
  const authority = new MexcWriteProvisioningAuthority(egress, credentialAuthority);
  try {
    const password = "correct-horse-battery-staple";
    const user = await createAccount({ email: "owner-write-activation@example.test", password });
    verifyEmailToken(createEmailVerificationTokenForUser(user.id).token);
    getAuthDatabase().prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
    const mfaSecret = beginMfaEnrollment(user.id);
    assert.ok(mfaSecret);
    const base = Math.floor(Date.now() / 30_000) * 30_000;
    assert.ok(confirmMfaEnrollment(user.id, totp(mfaSecret, base), base));
    const session = createDatabaseSession(user, 3600, "password");
    assert.ok(session);

    const identity = { userId: user.id, accountId: "account-340", writeCredentialGeneration: "generation-340" };
    let egressState = egress.declare(identity, serviceId, "frankfurt", [ip], iso(base - 120_000), 0);
    egressState = egress.observe(identity, serviceId, ip, "b".repeat(40), "instance-1", iso(base - 60_000), egressState.revision);
    egressState = egress.observe(identity, serviceId, ip, "c".repeat(40), "instance-2", iso(base), egressState.revision);
    egressState = egress.allowlist(identity, egressState.ipSetDigestSha256, iso(base), egressState.revision);
    assert.equal(egressState.status, "allowlisted");

    const attested = credentialAuthority.attest(
      identity,
      fingerprint,
      MEXC_WRITE_PERMISSION_ATTESTATION,
      MEXC_WRITE_EGRESS_ATTESTATION,
      iso(base),
      0,
    );
    assert.equal(attested.status, "attested");

    const custody = {
      status: "sealed",
      credentialFingerprintSha256: fingerprint,
      egressProofRevision: egressState.revision,
      egressIpSetDigestSha256: egressState.ipSetDigestSha256,
      egressAllowlistedAt: egressState.allowlistedAt,
    };
    const runtime = {
      serviceId,
      gitCommit: "d".repeat(40),
      instanceId: "instance-live",
      serviceType: "web",
      repository: "DizygoticCode/DizyTrades",
      branch: "main",
    };
    const activationTime = base + 30_000;
    const ownerProof = { sessionToken: session, currentPassword: password, totp: totp(mfaSecret, activationTime) };

    assert.equal(await authority.activateAttestedCredential(
      identity,
      attested.revision,
      { ...custody, credentialFingerprintSha256: "e".repeat(64) },
      runtime,
      ip,
      ownerProof,
      new Date(activationTime),
    ), null);
    assert.equal(credentialAuthority.read(identity).status, "attested");

    assert.equal(await authority.activateAttestedCredential(
      identity,
      attested.revision,
      custody,
      { ...runtime, serviceId: "srv-bbbbbbbbbbbbbbbbbbbb" },
      ip,
      ownerProof,
      new Date(activationTime),
    ), null);
    assert.equal(credentialAuthority.read(identity).status, "attested");

    assert.equal(await authority.activateAttestedCredential(
      identity,
      attested.revision,
      custody,
      runtime,
      "8.8.8.8",
      ownerProof,
      new Date(activationTime),
    ), null);
    assert.equal(credentialAuthority.read(identity).status, "attested");

    const active = await authority.activateAttestedCredential(
      identity,
      attested.revision,
      custody,
      runtime,
      ip,
      ownerProof,
      new Date(activationTime),
    );
    assert.equal(active?.status, "active");
    assert.equal(active?.revision, 2);
    assert.equal(active?.credentialFingerprintSha256, fingerprint);
    assert.deepEqual(credentialAuthority.events(identity).map(event => event.kind), ["attested", "activated"]);
  } finally {
    egress.close();
    credentialAuthority.close();
    closeAuthDatabaseForTests();
    if (priorData === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = priorData;
    rmSync(root, { recursive: true, force: true });
  }
});

test("#340 route/page stay owner-only, server-identity-bound, secret-free and disconnected from writer transport", () => {
  const route = readFileSync(new URL("../app/api/account/write-credential/activate/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/account/write-credential/activate/page.tsx", import.meta.url), "utf8");
  const ceremony = readFileSync(new URL("../app/lib/write-credential-activation-ceremony.ts", import.meta.url), "utf8");
  const facade = readFileSync(new URL("../app/lib/execution/write-provisioning-authority.ts", import.meta.url), "utf8");

  assert.match(route, /user\?\.id === "rob" && user\.role === "owner"/);
  assert.match(route, /validRequestOrigin\(request\)/);
  assert.match(route, /consumeRateLimit/);
  assert.match(route, /2_048/);
  assert.match(route, /productionWriteCredentialCeremonyIdentity\(\)/);
  assert.match(route, /activateProductionWriteCredential/);
  assert.match(route, /activateExactGeneration !== "confirmed"/);
  assert.doesNotMatch(route, /body\.accountId|body\.writeCredentialGeneration|body\.generation|body\.expectedRevision/);
  assert.doesNotMatch(page, /name=["'](?:accountId|writeCredentialGeneration|generation|expectedRevision|accessKey|secretKey)["']/);
  assert.doesNotMatch(route, /accessKey|secretKey|credentials\s*:/);

  for (const source of [route, page, ceremony]) {
    assert.doesNotMatch(source, /execution\/internal/);
    assert.doesNotMatch(source, /ModernMexcReduceOnlyWriter|ProductionMexcWriteComposition/);
    assert.doesNotMatch(source, /api\.mexc\.com|private\/order\/create/);
    assert.doesNotMatch(source, /LIVE_TRADING_ENABLED\s*=|MEXC_WRITE_PROVIDER_ENABLED\s*=/);
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
  }

  assert.match(page, /Order Placing permission only/);
  assert.match(page, /restricted to exactly the proven public \/32/);
  assert.match(page, /writer connection remains separate/);
  assert.match(ceremony, /inspectProductionExecutionHostEgressCeremony/);
  assert.match(ceremony, /custody\.read\(identity\)/);
  assert.match(ceremony, /activateAttestedCredential/);
  assert.doesNotMatch(ceremony, /decrypt|unseal|readSecret|credentialSecret/);

  assert.match(facade, /authority\.permissionAttestation !== MEXC_WRITE_PERMISSION_ATTESTATION/);
  assert.match(facade, /authority\.egressAttestation !== MEXC_WRITE_EGRESS_ATTESTATION/);
  assert.match(facade, /custody\.credentialFingerprintSha256 !== authority\.credentialFingerprintSha256/);
  assert.match(facade, /custody\.egressProofRevision !== egress\.allowlistRevision/);
  assert.match(facade, /custody\.egressIpSetDigestSha256 !== egress\.ipSetDigestSha256/);
  assert.match(facade, /custody\.egressAllowlistedAt !== egress\.allowlistedAt/);
  assert.match(facade, /ProductionExecutionHostEgressAuthority/);
  assert.match(facade, /openProductionExecutionHostEgressAuthority/);
  assert.match(facade, /this\.currentHostMatches\(identity, runtime, observerIpv4, now\)/);
  assert.match(facade, /this\.executionHostAuthority\.currentHostMatches\(identity, runtime, observerIpv4, now\)/);
  assert.match(facade, /activateWriteCredentialAuthority/);
});