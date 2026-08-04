import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auditSource = await readFile(
  new URL("../app/lib/mexc-owner-shadow-audit.ts", import.meta.url),
  "utf8",
);
const reconciliationSource = await readFile(
  new URL("../app/lib/mexc-owner-account-reconciliation.ts", import.meta.url),
  "utf8",
);
const previewSource = await readFile(
  new URL("../app/lib/mexc-owner-order-preview.ts", import.meta.url),
  "utf8",
);
const pageSource = await readFile(
  new URL("../app/account/audit/page.tsx", import.meta.url),
  "utf8",
);
const layoutSource = await readFile(
  new URL("../app/account/layout.tsx", import.meta.url),
  "utf8",
);

test("shadow audit is append-only, hash-chained and bounded", () => {
  assert.match(auditSource, /appendFile\(/);
  assert.match(auditSource, /previousDigest/);
  assert.match(auditSource, /createHash\("sha256"\)/);
  assert.match(auditSource, /MAX_LEDGER_BYTES/);
  assert.match(auditSource, /MAX_EVENT_BYTES/);
  assert.match(auditSource, /mode:\s*0o600/);
  assert.match(auditSource, /mode:\s*0o700/);
  assert.doesNotMatch(auditSource, /writeFile\(|rename\(|truncate\(|rm\(|unlink\(/);
  assert.doesNotMatch(auditSource, /requestMexcPrivateRead|requireMexcReadOnlyCredentials/);
  assert.doesNotMatch(auditSource, /submitManualOrder|closeManual|reverseManual|flattenManual/);
  assert.doesNotMatch(auditSource, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
});

test("reconciliation and preview fail closed when immutable persistence fails", () => {
  assert.match(reconciliationSource, /kind:\s*"account-reconciliation"/);
  assert.match(previewSource, /kind:\s*"hypothetical-order-preview"/);
  assert.match(reconciliationSource, /"audit-persistence-failed"/);
  assert.match(previewSource, /"audit-persistence-failed"/);
  assert.match(previewSource, /executable:\s*false/);
  assert.match(previewSource, /exchangeWriteCapability:\s*"none"/);
  assert.doesNotMatch(`${reconciliationSource}\n${previewSource}`, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
});

test("audit viewer is owner-only and never renders the complete payload", () => {
  assert.match(pageSource, /user\.role\s*!==\s*"owner"/);
  assert.match(pageSource, /redirect\("\/terminal"\)/);
  assert.match(layoutSource, /href="\/account\/audit"/);
  assert.doesNotMatch(pageSource, /JSON\.stringify\(entry\.payload/);
  assert.doesNotMatch(pageSource, /<pre[^>]*>.*payload/s);
  assert.doesNotMatch(pageSource, /export\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)/);
});
