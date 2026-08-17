import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const storeSource = readFileSync(new URL("../app/lib/execution/internal/write-credential-authority-store.ts", import.meta.url), "utf8");
const authoritySource = readFileSync(new URL("../app/lib/execution/internal/write-credential-attestation-authority.ts", import.meta.url), "utf8");
const productionWriteSource = readFileSync(new URL("../app/lib/execution/internal/production-write-composition.ts", import.meta.url), "utf8");

test("write credential attestation authority stays server-only, secret-free and disconnected from writer composition", () => {
  assert.match(storeSource, /^import "server-only";/);
  assert.match(authoritySource, /^import "server-only";/);
  assert.match(authoritySource, /databaseSession/);
  assert.match(authoritySource, /verifyAccountPassword/);
  assert.match(authoritySource, /verifyFreshTotp/);
  assert.match(authoritySource, /credentialFingerprintSha256/);
  assert.match(storeSource, /credential_fingerprint_sha256/);
  assert.match(storeSource, /mexc-futures-order-placing-only\/v1/);
  assert.match(storeSource, /mexc-write-egress-allowlisted-for-generation\/v1/);
  assert.match(storeSource, /status IN \('attested','active','revoked'\)/);
  assert.match(storeSource, /one_active_write_generation_per_account/);

  for (const forbidden of [
    "MEXC_EXECUTION_ACCESS_KEY",
    "MEXC_EXECUTION_SECRET_KEY",
    "MEXC_READONLY_ACCESS_KEY",
    "MEXC_READONLY_SECRET_KEY",
    "ModernMexcReduceOnlyWriter",
    "ProductionMexcWriteComposition",
    "mexc-execution-writer",
    "production-write-composition",
    "fetch(",
  ]) {
    assert.equal(storeSource.includes(forbidden), false, `store must not contain ${forbidden}`);
    assert.equal(authoritySource.includes(forbidden), false, `authority must not contain ${forbidden}`);
  }

  assert.doesNotMatch(authoritySource, /node:crypto|createHash|createHmac/);
  assert.doesNotMatch(productionWriteSource, /write-credential-attestation-authority|write-credential-authority-store/);
});

test("durable store schema contains attestation metadata, not mutation proofs or credential material", () => {
  const schema = storeSource.slice(storeSource.indexOf("CREATE TABLE write_credential_authority("), storeSource.indexOf("CREATE UNIQUE INDEX one_active_write_generation_per_account"));
  assert.match(schema, /user_id/);
  assert.match(schema, /account_id/);
  assert.match(schema, /write_generation/);
  assert.match(schema, /credential_fingerprint_sha256/);
  assert.match(schema, /permission_attestation/);
  assert.match(schema, /egress_attestation/);
  assert.doesNotMatch(schema, /password|totp|session|secret|access_key|secret_key/i);
});
