import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("architecture distinguishes current self-hosted runtime from historical slices", () => {
  const architecture = read("ARCHITECTURE.md");
  assert.match(architecture, /current-status note \(28 September 2026\)/i);
  assert.match(architecture, /guarded reduce-only writer and server-only credential\/authority gates exist in code/);
  assert.match(architecture, /LIVE_TRADING_ENABLED=false.*MEXC_WRITE_PROVIDER_ENABLED=false/);
  assert.match(architecture, /supported production topology is one self-hosted instance/);
  assert.doesNotMatch(architecture, /supported production topology is one Render instance/);
  assert.doesNotMatch(architecture, /configured by Render environment variables/);
  assert.match(architecture, /docs\/ACCOUNT_EMAIL_DEPLOYMENT\.md/);
});

test("active research and private-read shutdown runbooks use the actual self-hosted host", () => {
  const quant = read("docs/DIZYQUANT_RESEARCH_CONTRACT.md");
  const shutdown = read("docs/MEXC_OWNER_CONNECTION_SHUTDOWN.md");
  assert.match(quant, /current self-hosted DizyTrades service remains a bounded collection/);
  assert.doesNotMatch(quant, /current Render service remains/);
  assert.match(shutdown, /Physical server credential removal \(self-hosted\)/);
  assert.match(shutdown, /protected self-hosted service environment/);
  assert.match(shutdown, /exchange-write switches disabled independently/);
  assert.doesNotMatch(shutdown, /remove the following server configuration from the Render service/);
  const controlPage = read("app/account/control/page.tsx");
  assert.match(controlPage, /credential removal on the self-hosted server/);
  assert.match(controlPage, /controlled service restart/);
  assert.match(controlPage, /MEXC_WRITE_PROVIDER_ENABLED=false/);
  assert.doesNotMatch(controlPage, /Render environment variables|delete Render|credential removal in Render/);
});

test("active roadmap and security guidance match the self-hosted repository posture", () => {
  const roadmap = read("ROADMAP.md");
  const architecture = read("ARCHITECTURE.md");
  const security = read("SECURITY.md");
  const pkg = JSON.parse(read("package.json"));
  assert.match(roadmap, /Current repository base \(28 September 2026; verify the running host separately\)/);
  assert.ok(roadmap.includes("Next.js " + pkg.dependencies.next));
  assert.ok(roadmap.includes("React / React DOM " + pkg.dependencies.react));
  assert.ok(roadmap.includes("Lightweight Charts " + pkg.dependencies["lightweight-charts"].replace(/^\^/, "")));
  assert.match(roadmap, /current service is self-hosted; this milestone is historical/);
  assert.match(roadmap, /former Render service after the verified reset/);
  assert.doesNotMatch(roadmap, /current product-generation programme is complete and live on Render/);
  assert.match(architecture, /credentials are held in the protected self-hosted service environment/i);
  assert.doesNotMatch(architecture, /Credentials are held in the Render environment/);
  assert.match(security, /Fresh exact-host self-hosted outbound/);
  assert.match(security, /outside the production service's persistent data root/);
  assert.match(security, /current self-hosted deployment identity, health, protected-state backups/);
  assert.doesNotMatch(security, /Production deployment identity and health are observed read-only through the Render API/);
});

test("dated historical documents are not current operator instructions", () => {
  assert.match(read("docs/AUTH_STORAGE_THREAT_REVIEW.md"), /Historical scope — August 2026 simulation-only beta/);
  assert.match(read("docs/DIZYQUANT_CAMPAIGN_CLOSURE.md"), /Historical first-campaign closure record/);
});

test("marketing screenshot README describes the shipped UI", () => {
  const guide = read("public/marketing/README.md");
  assert.match(guide, /checked-in screenshots are part of the current repository marketing UI/);
  assert.match(guide, /feature-dom\\.webp/);
  assert.match(guide, /real-feature-visuals\\.css/);
  assert.doesNotMatch(guide, /current PR deliberately adds the presentation component/);
});
