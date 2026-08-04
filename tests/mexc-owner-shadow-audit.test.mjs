import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MEXC_OWNER_SHADOW_AUDIT_SCHEMA_VERSION,
  MexcOwnerShadowAuditIntegrityError,
  appendOwnerMexcShadowAudit,
  readOwnerMexcShadowAudit,
} from "../app/lib/mexc-owner-shadow-audit.ts";

async function withRoot(run) {
  const rootDir = await mkdtemp(join(tmpdir(), "dizy-shadow-audit-"));
  try {
    return await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("shadow audit appends a deterministic, verifiable hash chain", async () => {
  await withRoot(async (rootDir) => {
    let now = 1_000_000;
    let event = 0;
    const options = {
      rootDir,
      now: () => now++,
      eventId: () => `event_${String(++event).padStart(8, "0")}`,
    };

    const first = await appendOwnerMexcShadowAudit(
      "rob",
      {
        kind: "account-reconciliation",
        sourcePolicyVersion: "reconciliation/1.0.0",
        payload: {
          summary: { aligned: 2, different: 1 },
          symbols: ["BTC_USDT", "ETH_USDT"],
        },
      },
      options,
    );
    const second = await appendOwnerMexcShadowAudit(
      "rob",
      {
        kind: "hypothetical-order-preview",
        sourcePolicyVersion: "preview/1.0.0",
        payload: {
          request: { symbol: "SOL_USDT", side: "long" },
          executable: false,
          exchangeWriteCapability: "none",
        },
      },
      options,
    );

    assert.equal(first.schemaVersion, MEXC_OWNER_SHADOW_AUDIT_SCHEMA_VERSION);
    assert.equal(first.sequence, 1);
    assert.equal(first.previousDigest, null);
    assert.match(first.digest, /^[a-f0-9]{64}$/);
    assert.equal(second.sequence, 2);
    assert.equal(second.previousDigest, first.digest);
    assert.notEqual(second.digest, first.digest);

    const ledger = await readOwnerMexcShadowAudit("rob", { rootDir });
    assert.equal(ledger.length, 2);
    assert.deepEqual(ledger.map((entry) => entry.kind), [
      "account-reconciliation",
      "hypothetical-order-preview",
    ]);
    assert.equal(ledger[1].previousDigest, ledger[0].digest);
    assert.equal(Object.isFrozen(ledger), true);
    assert.equal(Object.isFrozen(ledger[0]), true);

    const path = join(rootDir, "mexc-owner-shadow-audit", "rob.ndjson");
    const raw = await readFile(path, "utf8");
    assert.doesNotMatch(raw, /apiKey|apiSecret|signature|authorization|credential/i);
  });
});

test("shadow audit detects payload tampering and chain discontinuity", async () => {
  await withRoot(async (rootDir) => {
    const options = {
      rootDir,
      now: () => 2_000_000,
      eventId: () => "event_00000001",
    };
    await appendOwnerMexcShadowAudit(
      "rob",
      {
        kind: "account-reconciliation",
        sourcePolicyVersion: "reconciliation/1.0.0",
        payload: { summary: { aligned: 1 } },
      },
      options,
    );

    const path = join(rootDir, "mexc-owner-shadow-audit", "rob.ndjson");
    const original = await readFile(path, "utf8");
    await writeFile(path, original.replace('"aligned":1', '"aligned":9'), "utf8");

    await assert.rejects(
      () => readOwnerMexcShadowAudit("rob", { rootDir }),
      (error) => {
        assert.ok(error instanceof MexcOwnerShadowAuditIntegrityError);
        assert.match(error.message, /digest does not verify/i);
        return true;
      },
    );
  });
});

test("shadow audit rejects credential-like and raw provider payload fields", async () => {
  await withRoot(async (rootDir) => {
    const base = {
      kind: "connection-control",
      sourcePolicyVersion: "control/1.0.0",
    };
    const options = {
      rootDir,
      now: () => 3_000_000,
      eventId: () => "event_00000002",
    };

    await assert.rejects(
      () => appendOwnerMexcShadowAudit(
        "rob",
        { ...base, payload: { apiSecret: "never-store-this" } },
        options,
      ),
      /forbidden|credential material/i,
    );
    await assert.rejects(
      () => appendOwnerMexcShadowAudit(
        "rob",
        { ...base, payload: { authorization: "Bearer nope" } },
        options,
      ),
      /forbidden|credential material/i,
    );
    await assert.rejects(
      () => appendOwnerMexcShadowAudit(
        "rob",
        { ...base, payload: { rawResponse: { success: true } } },
        options,
      ),
      /forbidden/i,
    );
    assert.deepEqual(await readOwnerMexcShadowAudit("rob", { rootDir }), []);
  });
});

test("missing shadow audit ledger is a valid empty history", async () => {
  await withRoot(async (rootDir) => {
    const entries = await readOwnerMexcShadowAudit("rob", { rootDir });
    assert.deepEqual(entries, []);
    assert.equal(Object.isFrozen(entries), true);
  });
});
