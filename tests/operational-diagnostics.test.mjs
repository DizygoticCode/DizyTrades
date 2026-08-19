import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectOperationalDiagnostics } from "../app/lib/operational-diagnostics.ts";

const diagnosticsClient = await readFile(
  new URL("../app/diagnostics/diagnostics-client.tsx", import.meta.url),
  "utf8",
);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dizy-diagnostics-"));
  await mkdir(join(root, "users"), { recursive: true });
  await mkdir(join(root, "journal"), { recursive: true });
  await mkdir(join(root, "audit"), { recursive: true });
  await writeFile(join(root, "users", "owner.json"), "12345");
  await writeFile(join(root, "journal", "owner.json"), "1234567890");
  await writeFile(
    join(root, "audit", "events.jsonl"),
    [
      JSON.stringify({ at: "2026-08-02T10:00:00.000Z", userId: "secret-user", action: "auth.login", details: { ip: "secret" } }),
      JSON.stringify({ at: "2026-08-02T10:01:00.000Z", userId: "secret-user", action: "provider.error", details: { raw: "secret" } }),
      JSON.stringify({ at: "2026-08-02T10:02:00.000Z", userId: "secret-user", action: "paper.order_rejected", details: { reason: "secret" } }),
    ].join("\n") + "\n",
  );
  return root;
}

test("diagnostics report bounded storage, deployment and sanitised audit activity", async () => {
  const root = await fixture();
  try {
    const report = await collectOperationalDiagnostics({
      dataRoot: root,
      now: new Date("2026-08-02T12:00:00.000Z"),
      environment: {
        ...process.env,
        DATA_DIR: root,
        SESSION_SECRET: "configured-secret-never-returned",
        RENDER_GIT_COMMIT: "1234567890abcdef1234567890abcdef12345678",
        RENDER_SERVICE_NAME: "dizytrades",
        RENDER_INSTANCE_ID: "instance-1",
        RENDER_DEPLOY_ID: "deploy-1",
      },
    });

    assert.equal(report.generatedAt, "2026-08-02T12:00:00.000Z");
    assert.equal(report.deployment.commit, "1234567890abcdef1234567890abcdef12345678");
    assert.equal(report.configuration.sessionSecretConfigured, true);
    assert.equal(report.configuration.liveTradingEnabled, false);
    for (const value of [
      report.runtime.residentMemoryBytes,
      report.runtime.heapUsedBytes,
      report.runtime.heapTotalBytes,
      report.runtime.externalBytes,
      report.runtime.arrayBuffersBytes,
    ]) {
      assert.equal(Number.isFinite(value) && value >= 0, true);
    }
    assert.equal(report.storage.readable, true);
    assert.equal(report.storage.writable, true);
    assert.ok(report.storage.scannedFiles >= 3);
    assert.ok(report.storage.scannedBytes >= 15);
    assert.ok(report.storage.categories.some((category) => category.name === "users"));
    assert.ok(report.storage.categories.some((category) => category.name === "journal"));
    assert.deepEqual(
      report.activity.recentFailures.map((event) => event.action),
      ["provider.error", "paper.order_rejected"],
    );
    assert.equal(report.activity.latestEventAt, "2026-08-02T10:02:00.000Z");

    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes("secret-user"), false);
    assert.equal(serialized.includes("configured-secret-never-returned"), false);
    assert.equal(serialized.includes("secret"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("DizyOps runtime exposes the complete bounded process memory breakdown", () => {
  assert.match(diagnosticsClient, /Resident memory/);
  assert.match(diagnosticsClient, /Heap used/);
  assert.match(diagnosticsClient, /Heap total/);
  assert.match(diagnosticsClient, /External memory/);
  assert.match(diagnosticsClient, /Array buffers/);
});

test("storage scans stop at the explicit file boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "dizy-diagnostics-limit-"));
  try {
    await mkdir(join(root, "many"), { recursive: true });
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        writeFile(join(root, "many", `${index}.json`), String(index)),
      ),
    );
    const report = await collectOperationalDiagnostics({
      dataRoot: root,
      maxFiles: 3,
      environment: { ...process.env, DATA_DIR: root },
    });
    assert.equal(report.storage.scannedFiles, 3);
    assert.equal(report.storage.scanTruncated, true);
    assert.equal(report.storage.state, "degraded");
    assert.equal(report.overall, "degraded");
    assert.ok(report.limitations.some((item) => item.includes("file limit")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a fresh empty data directory remains honest and available", async () => {
  const root = await mkdtemp(join(tmpdir(), "dizy-diagnostics-empty-"));
  try {
    const report = await collectOperationalDiagnostics({
      dataRoot: root,
      environment: { ...process.env, DATA_DIR: root },
    });
    assert.equal(report.storage.scannedFiles, 0);
    assert.equal(report.storage.categories.length, 0);
    assert.equal(report.activity.state, "unavailable");
    assert.equal(report.activity.retainedEvents, 0);
    assert.equal(report.configuration.liveTradingEnabled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
