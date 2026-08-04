import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mexcPrivateReadCapabilityManifest,
} from "../app/lib/mexc-private-readonly.ts";
import {
  buildMexcReadOnlyCredentialActivationReport,
  MexcReadOnlyCredentialActivationError,
} from "../app/lib/mexc-readonly-credential-activation.ts";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [
  activationSource,
  transportSource,
  snapshotSource,
  companionSource,
  reconciliationSource,
  previewSource,
  auditSource,
  controlSource,
  accountPageSource,
  previewPageSource,
  auditPageSource,
  controlPageSource,
  shutdownRouteSource,
  layoutSource,
] = await Promise.all([
  source("app/lib/mexc-readonly-credential-activation.ts"),
  source("app/lib/mexc-private-readonly.ts"),
  source("app/lib/mexc-owner-account-snapshot.ts"),
  source("app/lib/mexc-owner-account-companion.ts"),
  source("app/lib/mexc-owner-account-reconciliation.ts"),
  source("app/lib/mexc-owner-order-preview.ts"),
  source("app/lib/mexc-owner-shadow-audit.ts"),
  source("app/lib/mexc-owner-connection-control.ts"),
  source("app/account/page.tsx"),
  source("app/account/preview/page.tsx"),
  source("app/account/audit/page.tsx"),
  source("app/account/control/page.tsx"),
  source("app/account/control/shutdown/route.ts"),
  source("app/account/layout.tsx"),
]);

const readyEnvironment = Object.freeze({
  OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "true",
  OWNER_MEXC_READONLY_API_KEY: "review-key-123",
  OWNER_MEXC_READONLY_API_SECRET: "review-secret-123456789",
  OWNER_MEXC_READONLY_PERMISSION_ATTESTATION: "account-read+trade-read;no-write/v1",
  LIVE_TRADING_ENABLED: "false",
});

