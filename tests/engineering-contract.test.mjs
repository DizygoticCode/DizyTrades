import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { productionResponseHeaders } from "../next.config.ts";

const repositoryRoot = new URL("../", import.meta.url);
const repositoryRootPath = fileURLToPath(repositoryRoot);
const read = (path) => readFileSync(new URL(path, repositoryRoot), "utf8");
const runtimeVersion = read(".node-version").trim();
const packageJson = JSON.parse(read("package.json"));

const workflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/isolated-recovery-rehearsal.yml",
];

test("one exact Node runtime is shared by package and every workflow", () => {
  assert.match(runtimeVersion, /^22\.\d+\.\d+$/);
  assert.equal(packageJson.engines.node, runtimeVersion);
  assert.match(read(".npmrc"), /^engine-strict=true$/m);

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

test("repository deployment defaults remain simulation-only and secret-free", () => {
  const environment = read(".env.example");
  assert.match(environment, /^LIVE_TRADING_ENABLED=false$/m);
  assert.match(environment, /^MEXC_WRITE_PROVIDER_ENABLED=false$/m);
  assert.match(environment, /^ALLOW_TEST_PLAINTEXT_PASSWORDS=false$/m);
  assert.match(environment, /^ROB_PASSWORD=$/m);
  assert.match(environment, /^FRIEND_PASSWORD=$/m);
  assert.match(environment, /^ROB_PASSWORD_HASH=/m);
  assert.match(environment, /^FRIEND_PASSWORD_HASH=/m);
  assert.match(environment, /^MEXC_EXECUTION_ACCESS_KEY=$/m);
  assert.match(environment, /^MEXC_EXECUTION_SECRET_KEY=$/m);
  assert.doesNotMatch(environment, /^MEXC_EXECUTION_(?:ACCESS|SECRET)_KEY=.+$/m);
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
  assert.doesNotMatch(
    csp,
    /wss:\/\/api\.mexc\.com/,
    "MEXC REST origin must not be accepted as a WebSocket origin",
  );
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
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRootPath,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

test("repository contains no committed environment, backup or database payload", () => {
  const tracked = trackedSourceFiles();
  assert.equal(tracked.includes(".env"), false);
  assert.equal(tracked.includes(".env.example"), true);
  const forbidden = tracked.filter((path) => {
    const name = path.split("/").at(-1) ?? "";
    const environmentPayload =
      name === ".env" ||
      (name.startsWith(".env.") && name !== ".env.example");
    return (
      environmentPayload ||
      /^dizytrades-backup-.*\.json$/i.test(name) ||
      /\.(?:sqlite|sqlite3|db)$/i.test(name)
    );
  });
  assert.deepEqual(forbidden, []);
});