import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("terminal topbar exposes the bounded DizyQuant research page", async () => {
  const source = await readFile("app/dizybrain-topbar-link.tsx", "utf8");

  assert.match(source, /className="nav-tab dizyquant-topbar-link"/);
  assert.match(source, /href="\/research"/);
  assert.match(source, />∑ DizyQuant<\/a>/);
  assert.match(source, /Open bounded DizyQuant microstructure research/);

  const imports = source
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");
  assert.doesNotMatch(imports, /lib\/dizyquant|order-flow|depth-collector|RawTrade|live-order/i);
});
