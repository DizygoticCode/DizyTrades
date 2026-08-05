import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyDepthError,
  sanitiseDepthDiagnostic,
} from "../scripts/dizyflow-depth-failure-diagnostic.mjs";

const scriptPath = new URL("../scripts/dizyflow-depth-failure-diagnostic.mjs", import.meta.url);
const workflowPath = new URL("../.github/workflows/render-rehearsal.yml", import.meta.url);

test("depth failure categories are stable and do not retain upstream text", () => {
  assert.equal(classifyDepthError("MEXC depth HTTP 403"), "upstream-http-403");
  assert.equal(classifyDepthError("Invalid MEXC depth envelope"), "invalid-envelope");
  assert.equal(classifyDepthError("Invalid MEXC depth version or timestamp"), "invalid-version-or-time");
  assert.equal(classifyDepthError("Invalid MEXC depth levels"), "invalid-levels");
  assert.equal(classifyDepthError("fetch failed"), "network");
  assert.equal(classifyDepthError("request aborted"), "timeout");
  assert.equal(classifyDepthError(null), null);
});

test("depth diagnostic retains bounded state only", () => {
  const result = sanitiseDepthDiagnostic(503, {
    success: false,
    status: "ERROR",
    diagnostic: {
      running: true,
      lastSuccessfulSnapshot: null,
      lastVersion: null,
      bids: 50_000,
      asks: -2,
      consecutiveFailures: 4,
      lastError: "MEXC depth HTTP 403 with unretained upstream detail",
    },
  }, 99);
  assert.deepEqual(result, {
    collected: true,
    attempts: 6,
    httpStatus: 503,
    apiStatus: "ERROR",
    success: false,
    running: true,
    lastSuccessfulSnapshotPresent: false,
    lastVersionPresent: false,
    bids: 1_000,
    asks: 0,
    consecutiveFailures: 4,
    errorKind: "upstream-http-403",
  });
  const serialised = JSON.stringify(result);
  assert.doesNotMatch(serialised, /unretained|MEXC|lastError/);
});

test("failure-only observer cannot alter the original acceptance result", async () => {
  const source = await readFile(scriptPath, "utf8");
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(source, /acceptance\.depthFailureDiagnostic = diagnostic/);
  assert.doesNotMatch(source, /acceptance\.passed\s*=/);
  assert.match(source, /\/api\/dizyflow\/depth\?symbol=BTC_USDT/);
  assert.match(source, /maximumAttempts = 6/);
  assert.match(source, /errorKind: classifyDepthError\(diagnostic\.lastError\)/);
  assert.doesNotMatch(source, /envelope|snapshot\s*:|bids\s*:\s*diagnostic\.bids\s*\?|asks\s*:\s*diagnostic\.asks\s*\?/);
  assert.match(workflow, /Collect bounded depth failure diagnostic/);
  assert.match(workflow, /failure\(\).*github\.event_name != 'pull_request'/);
  assert.ok(
    workflow.indexOf("Collect bounded depth failure diagnostic") <
      workflow.indexOf("Upload sanitised rehearsal evidence"),
  );
});
