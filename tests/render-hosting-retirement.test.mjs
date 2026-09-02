import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("retired Render hosting surface does not remain in the repository", async () => {
  const retiredPaths = [
    "render.yaml",
    ".github/workflows/render-rehearsal.yml",
    "app/lib/render-memory-profile.ts",
    "scripts/render-rehearsal.mjs",
    "tests/render-rehearsal.test.mjs",
    "docs/RENDER_REHEARSAL.md",
    "docs/RENDER_ACCOUNT_EMAIL_DEPLOYMENT.md",
  ];

  const existing = [];
  for (const path of retiredPaths) {
    if (await exists(path)) existing.push(path);
  }
  assert.deepEqual(existing, []);

  const env = await readFile(".env.example", "utf8");
  const instrumentation = await readFile("instrumentation.ts", "utf8");
  assert.doesNotMatch(
    env,
    /onrender\.com|DIZYFLOW_RENDER_LOW_MEMORY_PROFILE|RENDER=true/,
  );
  assert.doesNotMatch(
    instrumentation,
    /render-memory-profile|ConstrainedRender|Render bridge/,
  );

  const accountEmailDeployment = await readFile(
    "docs/ACCOUNT_EMAIL_DEPLOYMENT.md",
    "utf8",
  );
  assert.match(accountEmailDeployment, /APP_BASE_URL=https:\/\/dizytrades\.tech/);
  assert.doesNotMatch(accountEmailDeployment, /Render|onrender\.com|render\.yaml/);
});
