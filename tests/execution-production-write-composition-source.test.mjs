import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/lib/execution/internal/production-write-composition.ts", import.meta.url),
  "utf8",
);

test("production composition has an explicit non-writing security-review boundary", () => {
  assert.doesNotMatch(source, /ModernMexcReduceOnlyWriter|createMexcExecutionFetchTransport/);
  assert.doesNotMatch(source, /readMexcExecutionCredentials|writer\.execute\s*\(/);
  assert.match(source, /return new ProductionMexcWriteComposition\(null\)/);
  assert.match(source, /syntheticCandidateHandoff\.accept\(intent, evidence\)/);
});

test("candidate preview is distinct from actual writer eligibility", () => {
  assert.match(source, /LIVE_TRADING_ENABLED: "false"/);
  assert.match(source, /MEXC_WRITE_PROVIDER_ENABLED\) !== "true"/);
  assert.doesNotMatch(source, /LIVE_TRADING_ENABLED\) !== "true"/);
});

test("candidate handoff cannot receive credentials, environment or transport", () => {
  const handoff = source.match(/export type SyntheticCandidateHandoff[\s\S]*?\n}>;/)?.[0];
  assert.ok(handoff);
  assert.match(handoff, /accept\(intent: MexcExecutionIntent, evidence: MexcPreWriteEvidence\)/);
  assert.doesNotMatch(handoff, /credential|environment|transport|fetch/i);
});
