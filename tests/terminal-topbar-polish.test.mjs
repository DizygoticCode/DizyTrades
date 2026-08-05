import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [layout, polish, terminal, manualPaper] = await Promise.all([
  readFile("app/layout.tsx", "utf8"),
  readFile("app/terminal-topbar-polish.css", "utf8"),
  readFile("app/trading-terminal.tsx", "utf8"),
  readFile("app/manual-paper-ticket.tsx", "utf8"),
]);

test("compact topbar polish is the final global stylesheet", () => {
  const scrollbar = layout.indexOf('import "./terminal-scrollbar-polish.css";');
  const topbar = layout.indexOf('import "./terminal-topbar-polish.css";');
  assert.ok(scrollbar >= 0);
  assert.ok(topbar > scrollbar);
});

test("Dizy destinations remain first and operational badges use the lower lane", () => {
  assert.match(terminal, /className="system-strip"/);
  assert.match(terminal, /className="confirmed"/);
  assert.match(terminal, /className="test-mode"/);
  assert.match(terminal, /className="lock-status"/);
  assert.match(
    polish,
    /\.system-strip > \.nav-tab \{[^}]*order: 1;[^}]*font-size: 8\.5px;/s,
  );
  assert.match(
    polish,
    /\.system-strip::after \{[^}]*order: 2;[^}]*flex: 0 0 100%;/s,
  );
  assert.match(
    polish,
    /\.system-strip > \.connection,[\s\S]*\.system-strip > \.lock-status,[\s\S]*\.system-strip > \.viewer-badge \{[^}]*order: 3;[^}]*min-height: 20px;[^}]*font-size: 8px;/s,
  );
  assert.match(polish, /height: 112px;/);
  assert.match(polish, /row-gap: 11px;/);
});

test("collapsed Manual Paper reserves clearance for the DizyBrain launcher", () => {
  assert.match(manualPaper, /id="manual-paper-panel"/);
  assert.match(manualPaper, /style=\{collapsed \? undefined : \{ height \}\}/);
  assert.match(
    polish,
    /body:has\(#manual-paper-panel:not\(\[style\*="height"\]\)\) \.dizybrain-launch \{[^}]*bottom: calc\(50px \+ env\(safe-area-inset-bottom, 0px\)\);/s,
  );
});
