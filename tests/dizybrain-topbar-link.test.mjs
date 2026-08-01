import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const linkPath = new URL("../app/dizybrain-topbar-link.tsx", import.meta.url);
const pagePath = new URL("../app/terminal/page.tsx", import.meta.url);

test("DizyBrain is discoverable from the terminal topbar", async () => {
  const [link, page] = await Promise.all([
    readFile(linkPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(link, /\.topbar \.system-strip/);
  assert.match(link, /DizyBrain/);
  assert.match(link, /\.dizybrain-launch/);
  assert.match(page, /<DizyBrainTopbarLink \/>/);
});
