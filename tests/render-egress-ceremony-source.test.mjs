import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const executionFacade = read("app/lib/execution/write-provisioning-authority.ts");
const ceremony = read("app/lib/render-egress-ceremony.ts");
const route = read("app/api/account/render-egress/route.ts");
const page = read("app/account/egress/page.tsx");
const layout = read("app/account/layout.tsx");
const activation = read("app/account/write-credential/activate/page.tsx");

test("legacy Render egress implementation remains isolated compatibility evidence", () => {
  assert.match(executionFacade, /RENDER_EGRESS_CEREMONY_REGION = "frankfurt"/);
  assert.match(executionFacade, /probeProductionRenderEgressIpv4/);
  assert.match(executionFacade, /declareRenderDedicatedEgress/);
  assert.match(executionFacade, /observeRenderDedicatedEgress/);
  assert.match(executionFacade, /RENDER_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS/);
  assert.doesNotMatch(ceremony, /attestMexcEgressAllowlisted/);

  assert.match(ceremony, /^import "server-only";/);
  assert.match(ceremony, /\.\/execution\/write-provisioning-authority/);
  assert.doesNotMatch(ceremony, /execution\/internal|credential-custody|mexc-execution-writer|production-write-composition/);
  assert.doesNotMatch(ceremony, /accessKey|secretKey|credentials\s*:/);
});

test("legacy Render mutation route is retired rather than relabelled as self-hosted", () => {
  assert.match(route, /user\?\.id === "rob" && user\.role === "owner"/);
  assert.match(route, /validRequestOrigin\(request\)/);
  assert.match(route, /status: 410/);
  assert.match(route, /Legacy Render egress ceremony retired/);
  assert.doesNotMatch(route, /declareProductionRenderEgressCeremony|observeProductionRenderEgressCeremony/);
  assert.doesNotMatch(route, /accessKey|secretKey|MEXC_EXECUTION_(?:ACCESS_KEY|SECRET_KEY)/);
});

test("current owner navigation uses only the provider-neutral write-credential ceremony", () => {
  assert.match(page, /redirect\("\/account\/write-credential"\)/);
  assert.doesNotMatch(page, /action="\/api\/account\/render-egress"/);
  assert.doesNotMatch(layout, /href="\/account\/egress"/);
  assert.doesNotMatch(layout, /Render egress proof/);
  assert.match(layout, /href="\/account\/write-credential"/);
  assert.match(activation, /exact execution-host \/32 evidence/);
  assert.match(activation, /Execution-host \/32/);
  assert.doesNotMatch(activation, /Render \/32/);
});
