import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MEXC_EXECUTION_EGRESS_ALLOWLIST_ATTESTATION,
  ProductionMexcWriteCompositionError,
  createProductionMexcWriteComposition,
} from "../app/lib/execution/internal/production-write-composition.ts";

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
  assert.doesNotMatch(source, /MEXC_EXECUTION_(?:ACCESS_KEY|SECRET_KEY|CREDENTIAL_GENERATION)/);
  assert.match(source, /return new ProductionMexcWriteComposition\(null\)/);
  assert.match(source, /syntheticCandidateHandoff\.accept\(intent, evidence\)/);
});

test("production factory stays physically disabled under hostile-looking deployment inputs", async () => {
  const environmentReads = [];
  const hostileEnvironment = Object.freeze({
    LIVE_TRADING_ENABLED: "true",
    MEXC_WRITE_PROVIDER_ENABLED: "true",
    MEXC_EXECUTION_ACCESS_KEY: "mx-test-access-key-never-read-1234567890",
    MEXC_EXECUTION_SECRET_KEY: "mx-test-secret-key-never-read-1234567890",
    MEXC_EXECUTION_CREDENTIAL_GENERATION: "999",
    MEXC_EXECUTION_EGRESS_ALLOWLIST_ATTESTATION: MEXC_EXECUTION_EGRESS_ALLOWLIST_ATTESTATION,
  });
  const environment = new Proxy(hostileEnvironment, {
    get(target, property, receiver) {
      environmentReads.push(property);
      return Reflect.get(target, property, receiver);
    },
  });
  const composition = createProductionMexcWriteComposition(environment);
  let requestTouched = false;
  const request = new Proxy(Object.create(null), {
    get() {
      requestTouched = true;
      throw new Error("production factory inspected a request despite the null write boundary");
    },
  });

  await assert.rejects(
    composition.execute(request),
    (error) =>
      error instanceof ProductionMexcWriteCompositionError &&
      error.kind === "disabled" &&
      error.message === "MEXC_PRODUCTION_WRITE_DISABLED",
  );
  assert.deepEqual(environmentReads, []);
  assert.equal(requestTouched, false);
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
  const finalQuarantineRead = serial.lastIndexOf("this.store.isAccountQuarantined");
  const post = serial.indexOf("this.transport({url:MEXC_EXECUTION_BASE_URL+MEXC_ORDER_CREATE_PATH");
  assert.ok(wait < firstContext);
  assert.ok(firstContext < claim);
  assert.ok(claim < finalQuarantineRead);
  assert.ok(finalQuarantineRead < secondContext);
  assert.ok(secondContext < post);
  assert.match(serial, /releaseClaim\(digest/);
});
