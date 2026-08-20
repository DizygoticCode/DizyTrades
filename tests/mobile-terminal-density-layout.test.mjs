import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const css = await readFile("app/mobile-terminal-density.css", "utf8");

test("compact rail owns a fixed phone-height slot ahead of Manual Paper", () => {
  assert.match(css, /\.mobile-density-rail \{[\s\S]*order: 90;[\s\S]*flex: 0 0 34px;/);
  assert.match(css, /#manual-paper-panel \{\s*order: 100;/s);
  assert.match(
    css,
    /\.terminal-primary-column > #manual-paper-panel:not\(:has\(aside\)\) \{\s*flex: 0 0 34px !important;[\s\S]*max-height: 34px !important;/s,
  );
});

test("short landscape keeps the compact rail and collapsed Paper flex slot bounded", () => {
  assert.match(css, /@media \(max-width: 900px\) and \(max-height: 500px\)/);
  assert.match(css, /\.mobile-density-rail \{\s*flex-basis: 30px;/s);
  assert.match(
    css,
    /\.terminal-primary-column > #manual-paper-panel:not\(:has\(aside\)\) \{\s*flex: 0 0 30px !important;[\s\S]*max-height: 30px !important;/s,
  );
});
