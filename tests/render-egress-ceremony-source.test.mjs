import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const executionFacade = read("app/lib/execution/write-provisioning-authority.ts");
const ceremony = read("app/lib/render-egress-ceremony.ts");
const route = read("app/api/account/render-egress/route.ts");
const page = read("app/account/egress/page.tsx");
const layout = read("app/account/layout.tsx");

test("Render egress ceremony stays behind the existing secret-free execution authority facade", () => {
  assert.match(executionFacade, /RENDER_EGRESS_CEREMONY_REGION = "frankfurt"/);
  assert.match(executionFacade, /probeProductionRenderEgressIpv4/);
  assert.match(executionFacade, /declareRenderDedicatedEgress/);
  assert.match(executionFacade, /observeRenderDedicatedEgress/);
  assert.match(executionFacade, /RENDER_EGRESS_SECOND_OBSERVATION_MIN_DELAY_MS/);
  assert.match(executionFacade, /current\.dedicatedIpv4s\[0\] !== observerIpv4/);
  assert.match(executionFacade, /current\.observationCount >= 2/);
  assert.doesNotMatch(executionFacade, /attestMexcEgressAllowlisted/);

  assert.match(ceremony, /^import "server-only";/);
  assert.match(ceremony, /\.\/execution\/write-provisioning-authority/);
  assert.doesNotMatch(ceremony, /execution\/internal|credential-custody|mexc-execution-writer|production-write-composition/);
  assert.doesNotMatch(ceremony, /accessKey|secretKey|credentials\s*:/);
});

test("owner route accepts only declare/observe and supplies server-owned runtime evidence", () => {
  assert.match(route, /user\?\.id === "rob" && user\.role === "owner"/);
  assert.match(route, /validRequestOrigin\(request\)/);
  assert.match(route, /requestIp\(request\)/);
  assert.match(route, /consumeRateLimit/);
  assert.match(route, /2_048/);
  assert.match(route, /SESSION_COOKIE/);
  assert.match(route, /action !== "declare" && action !== "observe"/);
  assert.match(route, /declareProductionRenderEgressCeremony/);
  assert.match(route, /observeProductionRenderEgressCeremony/);
  assert.doesNotMatch(route, /lib\/execution|execution\/internal/);
  assert.doesNotMatch(route, /attestMexcEgressAllowlisted|accessKey|secretKey|credentials\s*:|MEXC_EXECUTION_(?:ACCESS_KEY|SECRET_KEY)/);
  assert.doesNotMatch(route, /dedicatedIpv4s|renderServiceId|renderRegion|expectedRevision/);
});

test("owner route redirects only through the configured public application origin", () => {
  assert.match(route, /process\.env\.APP_BASE_URL/);
  assert.match(route, /base\.origin/);
  assert.match(route, /APP_BASE_URL must use HTTPS in production/);
  assert.match(route, /new URL\("\/account\/egress", publicBaseUrl\)/);
  assert.match(route, /Server redirect configuration unavailable/);
  assert.doesNotMatch(route, /new URL\("\/account\/egress", request\.url\)/);
  assert.doesNotMatch(route, /redirectResult\(request,/);
});

test("owner page exposes a two-observation Render rehearsal and no exchange-write ceremony", () => {
  assert.match(page, /user\.id !== "rob" \|\| user\.role !== "owner"/);
  assert.match(page, /Single-IP \/32 proof ceremony/);
  assert.match(page, /api4\.ipify\.org \+ checkip\.amazonaws\.com/);
  assert.match(page, /observationCount < 2/);
  assert.match(page, /secondObservationReady/);
  assert.match(page, /action="\/api\/account\/render-egress" method="post"/);
  assert.match(page, /name="currentPassword"/);
  assert.match(page, /name="totp"/);
  assert.match(page, /name="action" value="declare"/);
  assert.match(page, /name="action" value="observe"/);
  assert.match(page, /provides no MEXC allowlist attestation or write-credential step/);
  assert.doesNotMatch(page, /name="(?:accessKey|secretKey|ip|renderServiceId|renderRegion|expectedRevision)"/);
  assert.doesNotMatch(page, /MEXC_EXECUTION_(?:ACCESS_KEY|SECRET_KEY)|ModernMexcReduceOnlyWriter|ProductionMexcWriteComposition/);
  assert.match(layout, /href="\/account\/egress"/);
  assert.match(layout, /Render egress proof/);
});
