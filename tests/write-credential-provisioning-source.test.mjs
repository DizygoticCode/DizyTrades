import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const custody = read("app/lib/credential-custody/write-credential.ts");
const provisioning = read("app/lib/credential-provisioning/write-credential.ts");
const facade = read("app/lib/execution/write-provisioning-authority.ts");
const genericCustody = read("app/lib/credential-custody/index.ts");
const genericProvisioning = read("app/lib/credential-provisioning/index.ts");
const composition = read("app/lib/execution/internal/production-write-composition.ts");
const combined = `${custody}\n${provisioning}\n${facade}`;

test("write credential custody is server-only, separately disabled, encrypted and has no raw-secret open path", () => {
  assert.match(custody, /^import "server-only";/);
  assert.match(custody, /MEXC_WRITE_CREDENTIAL_CUSTODY_ENABLED/);
  assert.match(custody, /aes-256-gcm/);
  assert.match(custody, /DizyTrades\/mexc-write-credential-custody\/v1/);
  assert.match(custody, /DizyTrades\/mexc-write-credential-fingerprint\/v1/);
  assert.match(custody, /PRAGMA secure_delete=ON/);
  assert.match(custody, /discardFailedAttestation/);
  assert.doesNotMatch(custody, /createDecipheriv|withCredentials|openCredential|function decrypt/i);
  assert.doesNotMatch(custody, /access_key|secret_key/i);
  assert.match(custody, /const changes = Number\(/);
});

test("provisioning reserves the one fresh TOTP for #329 and never imports execution internals", () => {
  assert.match(provisioning, /^import "server-only";/);
  assert.match(provisioning, /databaseSession/);
  assert.match(provisioning, /verifyAccountPassword/);
  assert.doesNotMatch(provisioning, /verifyFreshTotp/);
  assert.match(provisioning, /MexcWriteProvisioningAuthority/);
  assert.match(provisioning, /attestSealedCredential/);
  assert.match(provisioning, /discardFailedAttestation/);
  assert.match(provisioning, /permissionAttestation/);
  assert.doesNotMatch(provisioning, /execution\/internal/);
  assert.doesNotMatch(provisioning, /activateWriteCredentialAuthority/);
});

test("the one execution provisioning facade is secret-free, owns attestation and activation authority, and has no transport", () => {
  assert.match(facade, /^import "server-only";/);
  assert.match(facade, /render-egress-proof-authority/);
  assert.match(facade, /write-credential-attestation-authority/);
  assert.match(facade, /write-credential-authority-store/);
  assert.match(facade, /attestWriteCredentialAuthority/);
  assert.match(facade, /activateWriteCredentialAuthority/);
  assert.match(facade, /revokeWriteCredentialAuthority/);
  assert.match(facade, /MEXC_WRITE_PERMISSION_ATTESTATION/);
  assert.match(facade, /MEXC_WRITE_EGRESS_ATTESTATION/);
  assert.doesNotMatch(facade, /activateProductionWriteCredentialAuthority/);
  assert.doesNotMatch(facade, /accessKey|secretKey|credentials\s*:/);
  assert.doesNotMatch(facade, /credential-custody|mexc-execution-writer|production-write-composition/);
  assert.doesNotMatch(facade, /fetch\s*\(|method\s*:\s*["']POST["']|https:\/\/api\.mexc\.com/i);
});

test("new custody cannot place exchange orders or obtain production execution credentials", () => {
  assert.doesNotMatch(combined, /MEXC_EXECUTION_ACCESS_KEY|MEXC_EXECUTION_SECRET_KEY|MEXC_EXECUTION_CREDENTIAL_GENERATION/);
  assert.doesNotMatch(combined, /production-write-composition|mexc-execution-writer|withCredentials/);
  assert.doesNotMatch(combined, /fetch\s*\(|method\s*:\s*["']POST["']/i);
});

test("existing generic credential and production composition paths remain disconnected from #331", () => {
  assert.doesNotMatch(genericCustody, /write-credential/);
  assert.doesNotMatch(genericProvisioning, /write-credential/);
  assert.doesNotMatch(composition, /credential-custody\/write-credential|credential-provisioning\/write-credential|write-provisioning-authority/);
});
