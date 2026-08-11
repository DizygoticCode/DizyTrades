import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("root layout loads the protected-workspace responsive contract", async () => {
  const [layout, css, mounted, offset] = await Promise.all([
    readFile("app/layout.tsx", "utf8"),
    readFile("app/responsive-audit.css", "utf8"),
    readFile("app/command-palette-mounted.tsx", "utf8"),
    readFile("app/dizybrain-global-tool-offset.tsx", "utf8"),
  ]);
  assert.match(layout, /import "\.\/responsive-audit\.css"/);
  assert.match(css, /body:has\(\.command-palette-floating\)/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /main > header:first-child nav/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.recent-shortcuts-grid/);
  assert.match(css, /grid-template-columns: 1fr !important/);
  assert.match(css, /data-dizybrain-tool-offset/);
  assert.match(css, /--dizybrain-global-tool-offset/);
  assert.match(mounted, /DizyBrainGlobalToolOffset/);
  assert.match(offset, /getElementById\("dizybrain-workspace"\)/);
  assert.match(offset, /\.dizybrain-rail/);
  assert.match(offset, /ResizeObserver/);
});

test("Chromium audits protected workspaces and the DizyBrain control lane", async () => {
  const browser = await readFile("tests/browser/responsive-audit.spec.ts", "utf8");
  for (const route of [
    "/terminal",
    "/scanner",
    "/structure",
    "/performance",
    "/journal",
    "/school",
    "/backup",
    "/diagnostics",
  ]) {
    assert.match(browser, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(browser, /width: 360/);
  assert.match(browser, /width: 390/);
  assert.match(browser, /width: 760/);
  assert.match(browser, /width: 1440/);
  assert.match(browser, /documentElement\.scrollWidth/);
  assert.match(browser, /DizyTrades command palette/);
  assert.match(browser, /DizyTrades recent shortcuts/);
  assert.match(browser, /\.brain-close/);
  assert.match(browser, /terminal workflow triggers remain in the native strip clear of DizyBrain controls/);
});
