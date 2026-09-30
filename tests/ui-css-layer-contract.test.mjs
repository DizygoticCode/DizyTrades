import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("app/layout.tsx", "utf8");
const polish = readFileSync("app/terminal-responsive-polish.css", "utf8");
const mobile = readFileSync("app/terminal-responsive-mobile.css", "utf8");

test("terminal CSS layers keep the final mobile override last", () => {
  const order = [
    "./terminal-visual-fixes.css",
    "./terminal-responsive-polish.css",
    "./terminal-scrollbar-polish.css",
    "./terminal-topbar-polish.css",
    "./mobile-terminal-density.css",
    "./terminal-responsive-mobile.css",
  ].map((name) => layout.indexOf(`import "${name}";`));

  for (const index of order) assert.ok(index >= 0, "expected terminal stylesheet import is present");
  for (let index = 1; index < order.length; index += 1) {
    assert.ok(order[index] > order[index - 1], "terminal stylesheet cascade order changed");
  }
});

test("final phone layer neutralises legacy fixed quick-actions and uses safe-area-aware panels", () => {
  assert.match(mobile, /@media\s*\(max-width:\s*760px\)/);
  assert.match(
    mobile,
    /body:has\(\.terminal-shell\) \.system-strip > \.global-quick-actions\s*\{[\s\S]*?position:\s*static\s*!important;[\s\S]*?order:\s*1\s*!important;/,
  );
  assert.match(
    mobile,
    /\.terminal-shell \.settings-panel\s*\{[\s\S]*?top:\s*var\(--dizy-product-nav-height,\s*76px\)\s*!important;/,
  );
  assert.match(
    mobile,
    /body:has\(\.terminal-shell\) \.system-strip\s*\{[\s\S]*?overflow-x:\s*auto\s*!important;[\s\S]*?overflow-y:\s*hidden\s*!important;/,
  );
});


test("short desktop viewports preserve chart room beside expanded Manual Paper", () => {
  assert.match(polish, /@media\s*\(min-width:\s*761px\)\s*and\s*\(max-height:\s*850px\)/);
  assert.match(
    polish,
    /#manual-paper-panel\[style\*="height"\]\s*\{[\s\S]*?min-height:\s*min\(260px,\s*34dvh\)\s*!important;[\s\S]*?max-height:\s*min\(300px,\s*34dvh\)\s*!important;/,
  );
});
