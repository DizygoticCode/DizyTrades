import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const custody = readFileSync("app/lib/credential-custody/index.ts", "utf8");
const executionFiles = readdirSync("app/lib/execution", { recursive: true }).filter((name) => String(name).endsWith(".ts"));
const execution = executionFiles.map((name) => readFileSync(`app/lib/execution/${name}`, "utf8")).join("\n");

function productionSource(directory) {
  return readdirSync(directory, { recursive: true }).filter((name) => /\.(?:ts|tsx)$/.test(String(name)))
    .map((name) => readFileSync(join(directory, String(name)), "utf8")).join("\n");
}

test("custody stays server-only, networkless, signerless, and reaches execution only through the audited lease", () => {
  assert.match(custody, /^import "server-only";/);
  for (const forbidden of ["use client", "fetch(", "mexc-private", "execution/", "NEXT_PUBLIC_", "signRequest", "placeOrder", "cancelOrder", "amendOrder"])
    assert.equal(custody.includes(forbidden), false, forbidden);
  assert.deepEqual(
    executionFiles.filter((name) => readFileSync(`app/lib/execution/${name}`, "utf8").includes("credential-custody")),
    ["internal/production-write-credential-lease.ts"],
  );
  assert.match(execution, /production-write-credential-lease/);
});

test("production API routes have no credential custody reference", () => {
  assert.equal(productionSource("app/api").includes("credential-custody"), false);
});

test("ordinary user backup and export sources exclude credential custody", () => {
  const backupSources = [
    "app/lib/user-backup-model.ts", "app/lib/user-backup-store.ts", "app/lib/user-backup-workspace.ts",
    "app/lib/manual-paper-backup.ts", "app/api/backup/export/route.ts", "app/api/backup/journal.csv/route.ts",
  ].map((name) => readFileSync(name, "utf8")).join("\n");
  for (const forbidden of ["credential-custody", "credential-custody.sqlite"])
    assert.equal(backupSources.includes(forbidden), false, forbidden);
});
