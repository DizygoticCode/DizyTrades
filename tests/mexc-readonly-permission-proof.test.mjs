import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import {
  MEXC_READONLY_PERMISSION_PROOF_VERSION,
  assertMexcReadOnlySoftwareBoundary,
  buildMexcReadOnlyPermissionProof,
} from "../app/lib/mexc-readonly-permission-proof.ts";
import {
  mexcPrivateReadCapabilityManifest,
} from "../app/lib/mexc-private-readonly.ts";

const root = process.cwd();

const expectedEndpoints = [
  {
    id: "all-assets",
    method: "GET",
    path: "/api/v1/private/account/assets",
    permission: "trade-read",
  },
  {
    id: "open-positions",
    method: "GET",
    path: "/api/v1/private/position/open_positions",
    permission: "trade-read",
  },
  {
    id: "risk-limits",
    method: "GET",
    path: "/api/v1/private/account/risk_limit",
    permission: "trade-read",
  },
  {
    id: "single-asset",
    method: "GET",
    path: "/api/v1/private/account/asset/{currency}",
    permission: "account-read",
  },
  {
    id: "tiered-fee-rate",
    method: "GET",
    path: "/api/v1/private/account/tiered_fee_rate",
    permission: "trade-read",
  },
];

const foundationFiles = [
  "app/lib/mexc-private-readonly.ts",
  "app/lib/mexc-account-state.ts",
  "app/lib/mexc-account-state-availability.ts",
  "app/lib/mexc-dizypaper-reconciliation.ts",
  "app/lib/mexc-shadow-order-preview.ts",
  "app/lib/mexc-shadow-audit.ts",
  "app/lib/mexc-readonly-permission-proof.ts",
];

function text(path) {
  return readFileSync(join(root, path), "utf8");
}

function filesBelow(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  const output = [];
  const visit = (current) => {
    for (const entry of readdirSync(current)) {
      const child = join(current, entry);
      if (statSync(child).isDirectory()) visit(child);
      else output.push(relative(root, child).replaceAll("\\", "/"));
    }
  };
  visit(absolute);
  return output.sort();
}

test("runtime proof matches the exact reviewed GET/read endpoint matrix", () => {
  const proof = buildMexcReadOnlyPermissionProof();
  assert.equal(proof.proofVersion, MEXC_READONLY_PERMISSION_PROOF_VERSION);
  assert.equal(proof.generatedFrom, "runtime-capability-manifest");
  assert.equal(proof.baseOrigin, "https://contract.mexc.com");
  assert.deepEqual(proof.methods, ["GET"]);
  assert.deepEqual(proof.permissions, ["account-read", "trade-read"]);
  assert.deepEqual(proof.endpoints, expectedEndpoints);
  assert.equal(proof.writeCapability, false);
  assert.equal(proof.softwareBoundaryProved, true);
  assert.equal(proof.realCredentialConfigured, false);
  assert.equal(proof.realKeyPermissionAttested, false);
  assert.equal(proof.credentialAttestationStatus, "not-performed");
  assert.match(proof.proofDigest, /^[a-f0-9]{64}$/);
  assert.ok(Object.values(proof.checks).every(Boolean));
  assert.deepEqual(assertMexcReadOnlySoftwareBoundary(), proof);
});

test("runtime proof is deterministic and changes when capability facts change", () => {
  const first = buildMexcReadOnlyPermissionProof();
  const second = buildMexcReadOnlyPermissionProof();
  assert.deepEqual(second, first);
  assert.equal(second.proofDigest, first.proofDigest);

  const manifest = mexcPrivateReadCapabilityManifest();
  assert.equal(manifest.writeCapability, false);
  assert.equal(manifest.endpoints.length, expectedEndpoints.length);
  assert.ok(manifest.endpoints.every((endpoint) => endpoint.method === "GET"));
});

test("private transport has one pinned origin and no write method or body", () => {
  const source = text("app/lib/mexc-private-readonly.ts");
  assert.match(
    source,
    /MEXC_CONTRACT_PRIVATE_BASE_URL\s*=\s*"https:\/\/contract\.mexc\.com"/,
  );
  assert.match(source, /method:\s*"GET"/);
  assert.match(source, /cache:\s*"no-store"/);
  assert.match(source, /redirect:\s*"error"/);
  assert.doesNotMatch(source, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(source, /\bbody\s*:/);
  assert.doesNotMatch(
    source,
    /\/api\/v1\/private\/(?:order\/|position\/change|account\/(?:transfer|withdraw))/i,
  );
});

test("credentialless foundation modules contain no private write transport", () => {
  const forbiddenRoute =
    /\/api\/v1\/private\/(?:order\/|position\/(?:change|submit|cancel)|account\/(?:transfer|withdraw))/i;
  const forbiddenMethod = /method:\s*"(?:POST|PUT|PATCH|DELETE)"/;

  for (const path of foundationFiles) {
    const source = text(path);
    assert.doesNotMatch(source, forbiddenRoute, path);
    assert.doesNotMatch(source, forbiddenMethod, path);
    if (path !== "app/lib/mexc-private-readonly.ts") {
      assert.doesNotMatch(source, /createHmac|\bApiKey\b|\bSignature\b/, path);
      assert.doesNotMatch(source, /\bfetch\s*\(/, path);
    }
  }

  const preview = text("app/lib/mexc-shadow-order-preview.ts");
  assert.match(preview, /hypotheticalOnly:\s*true/);
  assert.match(preview, /executable:\s*false/);
  assert.doesNotMatch(preview, /submitMexc|executeMexc|placeOrder|cancelOrder/);
});

test("no browser or API route exposes the private-account foundation", () => {
  const apiFiles = filesBelow("app/api").filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  for (const path of apiFiles) {
    const source = text(path);
    assert.doesNotMatch(
      source,
      /mexc-(?:private-readonly|account-state|dizypaper-reconciliation|shadow-order-preview|shadow-audit|readonly-permission-proof)/,
      path,
    );
    assert.doesNotMatch(
      source,
      /MEXC_(?:PRIVATE_)?(?:API_)?(?:KEY|SECRET)|MEXC_SECRET_KEY/,
      path,
    );
  }

  const appFiles = filesBelow("app").filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  for (const path of appFiles) {
    const source = text(path);
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    assert.doesNotMatch(
      source,
      /mexc-(?:private-readonly|account-state|dizypaper-reconciliation|shadow-order-preview|shadow-audit|readonly-permission-proof)/,
      path,
    );
  }
});

test("deployment configuration contains no MEXC private credential slot", () => {
  const environment = text(".env.example");
  const render = text("render.yaml");
  const privateCredentialName =
    /MEXC_(?:PRIVATE_)?(?:API_)?(?:KEY|SECRET)|MEXC_SECRET_KEY|MEXC_ACCESS_KEY/;

  assert.doesNotMatch(environment, privateCredentialName);
  assert.doesNotMatch(render, privateCredentialName);
  assert.match(environment, /^LIVE_TRADING_ENABLED=false$/m);
  assert.match(render, /key:\s*LIVE_TRADING_ENABLED\s*\n\s*value:\s*"false"/);
});

test("proof report itself contains no credential or executable request", () => {
  const serialised = JSON.stringify(buildMexcReadOnlyPermissionProof());
  assert.doesNotMatch(
    serialised,
    /apiKey|apiSecret|signature|authorization|requestBody|orderPayload/i,
  );
  assert.doesNotMatch(serialised, /POST|PUT|PATCH|DELETE/);
  assert.match(serialised, /not-performed/);
  assert.match(serialised, /"realKeyPermissionAttested":false/);
});
