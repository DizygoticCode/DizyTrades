import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controlSource = await readFile(
  new URL("../app/lib/mexc-owner-connection-control.ts", import.meta.url),
  "utf8",
);
const snapshotSource = await readFile(
  new URL("../app/lib/mexc-owner-account-snapshot.ts", import.meta.url),
  "utf8",
);
const pageSource = await readFile(
  new URL("../app/account/control/page.tsx", import.meta.url),
  "utf8",
);
const routeSource = await readFile(
  new URL("../app/account/control/shutdown/route.ts", import.meta.url),
  "utf8",
);
const layoutSource = await readFile(
  new URL("../app/account/layout.tsx", import.meta.url),
  "utf8",
);

test("persistent shutdown control contains no exchange or DizyPaper mutation capability", () => {
  assert.match(controlSource, /state:\s*"sealed"/);
  assert.match(controlSource, /localPrivateReadsBlocked/);
  assert.match(controlSource, /atomicWrite\(persistent/);
  assert.match(controlSource, /kind:\s*"connection-control"/);
  assert.match(controlSource, /exchangeWriteCapability:\s*"none"/);
  assert.doesNotMatch(controlSource, /requestMexcPrivateRead|requireMexcReadOnlyCredentials/);
  assert.doesNotMatch(controlSource, /submitManualOrder|closeManual|reverseManual|flattenManual/);
  assert.doesNotMatch(controlSource, /fetch\(/);
  assert.doesNotMatch(controlSource, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(controlSource, /atomicWrite\([^)]*environment/);
});

test("account refresh checks the local seal before activation, credentials and fetch", () => {
  const controlCheck = snapshotSource.indexOf("const connectionControl = await");
  const activation = snapshotSource.indexOf("const activation = buildMexcReadOnlyCredentialActivationReport");
  const credentials = snapshotSource.indexOf("const credentials = requireMexcReadOnlyCredentials");
  const privateRead = snapshotSource.indexOf("requestMexcPrivateRead(");
  assert.ok(controlCheck >= 0);
  assert.ok(activation > controlCheck);
  assert.ok(credentials > controlCheck);
  assert.ok(privateRead > credentials);
  assert.match(snapshotSource, /if \(connectionControl\.localPrivateReadsBlocked\)/);
  assert.match(snapshotSource, /scrubMexcPrivateEnvironmentForLocalSeal/);
});

test("browser shutdown action is authenticated, owner-only and same-origin", () => {
  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /requireApiUser\(\)/);
  assert.match(routeSource, /user\.role\s*!==\s*"owner"/);
  assert.match(routeSource, /origin !== request\.nextUrl\.origin/);
  assert.match(routeSource, /sealOwnerMexcConnection/);
  assert.doesNotMatch(routeSource, /requestMexcPrivateRead|requireMexcReadOnlyCredentials/);
  assert.doesNotMatch(routeSource, /export async function (?:PUT|PATCH|DELETE)/);
});

test("connection-control UI exposes shutdown and removal verification but no browser reactivation", () => {
  assert.match(pageSource, /MEXC connection shutdown/);
  assert.match(pageSource, /credentialRemovalConfirmed/);
  assert.match(pageSource, /This seal\s*is intentionally not reversible from the browser/);
  assert.match(pageSource, /method="post"/);
  assert.match(layoutSource, /href="\/account\/control"/);
  assert.doesNotMatch(`${pageSource}\n${routeSource}`, /reactivate|re-enable private reads/i);
});
