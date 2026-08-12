import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const servicePath = new URL("../app/lib/credential-provisioning/index.ts", import.meta.url);
const routePath = new URL("../app/api/account/credential-provisioning/route.ts", import.meta.url);
const panelPath = new URL("../app/account/profile/credential-provisioning-panel.tsx", import.meta.url);
const authorizationPath = new URL("../app/account/profile/credential-authorization-form.tsx", import.meta.url);

test("provisioning stays networkless, purpose-bound, digest-only, and custody-only", async () => {
  const source = await readFile(servicePath, "utf8");
  assert.doesNotMatch(source, /fetch\s*\(|mexc-private|sign(?:ature|Request)|execution\//i);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /purpose TEXT NOT NULL CHECK\(purpose IN \('provision','revoke'\)\)/);
  assert.match(source, /consumed_at IS NULL AND expires_at>/);
  assert.match(source, /DELETE FROM credential_provisioning_authorizations WHERE user_id=\? AND purpose=\?/);
  assert.match(source, /userId !== "rob".*user\?\.id !== "rob".*user\.role !== "owner"/);
  assert.doesNotMatch(source, /apiKey.*INSERT|apiSecret.*INSERT/);
});

test("route requires database session, origin checks, bounded bodies and HttpOnly strict cookie", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /databaseSession\(sessionToken\)/);
  assert.doesNotMatch(source, /parseSessionToken/);
  assert.match(source, /validRequestOrigin\(request\)/);
  assert.match(source, /2_048/);
  assert.match(source, /httpOnly: true, sameSite: "strict"/);
  assert.match(source, /"Cache-Control": "no-store"/);
});

test("browser panel never persists or re-renders credential values", async () => {
  const source = await readFile(panelPath, "utf8");
  const clientSource = await readFile(authorizationPath, "utf8");
  assert.doesNotMatch(clientSource, /apiKey|apiSecret|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /"use client"|fetch\s*\(|FormData|JSON\.stringify/);
  assert.match(source, /method="post"/);
  assert.match(source, /does not enable live trading/i);
});
