import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const text = (path) => readFileSync(join(root, path), "utf8");
const writeProvisioningFacade = "app/lib/execution/write-provisioning-authority.ts";
const productionCredentialLease = "app/lib/execution/internal/production-write-credential-lease.ts";
const excludedSourceDirectories = new Set([".git", ".next", "coverage", "node_modules", "playwright-report", "test-results", "tests"]);
function filesBelow(path) {
  const output = [];
  const visit = (current) => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current)) {
      const child = join(current, entry);
      const childPath = relative(root, child).replaceAll("\\", "/");
      if (statSync(child).isDirectory()) { if (!excludedSourceDirectories.has(childPath.split("/")[0])) visit(child); }
      else output.push(relative(root, child).replaceAll("\\", "/"));
    }
  };
  visit(join(root, path)); return output;
}
const moduleSpecifiers = (source) => [
  ...source.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g),
  ...source.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g),
  ...source.matchAll(/\bimport\s*\(\s*`([^`$]*)`\s*\)/g),
].map((match) => match[1]);
function importsExecutionInternal(path, source) {
  return moduleSpecifiers(source).some((specifier) => {
    if (specifier.startsWith(".")) {
      const target = relative(root, resolve(root, dirname(path), specifier)).replaceAll("\\", "/");
      return target === "app/lib/execution/internal" || target.startsWith("app/lib/execution/internal/");
    }
    const target = normalize(specifier).replaceAll("\\", "/");
    return target === "execution/internal" || target.includes("/execution/internal/") || target.endsWith("/execution/internal");
  });
}

test("execution boundary is server-only and isolates network signing to the approved writer", () => {
  const files = filesBelow("app/lib/execution");
  assert.deepEqual(files.filter((path) => path.endsWith("adapter.ts")), ["app/lib/execution/internal/adapter.ts"]);
  for (const path of files) {
    const source = text(path); assert.match(source, /^import "server-only";/, path);
    if (path.endsWith("mexc-execution-writer.ts")) {
      assert.match(source, /https:\/\/api\.mexc\.com/); assert.match(source, /createHmac/); assert.doesNotMatch(source, /\/api\/v1\/private\/order\/submit/);
    } else if (path.endsWith("render-egress-proof-authority.ts")) {
      assert.match(source, /const PROBES=\["https:\/\/api4\.ipify\.org","https:\/\/checkip\.amazonaws\.com"\] as const;/, path);
      assert.match(source, /method:"GET"/, path); assert.match(source, /redirect:"error"/, path);
      assert.doesNotMatch(source, /createHmac|\bApiKey\b|\bSignature\b|https:\/\/api\.mexc\.com/, path);
      assert.doesNotMatch(source, /\/api\/v1\/private\/(?:order|position\/(?:change|submit|cancel)|account\/(?:transfer|withdraw))/i, path);
      assert.doesNotMatch(source, /(?:WRITE|TRADING)_(?:API_)?(?:KEY|SECRET)|PRIVATE_KEY/, path);
    } else if (path.endsWith("static-host-egress-proof-authority.ts")) {
      assert.match(source, /const PROBES = \["https:\/\/api4\.ipify\.org", "https:\/\/checkip\.amazonaws\.com"\] as const;/, path);
      assert.match(source, /method:\s*"GET"/, path); assert.match(source, /redirect:\s*"error"/, path);
      assert.doesNotMatch(source, /createHmac|\bApiKey\b|\bSignature\b|https:\/\/api\.mexc\.com/, path);
      assert.doesNotMatch(source, /\/api\/v1\/private\/(?:order|position\/(?:change|submit|cancel)|account\/(?:transfer|withdraw))/i, path);
      assert.doesNotMatch(source, /(?:WRITE|TRADING)_(?:API_)?(?:KEY|SECRET)|PRIVATE_KEY/, path);
    } else if (path === productionCredentialLease) {
      assert.match(source, /createDecipheriv/, path);
      assert.match(source, /createHmac/, path);
      assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|\bApiKey\b|\bSignature\b/, path);
      assert.doesNotMatch(source, /\/api\/v1\/private\/(?:order|position\/(?:change|submit|cancel)|account\/(?:transfer|withdraw))/i, path);
      assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i, path);
    } else {
      assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|createHmac|\bApiKey\b|\bSignature\b/, path);
      assert.doesNotMatch(source, /\/api\/v1\/private\/(?:order|position\/(?:change|submit|cancel)|account\/(?:transfer|withdraw))/i, path);
      assert.doesNotMatch(source, /(?:WRITE|TRADING)_(?:API_)?(?:KEY|SECRET)|PRIVATE_KEY/, path);
    }
  }
  assert.match(text("app/lib/execution/internal/adapter.ts"), /NonExecutingExecutionAdapter/);
  assert.doesNotMatch(text("app/lib/execution/internal/adapter.ts"), /Real|Live|Mexc/);
  const provider = text("app/lib/execution/internal/provider.ts"); assert.equal((provider.match(/class NonExecutingProvider/g) ?? []).length, 1);
  assert.doesNotMatch(provider, /\bfetch\s*\(|axios|https?:\/\/|createHmac|sign(?:er|ature)|Mexc/i);
});

test("provider mechanics isolate the writer while the sole credential lease owns custody and provisioning access", () => {
  for (const path of filesBelow("app/lib/execution")) {
    const source = text(path);
    if (path === productionCredentialLease) {
      assert.match(source, /credential-custody\/write-credential/, path);
      assert.match(source, /openProductionMexcWriteProvisioningAuthority/, path);
      assert.match(source, /createDecipheriv/, path);
      assert.doesNotMatch(source, /mexc-private|requestMexc|\bfetch\s*\(|https?:\/\/|method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i, path);
    } else {
      assert.doesNotMatch(source, /credential-(?:custody|provisioning)|mexc-private|requestMexc|decryptCredential/i, path);
    }
    if (path.endsWith("mexc-execution-writer.ts")) assert.equal((source.match(/method:\s*"POST"/g)??[]).length,1);
    else assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i, path);
  }
});

test("synthetic reconciliation is server-only, transport-free and absent from production composition", () => {
  const reconciliation = text("app/lib/execution/internal/reconciliation.ts"); assert.match(reconciliation, /^import "server-only";/);
  assert.doesNotMatch(reconciliation, /\bfetch\s*\(|axios|https?:\/\/|createHmac|sign(?:er|ature)|credential|custody|provisioning|Mexc/i);
  assert.doesNotMatch(text("app/lib/execution/internal/composition.ts"), /syntheticObservation|would-observe/);
});

test("no route, client or paper module imports execution/provider internals", () => {
  for (const path of filesBelow("app").filter((path) => /\.[cm]?[jt]sx?$/.test(path))) {
    const source = text(path); if (path.startsWith("app/api/") || /^\s*["']use client["'];/m.test(source)) assert.doesNotMatch(source, /lib\/execution|\.\/execution\//, path);
  }
  for (const path of filesBelow("app").filter((path) => /paper/i.test(path))) if (/\.[cm]?[jt]sx?$/.test(path)) assert.equal(importsExecutionInternal(path, text(path)), false, path);
});

test("application code has one execution implementation import path plus one audited secret-free provisioning and activation authority bridge", () => {
  const applicationFiles = filesBelow(".").filter((path) => /\.[cm]?[jt]sx?$/.test(path)
    && !path.startsWith("app/lib/execution/internal/") && path !== "app/lib/execution/boundary.ts" && path !== writeProvisioningFacade);
  assert.ok(applicationFiles.includes("instrumentation.ts"), "root server entrypoints are scanned");
  for (const path of applicationFiles) assert.equal(importsExecutionInternal(path, text(path)), false, `${path} imports isolated implementation`);

  const facade = text(writeProvisioningFacade);
  assert.deepEqual(moduleSpecifiers(facade).filter((specifier) => specifier.startsWith("./internal/")), [
    "./internal/render-egress-proof-authority",
    "./internal/execution-host-egress-authority",
    "./internal/write-credential-attestation-authority",
    "./internal/write-credential-authority-store",
  ]);
  assert.match(facade, /activateWriteCredentialAuthority/);
  assert.doesNotMatch(facade, /accessKey|secretKey|credentials\s*:|credential-custody|mexc-execution-writer|production-write-composition/);
  assert.doesNotMatch(facade, /activateProductionWriteCredentialAuthority|\bfetch\s*\(|https?:\/\/|method:\s*["']POST["']/i);

  for (const source of ['export { ExecutionAirlockService } from "./internal/service";', 'import service from "../execution/internal/service";', 'export * from "../../lib/execution/internal/audit";', 'const service = await import("./internal/service");', 'const service = require("./internal/service");', 'export * from "@/lib/execution/internal/service";']) assert.equal(importsExecutionInternal("app/lib/execution/bridge.ts", source), true, source);
  for (const source of ['import "./app/lib/execution/internal/testing";', 'export { createServerExecutionBoundary } from "./app/lib/execution/internal/composition";', 'const boundary = await import("./app/lib/execution/internal/boundary-service");', 'const testing = await import(`./app/lib/execution/internal/testing`);', 'const service = require("./app/lib/execution/internal/service");', 'export * from "@/lib/execution/internal/audit";']) assert.equal(importsExecutionInternal("instrumentation.ts", source), true, source);
  const boundarySource = text("app/lib/execution/boundary.ts"); assert.match(boundarySource, /export const executionBoundary = createServerExecutionBoundary\(\)/); assert.doesNotMatch(boundarySource, /export class|export type .*Dependencies|constructor\s*\(/);
  assert.equal(filesBelow("app/api").some((path) => /execution/i.test(path)), false);
});

test("production remains false, private MEXC is GET-only and paper routes remain simulation-only", () => {
  assert.match(text("render.yaml"), /- key: LIVE_TRADING_ENABLED\s+value: "false"/); assert.match(text(".env.example"), /^LIVE_TRADING_ENABLED=false$/m);
  const privateRead = text("app/lib/mexc-private-readonly.ts"); assert.match(privateRead, /method: "GET"/); assert.doesNotMatch(privateRead, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  const paperRoute = text("app/api/manual-paper/route.ts"); assert.match(paperRoute, /submitManualOrder/); assert.doesNotMatch(paperRoute, /lib\/execution|mexc-private-readonly|requestMexcPrivateRead/);
  for (const path of filesBelow("app/api").filter((path) => /paper.*route\.ts$|manual-paper\/route\.ts$/.test(path))) assert.doesNotMatch(text(path), /lib\/execution/, path);
});

test("repository exposes only the approved modern create endpoint and no execution API route", () => {
  const files = filesBelow("app").filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  for (const path of files) { const source = text(path); if(path.endsWith("mexc-execution-writer.ts")) { assert.match(source,/\/api\/v1\/private\/order\/create/); assert.doesNotMatch(source,/\/api\/v1\/private\/order\/(?:submit|cancel|change)/i); } else assert.doesNotMatch(source, /\/api\/v1\/private\/order\/(?:submit|cancel|change|create)/i, path); }
  assert.equal(filesBelow("app/api/execution").length, 0);
});