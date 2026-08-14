import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const text = (path) => readFileSync(join(root, path), "utf8");

test("ownership ceremony remains server-only, credential-free, and non-executing", () => {
  const store = text("app/lib/execution/internal/ownership-store.ts");
  const ceremony = text("app/lib/execution/internal/ownership-ceremony.ts");
  const composition = text("app/lib/execution/internal/composition.ts");
  const transport = text("app/lib/mexc-provider-readback.ts");
  assert.match(store, /^import "server-only";/);
  assert.match(ceremony, /^import "server-only";/);
  assert.match(ceremony, /readAuthoritativeMexcAccountRisk/);
  assert.doesNotMatch(store, /api[_-]?key|secret|credential|session|assertion/i);
  assert.doesNotMatch(composition, /ExecutionOwnershipCeremony|\.activate\(|\.revoke\(/);
  assert.match(transport, /method: "GET"/);
  assert.doesNotMatch(transport, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
});

test("no public ownership mutation route or executing outcome is introduced", () => {
  const files = [
    "app/lib/execution/internal/ownership-store.ts",
    "app/lib/execution/internal/ownership-ceremony.ts",
    "app/lib/execution/internal/composition.ts",
    "app/lib/execution/internal/boundary-service.ts",
  ];
  for (const file of files) assert.doesNotMatch(text(file), /executed\s*:\s*true/);
  const routeFiles = readdirSync(join(root, "app/api"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "route.ts")
    .map((entry) => entry.parentPath ?? entry.path);
  assert.equal(routeFiles.some((path) => /ownership|activation|revocation/i.test(path)), false);
});
