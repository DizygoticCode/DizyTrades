import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellPath = new URL("../app/dizybrain-shell.tsx", import.meta.url);
const pagePath = new URL("../app/terminal/page.tsx", import.meta.url);

test("terminal exposes the DizyBrain transparent signal reasoning workspace", async () => {
  const [shell, page] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(page, /DizyBrainShell/);
  assert.match(shell, /Transparent Signal Reasoning/);
  assert.match(shell, /Explain current signal/);
  assert.match(shell, /Overall confidence/);
  assert.match(shell, /Qualified because/);
  assert.match(shell, /existing .* DizySignals confluence score/);
  assert.match(shell, /It is not a prediction/);
  assert.match(shell, /DizyBrainSnapshot/);
  assert.doesNotMatch(shell, /MutationObserver|querySelector|textContent/);
  assert.doesNotMatch(shell, /fetch\(/);
});
