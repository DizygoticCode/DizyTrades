import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [layout, mounted, visualFixes, terminal, orderFlowToolbar] = await Promise.all([
  readFile("app/layout.tsx", "utf8"),
  readFile("app/command-palette-mounted.tsx", "utf8"),
  readFile("app/terminal-visual-fixes.css", "utf8"),
  readFile("app/trading-terminal.tsx", "utf8"),
  readFile("app/order-flow-toolbar.tsx", "utf8"),
]);

test("terminal visual contract loads after every prior global stylesheet", () => {
  const featureStyles = layout.indexOf('import "./marketing/real-feature-visuals.css";');
  const terminalStyles = layout.indexOf('import "./terminal-visual-fixes.css";');
  assert.ok(featureStyles >= 0);
  assert.ok(terminalStyles > featureStyles);
});

test("Commands and Recent share a reserved hydration-safe terminal topbar dock", () => {
  assert.match(mounted, /className="global-quick-actions"/);
  assert.match(mounted, /<CommandPalette \/>/);
  assert.match(mounted, /<RecentShortcuts \/>/);
  assert.doesNotMatch(mounted, /createPortal|MutationObserver|querySelector/);
  assert.match(visualFixes, /body:has\(\.terminal-shell\) \.system-strip \{[^}]*padding-right: 214px;/s);
  assert.match(visualFixes, /body:has\(\.terminal-shell\) \.global-quick-actions \{\s*position: fixed;/s);
  assert.match(visualFixes, /right: calc\(max\(224px, var\(--dizybrain-global-tool-offset, 0px\)\) \+ 12px\);/);
  assert.match(visualFixes, /\.global-quick-actions \.command-palette-floating,[^}]*position: static !important;/s);
  assert.match(visualFixes, /flex-direction: column-reverse;/);
});

test("user settings is a full-height independent terminal sidebar", () => {
  assert.match(terminal, /className="settings-panel"/);
  assert.match(visualFixes, /\.terminal-primary-column:has\(\.settings-panel\) \{\s*padding-right: 342px;/s);
  assert.match(visualFixes, /\.settings-panel \{\s*position: absolute !important;/s);
  assert.match(visualFixes, /top: 0;\s*right: 0;\s*bottom: 0;/s);
  assert.match(visualFixes, /grid-template-areas: "chart dom";/);
  assert.doesNotMatch(visualFixes, /grid-template-areas: "chart dom settings";/);
  assert.match(visualFixes, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
});

test("DizyFlow purple controls remain one bounded scrollable toolbar group", () => {
  assert.match(orderFlowToolbar, /className="dizyflow-controls"/);
  assert.match(orderFlowToolbar, /className="flow-component-toggles"/);
  assert.match(visualFixes, /\.dizyflow-controls \{[^}]*grid-template-columns: auto minmax\(0, 1fr\) !important;/s);
  assert.match(visualFixes, /\.dizyflow-controls \{[^}]*overflow: hidden;/s);
  assert.match(visualFixes, /\.flow-component-toggles \{[^}]*overflow-x: auto;/s);
  assert.match(visualFixes, /\.flow-component-toggles > button \{\s*flex: 0 0 auto;/s);
});

test("wall and large-market toast keeps a readable two-line height", () => {
  assert.match(visualFixes, /\.flow-toast-rail \{[^}]*block-size: 44px !important;/s);
  assert.match(visualFixes, /\.flow-toast-rail > article \{[^}]*block-size: 42px !important;/s);
  assert.match(visualFixes, /\.flow-toast-rail > article > i \{\s*min-block-size: 30px !important;/s);
});
