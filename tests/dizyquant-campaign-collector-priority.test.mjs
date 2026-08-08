import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("campaign collector lease remains lower priority than normal terminal depth acquisition", async () => {
  const registry = await readFile("app/lib/order-flow/depth-collector.ts", "utf8");
  const service = await readFile("app/lib/dizyquant/campaign-recorder-service.ts", "utf8");
  const compactRegistry = registry.replace(/\s+/g, "");

  const acquireStart = compactRegistry.indexOf(
    "exportfunctionacquireDepthCollector(symbol:string){",
  );
  const releaseStart = compactRegistry.indexOf(
    "exportfunctionreleaseDepthCollector(symbol:string){",
    Math.max(0, acquireStart),
  );
  assert.ok(
    acquireStart >= 0 && releaseStart > acquireStart,
    "collector acquisition contract must remain visible to the regression",
  );
  const acquire = compactRegistry.slice(acquireStart, releaseStart);
  const pruneIndex = acquire.indexOf("if(collectors.size>=MAX_COLLECTORS)pruneIdle()");
  const capacityIndex = acquire.indexOf('throwError("DizyFlowcollectorcapacityreached")');
  assert.ok(pruneIndex >= 0, "normal acquisition must retain the idle-pruning clause");
  assert.ok(capacityIndex >= 0, "normal acquisition must retain its bounded capacity guard");
  assert.ok(
    pruneIndex < capacityIndex,
    "normal acquisition must prune zero-reference idle collectors before rejecting capacity",
  );

  assert.match(
    compactRegistry,
    /constpruneIdle=\(\)=>\{[^}]*if\(entry\.references===0\)dispose\(symbol,entry\)\}/,
  );
  assert.match(
    compactRegistry,
    /releaseDepthCollector\(symbol:string\)[\s\S]*entry\.references=Math\.max\(0,entry\.references-1\)[\s\S]*setTimeout\(\(\)=>dispose\(symbol,entry\),COLLECTOR_IDLE_MS\)/,
  );
  assert.match(
    compactRegistry,
    /startArchiveCollectors\(\)[\s\S]*slice\(0,Math\.max\(0,MAX_COLLECTORS-1\)\)/,
  );

  assert.match(service, /acquireDepthCollector\(residency\.symbol\)/);
  assert.match(service, /releaseDepthCollector\(residency\.symbol\)/);
  assert.match(service, /holds no registry reference between pulses/);
  assert.doesNotMatch(service, /DIZYFLOW_MAX_COLLECTORS|MAX_COLLECTORS\s*=|pruneIdleCollectors/);
});
