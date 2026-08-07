import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("campaign collector lease remains lower priority than normal terminal depth acquisition", async () => {
  const registry = await readFile("app/lib/order-flow/depth-collector.ts", "utf8");
  const service = await readFile("app/lib/dizyquant/campaign-recorder-service.ts", "utf8");

  const acquire = registry.match(
    /export function acquireDepthCollector\(symbol:string\)\{([\s\S]*?)return entry\.collector\}/,
  );
  assert.ok(acquire, "collector acquisition contract must remain visible to the regression");
  const pruneIndex = acquire[1].indexOf("if(collectors.size>=MAX_COLLECTORS)pruneIdle()");
  const capacityIndex = acquire[1].indexOf('throw Error("DizyFlow collector capacity reached")');
  assert.ok(pruneIndex >= 0, "normal acquisition must retain the idle-pruning clause");
  assert.ok(capacityIndex >= 0, "normal acquisition must retain its bounded capacity guard");
  assert.ok(
    pruneIndex < capacityIndex,
    "normal acquisition must prune zero-reference idle collectors before rejecting capacity",
  );

  assert.match(
    registry,
    /const pruneIdle=\(\)=>\{[^}]*if\(entry\.references===0\)dispose\(symbol,entry\)\}/,
  );
  assert.match(
    registry,
    /releaseDepthCollector\(symbol:string\)[\s\S]*entry\.references=Math\.max\(0,entry\.references-1\)[\s\S]*setTimeout\(\(\)=>dispose\(symbol,entry\),COLLECTOR_IDLE_MS\)/,
  );
  assert.match(
    registry,
    /startArchiveCollectors\(\)[\s\S]*slice\(0,Math\.max\(0,MAX_COLLECTORS-1\)\)/,
  );

  assert.match(service, /acquireDepthCollector\(residency\.symbol\)/);
  assert.match(service, /releaseDepthCollector\(residency\.symbol\)/);
  assert.match(service, /holds no registry reference between pulses/);
  assert.doesNotMatch(service, /DIZYFLOW_MAX_COLLECTORS|MAX_COLLECTORS\s*=|pruneIdleCollectors/);
});
