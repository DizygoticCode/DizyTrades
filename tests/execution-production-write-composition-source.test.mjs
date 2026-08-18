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
const leaseSource = readFileSync(
  new URL("../app/lib/execution/internal/production-write-credential-lease.ts", import.meta.url),
  "utf8",
);

test("#341 production composition connects only the reviewed writer and exact-generation lease", () => {
  assert.match(source, /ModernMexcReduceOnlyWriter/);
  assert.match(source, /createMexcExecutionFetchTransport/);
  assert.match(source, /readProductionMexcWriteCredentialLease/);
  assert.match(source, /productionWriteCredentialExecutionIdentity/);
  assert.match(source, /productionWriter\.execute\(intent, contextProvider\)/);
  assert.doesNotMatch(source, /MEXC_EXECUTION_(?:ACCESS_KEY|SECRET_KEY|CREDENTIAL_GENERATION)/);
  assert.doesNotMatch(source, /OWNER_MEXC_READONLY_API_(?:KEY|SECRET)/);
  assert.doesNotMatch(source, /fetch\s*\(/);
});

test("production factory remains disabled when exact server-owned write identity is absent", async () => {
  const composition = createProductionMexcWriteComposition(Object.freeze({
    LIVE_TRADING_ENABLED: "true",
    MEXC_WRITE_PROVIDER_ENABLED: "true",
    MEXC_EXECUTION_EGRESS_ALLOWLIST_ATTESTATION,
  }));
  let requestTouched = false;
  const request = new Proxy(Object.create(null), {
    get() {
      requestTouched = true;
      throw new Error("disabled factory inspected request");
    },
  });

  await assert.rejects(
    composition.execute(request),
    (error) =>
      error instanceof ProductionMexcWriteCompositionError &&
      error.kind === "disabled" &&
      error.message === "MEXC_PRODUCTION_WRITE_DISABLED",
  );
  assert.equal(requestTouched, false);
});

test("candidate preparation remains distinct from actual writer eligibility", () => {
  assert.match(source, /LIVE_TRADING_ENABLED: "false"/);
  assert.match(source, /MEXC_WRITE_PROVIDER_ENABLED\) !== "true"/);
  assert.doesNotMatch(source, /LIVE_TRADING_ENABLED\) !== "true"/);
  assert.match(writerSource, /mexcWriterEnabled\(environment/);
});

test("synthetic candidate handoff still cannot receive credentials, environment or transport", () => {
  const handoff = source.match(/export type SyntheticCandidateHandoff[\s\S]*?\n}>;/)?.[0];
  assert.ok(handoff);
  assert.match(handoff, /accept\(intent: MexcExecutionIntent, evidence: MexcPreWriteEvidence\)/);
  assert.doesNotMatch(handoff, /credential|environment|transport|fetch/i);
});

test("production writer gets credentials only from the synchronous late context provider", () => {
  const provider = source.match(/const contextProvider = \(\): MexcPreTransportContext => \{[\s\S]*?\n    \};/)?.[0];
  assert.ok(provider);
  assert.match(provider, /d\.switches\(\)/);
  assert.match(provider, /d\.readBinding\(\)/);
  assert.match(provider, /d\.ownershipStore\.read\(caller\)/);
  assert.match(provider, /d\.reconciliationStore\.read\(caller\)/);
  assert.match(provider, /d\.riskStore\.read\(caller\.userId, caller\.accountId\)/);
  assert.match(provider, /d\.rolloutStore\.read\(caller\)/);
  const evidenceIndex = provider.indexOf("evidenceFrom(");
  const leaseIndex = provider.indexOf("readProductionMexcWriteCredentialLease(");
  assert.ok(evidenceIndex >= 0 && leaseIndex > evidenceIndex);
  assert.doesNotMatch(source.slice(0, source.indexOf("const contextProvider")), /readProductionMexcWriteCredentialLease\(/);
});

test("credential lease is active-generation, sealed-custody and egress bound", () => {
  assert.match(leaseSource, /authority\.status !== "active"/);
  assert.match(leaseSource, /receipt\.status !== "sealed"/);
  assert.match(leaseSource, /receipt\.credentialFingerprintSha256 !== authority\.credentialFingerprintSha256/);
  assert.match(leaseSource, /authority\.permissionAttestation !== MEXC_WRITE_PERMISSION_ATTESTATION/);
  assert.match(leaseSource, /authority\.egressAttestation !== MEXC_WRITE_EGRESS_ATTESTATION/);
  assert.match(leaseSource, /egress\.status !== "allowlisted"/);
  assert.match(leaseSource, /receipt\.egressProofRevision !== egress\.revision/);
  assert.match(leaseSource, /RENDER_EGRESS_ALLOWLIST_OBSERVATION_MAX_AGE_MS/);
  assert.match(leaseSource, /mexcWriteCredentialFingerprintSha256\(secret\) !== fingerprint/);
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
