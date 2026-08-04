import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MEXC_OWNER_CONNECTION_CONTROL_SCHEMA_VERSION,
  MEXC_OWNER_SHUTDOWN_CONFIRMATION,
  readOwnerMexcConnectionControl,
  sealOwnerMexcConnection,
} from "../app/lib/mexc-owner-connection-control.ts";

const configuredEnvironment = Object.freeze({
  OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "true",
  OWNER_MEXC_READONLY_API_KEY: "readonly-key-123",
  OWNER_MEXC_READONLY_API_SECRET: "readonly-secret-123456789",
  OWNER_MEXC_READONLY_PERMISSION_ATTESTATION: "account-read+trade-read;no-write/v1",
  LIVE_TRADING_ENABLED: "false",
});

function auditEntry() {
  return Object.freeze({
    schemaVersion: "mexc-owner-shadow-audit/1.0.0",
    sequence: 1,
    eventId: "event_00000001",
    ownerDigest: "a".repeat(64),
    recordedAtMs: 1_000_001,
    kind: "connection-control",
    sourcePolicyVersion: MEXC_OWNER_CONNECTION_CONTROL_SCHEMA_VERSION,
    previousDigest: null,
    payload: Object.freeze({ stored: true }),
    digest: "b".repeat(64),
  });
}

async function withRoot(run) {
  const rootDir = await mkdtemp(join(tmpdir(), "dizy-mexc-control-"));
  try {
    return await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("missing control defaults active while reporting only configuration presence", async () => {
  await withRoot(async (rootDir) => {
    const result = await readOwnerMexcConnectionControl(configuredEnvironment, { rootDir });
    assert.equal(result.state, "active");
    assert.equal(result.generation, 0);
    assert.equal(result.integrity, "missing-default");
    assert.equal(result.localPrivateReadsBlocked, false);
    assert.equal(result.credentialPairPresent, true);
    assert.equal(result.privateConfigurationPresent, true);
    assert.equal(result.credentialRemovalConfirmed, false);
    assert.equal(result.digest, null);
  });
});

test("owner shutdown persists a sealed state and appends a normalized audit event", async () => {
  await withRoot(async (rootDir) => {
    const shutdown = await sealOwnerMexcConnection(
      {
        userId: "rob",
        confirmation: MEXC_OWNER_SHUTDOWN_CONFIRMATION,
        operatorReason: "Rotate the read-only provider key.",
        environment: configuredEnvironment,
      },
      {
        rootDir,
        now: () => 1_000_000,
        appendAudit: async (userId, input) => {
          assert.equal(userId, "rob");
          assert.equal(input.kind, "connection-control");
          assert.equal(input.payload.action, "local-private-read-sealed");
          assert.equal(input.payload.localPrivateReadsBlocked, true);
          assert.equal(input.payload.credentialPairPresent, true);
          assert.equal(input.payload.exchangeWriteCapability, "none");
          assert.doesNotMatch(JSON.stringify(input), /readonly-key-123|readonly-secret-123456789/);
          return auditEntry();
        },
      },
    );

    assert.equal(shutdown.control.state, "sealed");
    assert.equal(shutdown.control.generation, 1);
    assert.equal(shutdown.control.integrity, "verified");
    assert.equal(shutdown.control.localPrivateReadsBlocked, true);
    assert.equal(shutdown.audit.kind, "connection-control");
    assert.equal(shutdown.auditFailure, null);

    const afterRestart = await readOwnerMexcConnectionControl(configuredEnvironment, { rootDir });
    assert.equal(afterRestart.state, "sealed");
    assert.equal(afterRestart.generation, 1);
    assert.equal(afterRestart.updatedAtMs, 1_000_000);
    assert.match(afterRestart.digest, /^[a-f0-9]{64}$/);

    const raw = await readFile(join(rootDir, "mexc-owner-connection-control.json"), "utf8");
    assert.doesNotMatch(raw, /readonly-key-123|readonly-secret-123456789|account-read\+trade-read/);
  });
});

test("wrong shutdown confirmation fails without creating a seal", async () => {
  await withRoot(async (rootDir) => {
    await assert.rejects(
      () => sealOwnerMexcConnection(
        {
          userId: "rob",
          confirmation: "shut it down",
          environment: configuredEnvironment,
        },
        { rootDir, appendAudit: async () => auditEntry() },
      ),
      /confirmation must be exactly/i,
    );
    const result = await readOwnerMexcConnectionControl(configuredEnvironment, { rootDir });
    assert.equal(result.state, "active");
    assert.equal(result.integrity, "missing-default");
  });
});

test("invalid control contents fail closed as sealed", async () => {
  await withRoot(async (rootDir) => {
    await sealOwnerMexcConnection(
      {
        userId: "rob",
        confirmation: MEXC_OWNER_SHUTDOWN_CONFIRMATION,
        environment: configuredEnvironment,
      },
      {
        rootDir,
        now: () => 2_000_000,
        appendAudit: async () => auditEntry(),
      },
    );
    const path = join(rootDir, "mexc-owner-connection-control.json");
    const original = await readFile(path, "utf8");
    await writeFile(path, original.replace('"generation":1', '"generation":9'), "utf8");

    const result = await readOwnerMexcConnectionControl(configuredEnvironment, { rootDir });
    assert.equal(result.state, "sealed");
    assert.equal(result.localPrivateReadsBlocked, true);
    assert.equal(result.integrity, "failed");
    assert.equal(result.reason, "control-integrity-failed");
    assert.match(result.message, /digest does not verify/i);
  });
});

test("shutdown remains sealed when immutable audit persistence fails", async () => {
  await withRoot(async (rootDir) => {
    const shutdown = await sealOwnerMexcConnection(
      {
        userId: "rob",
        confirmation: MEXC_OWNER_SHUTDOWN_CONFIRMATION,
        environment: configuredEnvironment,
      },
      {
        rootDir,
        now: () => 3_000_000,
        appendAudit: async () => {
          throw new Error("audit disk unavailable");
        },
      },
    );
    assert.equal(shutdown.control.state, "sealed");
    assert.equal(shutdown.audit, null);
    assert.match(shutdown.auditFailure, /audit disk unavailable/i);
    assert.equal(
      (await readOwnerMexcConnectionControl(configuredEnvironment, { rootDir })).state,
      "sealed",
    );
  });
});

test("credential removal confirmation requires private configuration to be absent", async () => {
  await withRoot(async (rootDir) => {
    await sealOwnerMexcConnection(
      {
        userId: "rob",
        confirmation: MEXC_OWNER_SHUTDOWN_CONFIRMATION,
        environment: configuredEnvironment,
      },
      {
        rootDir,
        now: () => 4_000_000,
        appendAudit: async () => auditEntry(),
      },
    );

    const removedEnvironment = Object.freeze({
      OWNER_MEXC_ACCOUNT_COMPANION_ENABLED: "false",
      LIVE_TRADING_ENABLED: "false",
    });
    const result = await readOwnerMexcConnectionControl(removedEnvironment, { rootDir });
    assert.equal(result.state, "sealed");
    assert.equal(result.privateConfigurationPresent, false);
    assert.equal(result.credentialPairPresent, false);
    assert.equal(result.permissionAttestationPresent, false);
    assert.equal(result.credentialRemovalConfirmed, true);
  });
});
