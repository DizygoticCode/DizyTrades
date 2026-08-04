import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const root = process.cwd();
const modulePath = "app/lib/mexc-owner-account-companion.ts";

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

test("owner companion delegates only the reviewed risk-limits read", () => {
  const source = text(modulePath);
  assert.match(source, /^import "server-only";/);
  assert.match(source, /refreshOwnerMexcAccountSnapshot/);
  assert.match(source, /endpoint:\s*"risk-limits"/);
  assert.match(source, /requestMexcPrivateRead/);
  assert.match(source, /buildMexcAccountRiskContext/);
  assert.doesNotMatch(source, /createHmac|\bApiKey\b|\bSignature\b/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(
    source,
    /\/api\/v1\/private\/(?:order\/|position\/(?:change|submit|cancel)|account\/(?:transfer|withdraw))/i,
  );
});

test("owner companion has no API-route or client-component consumer", () => {
  const modulePattern = /mexc-owner-account-companion/;
  const apiFiles = filesBelow("app/api").filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  for (const path of apiFiles) assert.doesNotMatch(text(path), modulePattern, path);

  const appFiles = filesBelow("app").filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  for (const path of appFiles) {
    const source = text(path);
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    assert.doesNotMatch(source, modulePattern, path);
  }
});
