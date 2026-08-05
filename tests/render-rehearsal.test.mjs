import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHealthUrl,
  deployCommitId,
  findExpectedDeploy,
  flattenService,
  normaliseCollection,
  waitForHealth,
} from "../scripts/render-rehearsal.mjs";

test("normalises Render list response variants", () => {
  const wrapped = [{ deploy: { id: "dep-1" }, cursor: "cursor-1" }];
  assert.deepEqual(normaliseCollection(wrapped, "deploys"), wrapped);
  assert.deepEqual(normaliseCollection({ deploys: wrapped }, "deploys"), wrapped);
  assert.deepEqual(normaliseCollection({ events: [] }, "deploys"), []);
  assert.deepEqual(normaliseCollection(null, "deploys"), []);
});

test("flattens nested web-service details", () => {
  const service = flattenService({
    service: {
      id: "srv-test",
      name: "DizyTrades",
      serviceDetails: {
        url: "https://dizytrades.example",
        healthCheckPath: "/api/health",
        region: "oregon",
      },
    },
  });
  assert.equal(service.id, "srv-test");
  assert.equal(service.url, "https://dizytrades.example");
  assert.equal(service.healthCheckPath, "/api/health");
  assert.equal(service.region, "oregon");
});

test("matches full and abbreviated commit identifiers", () => {
  const deploys = [
    { status: "live", commit: { id: "abcdef1234567890" } },
    { status: "build_in_progress", commitId: "1234567890abcdef" },
  ];
  assert.equal(deployCommitId(deploys[0]), "abcdef1234567890");
  assert.equal(findExpectedDeploy(deploys, "abcdef1"), deploys[0]);
  assert.equal(findExpectedDeploy(deploys, "1234567890abcdef9999"), deploys[1]);
  assert.equal(findExpectedDeploy(deploys, "not-present"), null);
  assert.equal(findExpectedDeploy(deploys, ""), deploys[0]);
});

test("builds health URL from configured, nested or slug-derived service data", () => {
  assert.equal(
    buildHealthUrl({ url: "https://dizytrades.example", healthCheckPath: "/api/health" }),
    "https://dizytrades.example/api/health",
  );
  assert.equal(
    buildHealthUrl({
      serviceDetails: {
        url: "https://nested.example",
        healthCheckPath: "/healthz",
      },
    }),
    "https://nested.example/healthz",
  );
  assert.equal(
    buildHealthUrl({ slug: "dizytrades" }),
    "https://dizytrades.onrender.com/api/health",
  );
  assert.throws(() => buildHealthUrl({}), /Render service URL is required/);
});

test("retries transient production health failures after a deploy becomes live", async () => {
  let attempts = 0;
  const pauses = [];
  const health = await waitForHealth("https://dizytrades.example/api/health", {
    timeoutMs: 10_000,
    intervalMs: 250,
    readHealth: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Production health returned HTTP 502.");
      return {
        status: 200,
        ok: true,
        service: "dizytrades",
        mode: "test",
        liveTradingEnabled: false,
        checkedAt: "2026-08-05T00:00:00.000Z",
      };
    },
    pause: async (milliseconds) => { pauses.push(milliseconds); },
  });
  assert.equal(attempts, 2);
  assert.deepEqual(pauses, [250]);
  assert.equal(health.status, 200);
  assert.equal(health.liveTradingEnabled, false);
});

test("health polling retains the final failure when the warm-up window expires", async () => {
  let attempts = 0;
  await assert.rejects(
    waitForHealth("https://dizytrades.example/api/health", {
      timeoutMs: 0,
      readHealth: async () => {
        attempts += 1;
        throw new Error("Production health returned HTTP 503.");
      },
      pause: async () => {},
    }),
    /HTTP 503/,
  );
  assert.equal(attempts, 1);
});