test("review: private provider capability is an explicit GET-only allowlist", () => {
  const manifest = mexcPrivateReadCapabilityManifest();
  assert.deepEqual(manifest.methods, ["GET"]);
  assert.equal(manifest.writeCapability, false);
  assert.equal(manifest.baseOrigin, "https://contract.mexc.com");
  assert.deepEqual(
    manifest.endpoints.map(({ method }) => method),
    ["GET", "GET", "GET", "GET", "GET"],
  );
  assert.deepEqual(
    manifest.endpoints.map(({ path }) => path),
    [
      "/api/v1/private/account/assets",
      "/api/v1/private/account/asset/{currency}",
      "/api/v1/private/position/open_positions",
      "/api/v1/private/account/risk_limit",
      "/api/v1/private/account/tiered_fee_rate",
    ],
  );
  assert.match(transportSource, /method:\s*"GET"/);
  assert.doesNotMatch(transportSource, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(transportSource, /\/private\/(?:order|planorder|position\/change|account\/transfer)/i);
});

test("review: activation requires server-only custody, read attestation and live execution off", () => {
  const report = buildMexcReadOnlyCredentialActivationReport(readyEnvironment);
  assert.equal(report.state, "ready");
  assert.equal(report.credentialSource, "server-environment");
  assert.deepEqual(report.requestedPermissions, ["account-read", "trade-read"]);
  assert.equal(report.writePermissionRequested, false);
  assert.equal(report.liveTradingEnabled, false);
  assert.equal(report.browserExposureForbidden, true);
  assert.equal(report.providerPermissionIntrospectionPerformed, false);
  assert.match(activationSource, /^import "server-only";/);
  assert.doesNotMatch(activationSource, /NEXT_PUBLIC_OWNER_MEXC/);

  assert.throws(
    () => buildMexcReadOnlyCredentialActivationReport({
      ...readyEnvironment,
      LIVE_TRADING_ENABLED: "true",
    }),
    (error) =>
      error instanceof MexcReadOnlyCredentialActivationError &&
      error.kind === "live-trading-enabled",
  );
});

test("review: all private account pages are owner-gated server surfaces", () => {
  for (const page of [accountPageSource, previewPageSource, auditPageSource, controlPageSource]) {
    assert.match(page, /requireUser\(\)/);
    assert.match(page, /user\.role\s*!==\s*"owner"/);
    assert.match(page, /redirect\("\/terminal"\)/);
    assert.doesNotMatch(page, /^["']use client["'];/m);
  }
  assert.match(shutdownRouteSource, /requireApiUser\(\)/);
  assert.match(shutdownRouteSource, /user\.role\s*!==\s*"owner"/);
  assert.match(shutdownRouteSource, /Same-origin request required/);
  assert.doesNotMatch(shutdownRouteSource, /requestMexcPrivateRead|requireMexcReadOnlyCredentials/);
});

test("review: hypothetical preview remains informational and cannot mutate either account", () => {
  assert.match(previewSource, /executable:\s*false/);
  assert.match(previewSource, /exchangeWriteCapability:\s*"none"/);
  assert.match(previewSource, /decisionEligible:\s*false/);
  assert.doesNotMatch(previewSource, /requestMexcPrivateRead/);
  assert.doesNotMatch(previewSource, /submitManualOrder|closeManual|reverseManual|flattenManual/);
  assert.doesNotMatch(previewSource, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.match(previewPageSource, /method="get"/);
  assert.match(previewPageSource, /EXCHANGE WRITE: NONE/);
});

test("review: reconciliation is read-only and immutable persistence is mandatory for fresh output", () => {
  assert.match(reconciliationSource, /kind:\s*"account-reconciliation"/);
  assert.match(reconciliationSource, /"audit-persistence-failed"/);
  assert.match(reconciliationSource, /decisionEligible:\s*false/);
  assert.doesNotMatch(reconciliationSource, /submitManualOrder|closeManual|reverseManual|flattenManual/);
  assert.doesNotMatch(reconciliationSource, /requestMexcPrivateRead/);
  assert.match(companionSource, /account\.state\.status !== "fresh"/);
});

test("review: shadow audit is append-only, tamper-evident and rejects sensitive fields", () => {
  assert.match(auditSource, /appendFile\(/);
  assert.match(auditSource, /createHash\("sha256"\)/);
  assert.match(auditSource, /previousDigest/);
  assert.match(auditSource, /forbiddenKeyPattern/);
  assert.match(auditSource, /forbiddenValuePattern/);
  assert.match(auditSource, /mode:\s*0o600/);
  assert.doesNotMatch(auditSource, /writeFile\(|truncate\(|unlink\(|rm\(/);
  assert.doesNotMatch(auditPageSource, /JSON\.stringify\(entry\.payload/);
  assert.doesNotMatch(auditPageSource, /<pre[^>]*>.*payload/s);
});

test("review: local shutdown blocks before activation, credential requirement and transport", () => {
  const controlCheck = snapshotSource.indexOf("const connectionControl = await");
  const activation = snapshotSource.indexOf("const activation = buildMexcReadOnlyCredentialActivationReport");
  const credentials = snapshotSource.indexOf("const credentials = requireMexcReadOnlyCredentials");
  const transport = snapshotSource.indexOf("requestMexcPrivateRead(");
  assert.ok(controlCheck >= 0);
  assert.ok(activation > controlCheck);
  assert.ok(credentials > controlCheck);
  assert.ok(transport > credentials);
  assert.match(snapshotSource, /connectionControl\.localPrivateReadsBlocked/);
  assert.match(snapshotSource, /scrubMexcPrivateEnvironmentForLocalSeal/);
  assert.match(controlSource, /control-integrity-failed/);
  assert.match(controlSource, /state:\s*"sealed"/);
  assert.doesNotMatch(controlSource, /requestMexcPrivateRead|fetch\(/);
  assert.match(layoutSource, /Private MEXC reads are locally sealed/);
  assert.match(controlPageSource, /not reversible from the browser/);
});

test("review: browser-visible Account Companion sources do not contain credential access", () => {
  const browserVisible = [
    accountPageSource,
    previewPageSource,
    auditPageSource,
    controlPageSource,
    layoutSource,
  ].join("\n");
  assert.doesNotMatch(browserVisible, /process\.env\.OWNER_MEXC_READONLY_API_(?:KEY|SECRET)/);
  assert.doesNotMatch(browserVisible, /apiSecret\s*[:=]/);
  assert.doesNotMatch(browserVisible, /Signature\s*[:=]/);
  assert.doesNotMatch(browserVisible, /authorization\s*[:=]/i);
});
