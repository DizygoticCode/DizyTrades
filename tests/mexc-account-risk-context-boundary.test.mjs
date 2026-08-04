import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const root = process.cwd();
const modulePath = "app/lib/mexc-account-risk-context.ts";

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

test("risk context is a pure server-only interpretation layer", () => {
  const source = text(modulePath);
  assert.match(source, /^import "server-only";/);
  assert.match(source, /endpoint !== "risk-limits"/);
  assert.match(source, /permission !== "trade-read"/);
  assert.match(source, /informationalOnly:\s*true/);
  assert.match(source, /liquidationOracle:\s*false/);
  assert.match(source, /executionPermission:\s*false/);
  assert.doesNotMatch(source, /createHmac|\bApiKey\b|\bSignature\b/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(
    source,
    /\/api\/v1\/private\/(?:order\/|position\/(?:change|submit|cancel)|account\/(?:transfer|withdraw))/i,
  );
});

test("risk context is absent from API routes and client components", () => {
  const modulePattern = /mexc-account-risk-context/;
  const apiFiles = filesBelow("app/api").filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  for (const path of apiFiles) assert.doesNotMatch(text(path), modulePattern, path);

  const appFiles = filesBelow("app").filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  for (const path of appFiles) {
    const source = text(path);
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    assert.doesNotMatch(source, modulePattern, path);
  }
});
