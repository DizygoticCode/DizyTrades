import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellPath = new URL("../app/dizybrain-shell.tsx", import.meta.url);
const pagePath = new URL("../app/terminal/page.tsx", import.meta.url);

test("terminal exposes the unified DizyBrain analysis workspace", async () => {
  const [shell, page] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(page, /DizyBrainShell/);
  assert.match(shell, /Analysis Workspace/);
  assert.match(shell, /Current confirmed-candle evidence/);
  assert.match(shell, /Qualification checks/);
  assert.match(shell, /Current setup timeline/);
  assert.match(shell, /Classification is not a prediction/);
  assert.match(shell, /DizyBrainWorkspace/);
  assert.match(shell, /DizyBrainSnapshot/);
  assert.doesNotMatch(shell, /MutationObserver|textContent/);
  assert.doesNotMatch(shell, /fetch\(/);
});
