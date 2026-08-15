import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/lib/execution/internal/production-write-composition.ts", import.meta.url),
  "utf8",
);
const writerSource = readFileSync(
  new URL("../app/lib/execution/internal/mexc-execution-writer.ts", import.meta.url),
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

test("writer API cannot carry a frozen authority or credential snapshot through its queue", () => {
  assert.match(writerSource, /execute\(intent:MexcExecutionIntent,contextProvider:MexcPreTransportContextProvider\)/);
  assert.doesNotMatch(writerSource, /execute\(intent:MexcExecutionIntent,credentials:/);
  const serial = writerSource.match(/private async executeSerial[\s\S]*?private async reconcile/)?.[0];
  assert.ok(serial);
  const wait = serial.indexOf("await new Promise");
  const firstContext = serial.indexOf("contextProvider()");
  const claim = serial.indexOf("this.store.claim");
  const secondContext = serial.indexOf("contextProvider()", firstContext + 1);
  const post = serial.indexOf("this.transport({url:MEXC_EXECUTION_BASE_URL+MEXC_ORDER_CREATE_PATH");
  assert.ok(wait < firstContext);
  assert.ok(firstContext < claim);
  assert.ok(claim < secondContext);
  assert.ok(secondContext < post);
  assert.match(serial, /releaseClaim\(digest/);
});
