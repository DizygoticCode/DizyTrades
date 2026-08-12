import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const root = process.cwd();
const text = (path) => readFileSync(join(root, path), "utf8");
function filesBelow(path) {
  const output = [];
  const visit = (current) => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current)) {
      const child = join(current, entry);
      if (statSync(child).isDirectory()) visit(child);
      else output.push(relative(root, child).replaceAll("\\", "/"));
    }
  };
  visit(join(root, path));
  return output;
}

test("execution boundary is server-only and contains exactly one non-executing adapter", () => {
  const files = filesBelow("app/lib/execution");
  assert.deepEqual(files.filter((path) => path.endsWith("adapter.ts")), ["app/lib/execution/internal/adapter.ts"]);
  for (const path of files) {
    const source = text(path);
    assert.match(source, /^import "server-only";/, path);
    assert.doesNotMatch(source, /\bfetch\s*\(|https?:\/\/|createHmac|\bApiKey\b|\bSignature\b/, path);
    assert.doesNotMatch(source, /\/api\/v1\/private\/(?:order|position\/(?:change|submit|cancel)|account\/(?:transfer|withdraw))/i, path);
    assert.doesNotMatch(source, /(?:WRITE|TRADING)_(?:API_)?(?:KEY|SECRET)|PRIVATE_KEY/, path);
  }
  assert.match(text("app/lib/execution/internal/adapter.ts"), /NonExecutingExecutionAdapter/);
  assert.doesNotMatch(text("app/lib/execution/internal/adapter.ts"), /Real|Live|Mexc/);
});

test("no route or client module imports the execution airlock", () => {
  for (const path of filesBelow("app").filter((path) => /\.[cm]?[jt]sx?$/.test(path))) {
    const source = text(path);
    if (path.startsWith("app/api/") || /^\s*["']use client["'];/m.test(source)) {
      assert.doesNotMatch(source, /lib\/execution|\.\/execution\//, path);
    }
  }
});

test("application code has one execution implementation import path and no boundary bypass", () => {
  const implementationModules = ["adapter", "audit", "gate", "kill-switch", "policy", "preview", "service", "validation"];
  for (const path of filesBelow("app").filter((path) => /\.[cm]?[jt]sx?$/.test(path) && !path.startsWith("app/lib/execution/"))) {
    const source = text(path);
    for (const implementationModule of implementationModules) {
      assert.doesNotMatch(source, new RegExp(`lib/execution/${implementationModule}|execution/${implementationModule}`), `${path} bypasses boundary`);
    }
  }
  assert.match(text("app/lib/execution/boundary.ts"), /ExecutionAirlockService/);
  assert.match(text("app/lib/execution/boundary.ts"), /authenticateInternalCaller/);
  assert.match(text("app/lib/execution/boundary.ts"), /readKillSwitches/);
  assert.equal(filesBelow("app/api").some((path) => /execution/i.test(path)), false);
  for (const path of filesBelow("app").filter((path) => /\.[cm]?[jt]sx?$/.test(path) && !path.startsWith("app/lib/execution/internal/") && path !== "app/lib/execution/boundary.ts")) {
    assert.doesNotMatch(text(path), /execution\/internal\//, `${path} imports isolated implementation`);
  }
});

test("production remains false, private MEXC is GET-only and paper routes remain simulation-only", () => {
  assert.match(text("render.yaml"), /- key: LIVE_TRADING_ENABLED\s+value: "false"/);
  assert.match(text(".env.example"), /^LIVE_TRADING_ENABLED=false$/m);
  const privateRead = text("app/lib/mexc-private-readonly.ts");
  assert.match(privateRead, /method: "GET"/);
  assert.doesNotMatch(privateRead, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  const paperRoute = text("app/api/manual-paper/route.ts");
  assert.match(paperRoute, /submitManualOrder/);
  assert.doesNotMatch(paperRoute, /lib\/execution|mexc-private-readonly|requestMexcPrivateRead/);
  for (const path of filesBelow("app/api").filter((path) => /paper.*route\.ts$|manual-paper\/route\.ts$/.test(path))) {
    assert.doesNotMatch(text(path), /lib\/execution/, path);
  }
});

test("repository has no MEXC private order-write endpoint or execution API route", () => {
  const files = filesBelow("app").filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  for (const path of files) {
    const source = text(path);
    assert.doesNotMatch(source, /\/api\/v1\/private\/order\/(?:submit|cancel|change|create)/i, path);
  }
  assert.equal(filesBelow("app/api/execution").length, 0);
});
