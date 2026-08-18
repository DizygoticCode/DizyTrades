import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ExecutionStaticHostEgressProofError,
  SqliteStaticHostEgressProofStore,
  currentStaticHostMatches,
  probeProductionStaticHostEgressIpv4,
  staticHostIpSetDigestSha256,
  staticHostRuntimeEvidenceFromEnvironment,
} from "../app/lib/execution/internal/static-host-egress-proof-authority.ts";
import { MEXC_WRITE_EGRESS_ATTESTATION } from "../app/lib/execution/internal/write-credential-authority-store.ts";

const identity = generation => ({ userId: "rob", accountId: "account-1", writeCredentialGeneration: generation });
const at = minute => new Date(1_780_100_000_000 + minute * 60_000).toISOString();
const conflict = error => error instanceof ExecutionStaticHostEgressProofError && error.code === "EXECUTION_STATIC_HOST_EGRESS_PROOF_CONFLICT";

function allowlistedState(store, generation = "generation-1") {
  const id = identity(generation);
  let state = store.declare(id, "server-club-01", "1.1.1.1", at(0), 0);
  state = store.observe(id, "server-club-01", "1.1.1.1", at(1), state.revision);
  state = store.observe(id, "server-club-01", "1.1.1.1", at(2), state.revision);
  return store.allowlist(id, state.ipSetDigestSha256, new Date(Date.parse(at(2)) + 30_000).toISOString(), state.revision);
}

test("static host runtime is explicit and server-owned", () => {
  assert.equal(staticHostRuntimeEvidenceFromEnvironment({}), null);
  assert.equal(staticHostRuntimeEvidenceFromEnvironment({ EXECUTION_HOST_PROVIDER: "static" }), null);
  assert.deepEqual(
    staticHostRuntimeEvidenceFromEnvironment({ EXECUTION_HOST_PROVIDER: "static", EXECUTION_HOST_ID: "server-club-01" }),
    { provider: "static", hostId: "server-club-01" },
  );
  assert.equal(staticHostRuntimeEvidenceFromEnvironment({ EXECUTION_HOST_PROVIDER: "render", EXECUTION_HOST_ID: "server-club-01" }), null);
});

test("static host proof is exact-generation, exact-host, exact public /32 and CAS revisioned", () => {
  const store = new SqliteStaticHostEgressProofStore(":memory:");
  try {
    const id = identity("generation-1");
    assert.equal(store.read(id).status, "unknown");
    assert.equal(staticHostIpSetDigestSha256("10.0.0.1"), null);
    assert.equal(staticHostIpSetDigestSha256("1.1.1.1"), "f1412386aa8db2579aff2636cb9511cacc5fd9880ecab60c048508fbe26ee4d9");
    let state = store.declare(id, "server-club-01", "1.1.1.1", at(0), 0);
    assert.equal(state.revision, 1);
    assert.deepEqual(state.dedicatedIpv4s, ["1.1.1.1"]);
    assert.throws(() => store.declare(id, "server-club-01", "1.1.1.1", at(1), 0), conflict);
    assert.throws(() => store.observe(id, "other-host", "1.1.1.1", at(1), 1), conflict);
    assert.throws(() => store.observe(id, "server-club-01", "8.8.8.8", at(1), 1), conflict);
    state = store.observe(id, "server-club-01", "1.1.1.1", at(1), 1);
    assert.equal(state.observationCount, 1);
    assert.throws(() => store.observe(id, "server-club-01", "1.1.1.1", new Date(Date.parse(at(1)) + 30_000).toISOString(), 2), conflict);
    state = store.observe(id, "server-club-01", "1.1.1.1", at(2), 2);
    assert.equal(state.observationCount, 2);
    state = store.allowlist(id, state.ipSetDigestSha256, new Date(Date.parse(at(2)) + 30_000).toISOString(), 3);
    assert.equal(state.status, "allowlisted");
    assert.equal(state.mexcAllowlistAttestation, MEXC_WRITE_EGRESS_ATTESTATION);
    assert.equal(store.read(identity("generation-2")).status, "unknown");
  } finally {
    store.close();
  }
});

test("current static host match fails closed on host, IP and freshness changes", () => {
  const store = new SqliteStaticHostEgressProofStore(":memory:");
  try {
    const state = allowlistedState(store);
    const runtime = { provider: "static", hostId: "server-club-01" };
    const fresh = new Date(Date.parse(state.lastObservedAt) + 5 * 60_000);
    assert.equal(currentStaticHostMatches(state, runtime, "1.1.1.1", fresh), true);
    assert.equal(currentStaticHostMatches(state, { ...runtime, hostId: "other-host" }, "1.1.1.1", fresh), false);
    assert.equal(currentStaticHostMatches(state, runtime, "8.8.8.8", fresh), false);
    assert.equal(currentStaticHostMatches(state, runtime, "1.1.1.1", new Date(Date.parse(state.lastObservedAt) + 10 * 60_000 + 1)), false);
  } finally {
    store.close();
  }
});

test("static egress probe requires both fixed observers to agree", async () => {
  const calls = [];
  const same = async url => (calls.push(url), { ok: true, status: 200, text: async () => "1.1.1.1\n" });
  assert.equal(await probeProductionStaticHostEgressIpv4(same), "1.1.1.1");
  assert.deepEqual(calls, ["https://api4.ipify.org", "https://checkip.amazonaws.com"]);
  let n = 0;
  const mismatch = async () => ({ ok: true, status: 200, text: async () => (++n === 1 ? "1.1.1.1" : "8.8.8.8") });
  assert.equal(await probeProductionStaticHostEgressIpv4(mismatch), null);
  const privateIp = async () => ({ ok: true, status: 200, text: async () => "192.168.1.1" });
  assert.equal(await probeProductionStaticHostEgressIpv4(privateIp), null);
});

test("static host proof survives restart and poisons on backing replacement", () => {
  const root = mkdtempSync(join(tmpdir(), "static-host-egress-proof-"));
  const path = join(root, "proof.sqlite");
  try {
    let store = new SqliteStaticHostEgressProofStore(path);
    store.declare(identity("generation-1"), "server-club-01", "1.1.1.1", at(0), 0);
    store.close();
    store = new SqliteStaticHostEgressProofStore(path);
    assert.equal(store.read(identity("generation-1")).hostId, "server-club-01");
    renameSync(path, `${path}.detached`);
    writeFileSync(path, "replacement");
    assert.throws(() => store.read(identity("generation-1")), error => error instanceof ExecutionStaticHostEgressProofError && error.code === "EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE");
    assert.throws(() => store.read(identity("generation-1")), error => error instanceof ExecutionStaticHostEgressProofError && error.code === "EXECUTION_STATIC_HOST_EGRESS_PROOF_UNAVAILABLE");
    store.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
