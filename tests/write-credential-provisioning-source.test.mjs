import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const custody = read("app/lib/credential-custody/write-credential.ts");
const provisioning = read("app/lib/credential-provisioning/write-credential.ts");
const genericCustody = read("app/lib/credential-custody/index.ts");
const genericProvisioning = read("app/lib/credential-provisioning/index.ts");
const composition = read("app/lib/execution/internal/production-write-composition.ts");

const combined = `${custody}\n${provisioning}`;

test("write credential provisioning is server-only, separately disabled, encrypted and has no raw-secret open path", () => {
  assert.match(custody, /import "server-only"/);
  assert.match(provisioning, /import "server-only"/);
  assert.match(custody, /MEXC_WRITE_CREDENTIAL_CUSTODY_ENABLED/);
  assert.match(custody, /aes-256-gcm/);
  assert.match(custody, /DizyTrades\/mexc-write-credential-custody\/v1/);
  assert.doesNotMatch(custody, /createDecipheriv|withCredentials|openCredential|function decrypt/i);
  assert.doesNotMatch(custody, /access_key|secret_key/i);
  assert.match(custody, /Number\([^\n]*\.changes\)/);
});

test("provisioning binds exact generation to a current #330 allowlist and fresh owner reauthentication", () => {
  for (const symbol of ["databaseSession", "verifyAccountPassword", "verifyFreshTotp", "SqliteRenderEgressProofStore",
    "RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS", "MEXC_WRITE_EGRESS_ATTESTATION"])
    assert.match(provisioning, new RegExp(symbol));
  assert.match(provisioning, /state\.status !== "allowlisted"/);
  assert.match(provisioning, /writeCredentialGeneration/);
  assert.match(provisioning, /#329: attestation remains a separate fresh-TOTP authority ceremony/);
  assert.doesNotMatch(provisioning, /attestWriteCredentialAuthority|activateWriteCredentialAuthority/);
});

test("new custody cannot place exchange orders or obtain execution credentials", () => {
  assert.doesNotMatch(combined, /MEXC_EXECUTION_ACCESS_KEY|MEXC_EXECUTION_SECRET_KEY|MEXC_EXECUTION_CREDENTIAL_GENERATION/);
  assert.doesNotMatch(combined, /production-write-composition|mexc-writer|withCredentials/);
  assert.doesNotMatch(combined, /fetch\s*\(|method\s*:\s*["']POST["']/i);
});

test("existing generic credential and production composition paths remain disconnected from #331", () => {
  assert.doesNotMatch(genericCustody, /write-credential/);
  assert.doesNotMatch(genericProvisioning, /write-credential/);
  assert.doesNotMatch(composition, /credential-custody\/write-credential|credential-provisioning\/write-credential/);
});
