import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const root = process.cwd();
const text = (path) => readFileSync(join(root, path), "utf8");
const filesBelow = (path) => {
  const output = [];
  const visit = (current) => {
    for (const entry of readdirSync(current)) {
      const child = join(current, entry);
      if (statSync(child).isDirectory()) visit(child);
      else output.push(relative(root, child).replaceAll("\\", "/"));
    }
  };
  visit(join(root, path));
  return output;
};

const storePath = "app/lib/execution/internal/day-start-equity-store.ts";
const authorityPath = "app/lib/execution/internal/day-start-equity-authority.ts";
const compositionPath = "app/lib/execution/internal/composition.ts";

test("day-start equity authority is server-only, durable and bounded to GET-only evidence", () => {
  for (const path of [storePath, authorityPath]) {
    const source = text(path);
    assert.match(source, /^import "server-only";/, path);
    assert.doesNotMatch(source, /\bfetch\s*\(|createHmac|ApiKey|Signature|MEXC_EXECUTION_(?:ACCESS|SECRET)|credential-custody|credential-provisioning/i, path);
    assert.doesNotMatch(source, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i, path);
    assert.doesNotMatch(source, /\/api\/v1\/private\/order\/(?:create|submit|cancel|change)/i, path);
  }
  const store = text(storePath);
  assert.match(store, /execution-day-start-equity\.sqlite/);
  assert.match(store, /PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;/);
  assert.match(store, /private poisoned = false/);
  assert.match(store, /EXECUTION_DAY_START_CAPTURE_WINDOW_MS = 5 \* 60 \* 1000/);
});

test("production composition owns riskSnapshot and does not wire the MEXC writer", () => {
  const composition = text(compositionPath);
  assert.match(composition, /createProductionExecutionDayStartEquityStore/);
  assert.match(composition, /captureAuthoritativeDayStartEquity/);
  assert.match(composition, /authoritativeRiskSnapshotFromDayStart/);
  assert.match(composition, /riskSnapshot:\s*authoritativeRiskSnapshot/);
  assert.doesNotMatch(composition, /mexc-execution-writer|ModernMexcReduceOnlyWriter|createMexcExecutionFetchTransport|MEXC_EXECUTION_ACCESS_KEY|MEXC_EXECUTION_SECRET_KEY/);
});

test("provider work remains suppressed behind existing kill-switch precedence", () => {
  const composition = text(compositionPath);
  const kill = composition.indexOf("executionKillSwitchReason(controls.switches(), caller)");
  const ownership = composition.indexOf("await proveOwnership(caller)");
  const reconciliation = composition.indexOf("await reconcile(");
  const baseline = composition.indexOf("captureAuthoritativeDayStartEquity(");
  assert.ok(kill >= 0 && ownership > kill && reconciliation > ownership && baseline > reconciliation);
  assert.match(composition, /if \(providerReadsAllowed\)/);
});

test("repository still exposes no execution API route and production activation flags remain false", () => {
  const apiFiles = filesBelow("app/api");
  assert.equal(apiFiles.some((path) => /(?:^|\/)execution(?:\/|\.|$)/i.test(path)), false);
  assert.match(text("render.yaml"), /- key: LIVE_TRADING_ENABLED\s+value: "false"/);
  assert.match(text("render.yaml"), /- key: MEXC_WRITE_PROVIDER_ENABLED\s+value: "false"/);
  assert.match(text(".env.example"), /^LIVE_TRADING_ENABLED=false$/m);
  assert.match(text(".env.example"), /^MEXC_WRITE_PROVIDER_ENABLED=false$/m);
});

test("day-start slice adds no new provider write endpoint or executed:true result", () => {
  for (const path of [storePath, authorityPath, compositionPath, "app/lib/execution/internal/production-reconciliation.ts"]) {
    const source = text(path);
    assert.doesNotMatch(source, /executed\s*:\s*true/);
    assert.doesNotMatch(source, /\/api\/v1\/private\/order\/(?:create|submit|cancel|change)/i);
  }
});
