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
});
