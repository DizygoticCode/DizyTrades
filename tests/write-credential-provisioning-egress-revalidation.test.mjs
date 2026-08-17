import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  closeAuthDatabaseForTests,
  createAccount,
  createDatabaseSession,
  createEmailVerificationTokenForUser,
  getAuthDatabase,
  verifyEmailToken,
} from "../app/lib/auth-db.ts";
import { provisionMexcWriteCredential } from "../app/lib/credential-provisioning/write-credential.ts";
import { MEXC_WRITE_PERMISSION_ATTESTATION } from "../app/lib/execution/write-provisioning-authority.ts";

const credentials = Object.freeze({
  accessKey: "synthetic-revalidation-access-key",
  secretKey: "synthetic-revalidation-secret-key",
});

test("write credential provisioning revalidates authoritative egress after password verification before custody mutation", async () => {
  const root = mkdtempSync(join(tmpdir(), "write-egress-revalidation-"));
  const priorData = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  closeAuthDatabaseForTests();

  try {
    const password = "correct-horse-battery-staple";
    const user = await createAccount({ email: "owner-write-revalidation@example.test", password });
    verifyEmailToken(createEmailVerificationTokenForUser(user.id).token);
    getAuthDatabase().prepare("UPDATE users SET role='owner' WHERE id=?").run(user.id);
    const sessionToken = createDatabaseSession(user, 3600, "password");
    assert.ok(sessionToken);

    const identity = Object.freeze({
      userId: user.id,
      accountId: "account-revalidation",
      writeCredentialGeneration: "generation-revalidation",
    });
    const initialNow = new Date(Date.now() - 60_000);
    const evidence = Object.freeze({
      revision: 4,
      ipSetDigestSha256: "e".repeat(64),
      allowlistedAt: initialNow.toISOString(),
    });
    const calls = [];
    let evidenceChecks = 0;

    const authority = {
      currentEgressEvidence(target, checkedAt) {
        evidenceChecks += 1;
        calls.push(`egress-${evidenceChecks}`);
        assert.deepEqual(target, identity);
        if (evidenceChecks === 1) {
          assert.equal(checkedAt.toISOString(), initialNow.toISOString());
          return evidence;
        }
        assert.ok(checkedAt.getTime() > initialNow.getTime());
        return null;
      },
      async attestSealedCredential() {
        calls.push("attest");
        throw new Error("attestation must not run after failed egress revalidation");
      },
    };
    const custody = {
      seal() {
        calls.push("seal");
        throw new Error("custody must not mutate after failed egress revalidation");
      },
    };

    const result = await provisionMexcWriteCredential(
      custody,
      authority,
      {
        ...identity,
        expectedRevision: 0,
        credentials,
        permissionAttestation: MEXC_WRITE_PERMISSION_ATTESTATION,
        ownerProof: {
          sessionToken,
          currentPassword: password,
          totp: "000000",
        },
      },
      initialNow,
    );

    assert.equal(result, null);
    assert.equal(evidenceChecks, 2);
    assert.deepEqual(calls, ["egress-1", "egress-2"]);
  } finally {
    closeAuthDatabaseForTests();
    if (priorData === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = priorData;
    rmSync(root, { recursive: true, force: true });
  }
});