import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const text = (path) => readFileSync(join(root, path), "utf8");

test("production reconciliation consumes the single-use caller assertion exactly once", () => {
  const composition = text("app/lib/execution/internal/composition.ts");
  const callerAssertion = text("app/lib/execution/internal/caller-assertion.ts");

  assert.equal((callerAssertion.match(/productionStore\.consume\(assertion\)/g) ?? []).length, 1);
  assert.equal((composition.match(/verifyProductionExecutionCaller\s*\(/g) ?? []).length, 1);
  assert.doesNotMatch(composition, /authenticateInternalCaller:\s*verifyProductionExecutionCaller/);
  assert.match(composition, /authenticateInternalCaller:\s*\(assertion\)\s*=>\s*caller/);
  assert.match(composition, /assertion\.assertionId\s*===\s*stableRequest\.callerAssertion\.assertionId/);
  assert.match(composition, /const requestSnapshot = structuredClone\(request\)/);
});
