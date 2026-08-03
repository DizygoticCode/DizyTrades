import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import { productionResponseHeaders } from "../next.config.ts";

const repositoryRoot = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, repositoryRoot), "utf8");
const runtimeVersion = read(".node-version").trim();
const packageJson = JSON.parse(read("package.json"));

const workflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/render-rehearsal.yml",
  ".github/workflows/isolated-recovery-rehearsal.yml",
];

test("one exact Node runtime is shared by package, Render and every workflow", () => {
  assert.match(runtimeVersion, /^22\.\d+\.\d+$/);
  assert.equal(packageJson.engines.node, runtimeVersion);
  assert.match(read(".npmrc"), /^engine-strict=true$/m);

  const render = read("render.yaml");
  assert.match(
    render,
    new RegExp(`key: NODE_VERSION\\n\\s+value: ${runtimeVersion.replaceAll(".", "\\.")}`),
  );
  for (const path of workflowPaths) {
    const workflow = read(path);
    assert.match(
      workflow,
      /node-version-file:\s*["']?\.node-version["']?/,
      `${path} must use .node-version`,
    );
    assert.doesNotMatch(
      workflow,
      /node-version:\s*["']?22(?:["']|\s|$)/,
      `${path} must not float on the Node 22 major`,
    );
  }
});

test("production blueprint remains simulation-only and hash-only", () => {
  const render = read("render.yaml");
  assert.match(
    render,
    /key: LIVE_TRADING_ENABLED\n\s+value: ["']false["']/,
  );
  assert.match(
    render,
    /key: ALLOW_TEST_PLAINTEXT_PASSWORDS\n\s+value: ["']false["']/,
  );
  assert.doesNotMatch(render, /^\s*- key: ROB_PASSWORD\s*$/m);
  assert.doesNotMatch(render, /^\s*- key: FRIEND_PASSWORD\s*$/m);
  assert.match(render, /^\s*- key: ROB_PASSWORD_HASH\s*$/m);
  assert.match(render, /^\s*- key: FRIEND_PASSWORD_HASH\s*$/m);
  assert.doesNotMatch(render, /MEXC_(?:API_KEY|SECRET|PRIVATE_KEY)/);
});

test("global response headers retain the browser security boundary", () => {
  const headers = new Map(
    productionResponseHeaders.map(({ key, value }) => [key.toLowerCase(), value]),
  );
  assert.equal(headers.size, productionResponseHeaders.length);
  assert.equal(headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(
    headers.get("permissions-policy"),
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
  assert.equal(
    headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(
    headers.get("strict-transport-security") ?? "",
    /^max-age=31536000/,
  );

  const csp = headers.get("content-security-policy") ?? "";
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "wss://contract.mexc.com",
    "https://*.tradingview.com",
  ]) {
    assert.ok(csp.includes(directive), `CSP is missing ${directive}`);
  }
});

test("dependency maintenance is bounded and low-noise", () => {
  const dependabot = read(".github/dependabot.yml");
  assert.equal((dependabot.match(/package-ecosystem:/g) ?? []).length, 2);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.equal((dependabot.match(/interval: monthly/g) ?? []).length, 2);
  assert.match(dependabot, /open-pull-requests-limit: 3/);
  assert.match(dependabot, /open-pull-requests-limit: 2/);
});

function trackedSourceFiles() {
  const ignoredDirectories = new Set([
    ".git",
    ".next",
    "artifacts",
    "node_modules",
    "test-results",
  ]);
  const rootPath = new URL(repositoryRoot).pathname;
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      if (ignoredDirectories.has(name)) continue;
      const path = join(directory, name);
      const info = statSync(path);
      if (info.isDirectory()) visit(path);
      else files.push(relative(rootPath, path).replaceAll("\\", "/"));
    }
  };
  visit(rootPath);
  return files;
}

test("repository contains no committed environment, backup or database payload", () => {
  assert.equal(existsSync(new URL(".env", repositoryRoot)), false);
  const forbidden = trackedSourceFiles().filter((path) =>
    /(^|\/)(?:\.env(?:\..+)?|dizytrades-backup-.*\.json|.*\.(?:sqlite|sqlite3|db))$/i.test(
      path,
    ),
  );
  assert.deepEqual(forbidden, []);
});
