import assert from "node:assert/strict";
import test from "node:test";

import {
  MEXC_READONLY_CREDENTIAL_ACTIVATION_VERSION,
  MEXC_READONLY_PERMISSION_ATTESTATION,
  MexcReadOnlyCredentialActivationError,
  buildMexcReadOnlyCredentialActivationReport,
  requireMexcReadOnlyCredentials,
} from "../app/lib/mexc-readonly-credential-activation.ts";

const readyEnvironment = Object.freeze({
  LIVE_TRADING_ENABLED: "false",
  OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "true",
  OWNER_MEXC_READONLY_API_KEY: "test-read-key-1234567890",
  OWNER_MEXC_READONLY_API_SECRET: "test-read-secret-12345678901234567890",
  OWNER_MEXC_READONLY_PERMISSION_ATTESTATION:
    MEXC_READONLY_PERMISSION_ATTESTATION,
});

function failureKind(action, kind) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof MexcReadOnlyCredentialActivationError);
    assert.equal(error.kind, kind);
    return true;
  });
}

test("disabled owner activation is safe, deterministic and credential-free", () => {
  const environment = {
    LIVE_TRADING_ENABLED: "false",
    OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "false",
  };
  const first = buildMexcReadOnlyCredentialActivationReport(environment);
  const second = buildMexcReadOnlyCredentialActivationReport(environment);

  assert.equal(first.policyVersion, MEXC_READONLY_CREDENTIAL_ACTIVATION_VERSION);
  assert.equal(first.accountScope, "owner");
  assert.equal(first.state, "disabled");
  assert.equal(first.configured, false);
  assert.equal(first.readyForPrivateReads, false);
  assert.equal(first.writePermissionRequested, false);
  assert.equal(first.operatorReadOnlyAttested, false);
  assert.equal(first.providerPermissionIntrospectionPerformed, false);
  assert.equal(first.softwareBoundaryProved, true);
  assert.deepEqual(first.requestedPermissions, ["account-read", "trade-read"]);
  assert.deepEqual(second, first);
  assert.match(first.activationDigest, /^[a-f0-9]{64}$/);
  assert.match(first.softwareProofDigest, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.requestedPermissions));
  assert.doesNotMatch(JSON.stringify(first), /apiKey|apiSecret|test-read/i);
  failureKind(
    () => requireMexcReadOnlyCredentials(environment),
    "not-ready",
  );
});

test("complete owner server-only configuration becomes ready without exposing credentials in the report", () => {
  const report = buildMexcReadOnlyCredentialActivationReport(readyEnvironment);
  const credentials = requireMexcReadOnlyCredentials(readyEnvironment);

  assert.equal(report.accountScope, "owner");
  assert.equal(report.state, "ready");
  assert.equal(report.configured, true);
  assert.equal(report.readyForPrivateReads, true);
  assert.equal(report.writePermissionRequested, false);
  assert.equal(report.operatorReadOnlyAttested, true);
  assert.equal(report.providerPermissionIntrospectionPerformed, false);
  assert.equal(report.liveTradingEnabled, false);
  assert.equal(report.browserExposureForbidden, true);
  assert.deepEqual(credentials, {
    apiKey: readyEnvironment.OWNER_MEXC_READONLY_API_KEY,
    apiSecret: readyEnvironment.OWNER_MEXC_READONLY_API_SECRET,
  });
  assert.ok(Object.isFrozen(credentials));

  const serialised = JSON.stringify(report);
  assert.doesNotMatch(
    serialised,
    new RegExp(readyEnvironment.OWNER_MEXC_READONLY_API_KEY),
  );
  assert.doesNotMatch(
    serialised,
    new RegExp(readyEnvironment.OWNER_MEXC_READONLY_API_SECRET),
  );
  assert.doesNotMatch(serialised, /apiKey|apiSecret|signature|authorization/i);
});

test("owner activation fails closed on partial, dormant or malformed private configuration", () => {
  failureKind(
    () => buildMexcReadOnlyCredentialActivationReport({
      LIVE_TRADING_ENABLED: "false",
      OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "true",
      OWNER_MEXC_READONLY_API_KEY: "test-read-key-1234567890",
      OWNER_MEXC_READONLY_PERMISSION_ATTESTATION:
        MEXC_READONLY_PERMISSION_ATTESTATION,
    }),
    "incomplete-credentials",
  );
  failureKind(
    () => buildMexcReadOnlyCredentialActivationReport({
      LIVE_TRADING_ENABLED: "false",
      OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "false",
      OWNER_MEXC_READONLY_API_KEY: "test-read-key-1234567890",
    }),
    "disabled-with-private-configuration",
  );
  failureKind(
    () => buildMexcReadOnlyCredentialActivationReport({
      ...readyEnvironment,
      OWNER_MEXC_READONLY_API_SECRET: "contains whitespace and is invalid",
    }),
    "invalid-credentials",
  );
  failureKind(
    () => buildMexcReadOnlyCredentialActivationReport({
      ...readyEnvironment,
      OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "perhaps",
    }),
    "invalid-enabled-flag",
  );
});

test("owner activation rejects live trading, missing attestation and browser-prefixed secrets", () => {
  failureKind(
    () => buildMexcReadOnlyCredentialActivationReport({
      ...readyEnvironment,
      LIVE_TRADING_ENABLED: "true",
    }),
    "live-trading-enabled",
  );
  failureKind(
    () => buildMexcReadOnlyCredentialActivationReport({
      ...readyEnvironment,
      OWNER_MEXC_READONLY_PERMISSION_ATTESTATION:
        "account-read+trade-read+write",
    }),
    "missing-read-only-attestation",
  );
  failureKind(
    () => buildMexcReadOnlyCredentialActivationReport({
      ...readyEnvironment,
      NEXT_PUBLIC_OWNER_MEXC_API_SECRET: "browser-secret-must-fail",
    }),
    "browser-exposed-credential",
  );
});

test("owner activation errors never echo credential values", () => {
  const secret = "private-secret-that-must-not-appear";
  try {
    buildMexcReadOnlyCredentialActivationReport({
      ...readyEnvironment,
      OWNER_MEXC_READONLY_API_SECRET: secret,
      OWNER_MEXC_READONLY_PERMISSION_ATTESTATION: "wrong",
    });
    assert.fail("Expected activation to fail.");
  } catch (error) {
    assert.ok(error instanceof MexcReadOnlyCredentialActivationError);
    assert.doesNotMatch(error.message, new RegExp(secret));
    assert.doesNotMatch(error.stack ?? "", new RegExp(secret));
  }
});
