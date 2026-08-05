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

test("Commands and Recent are portalled into the terminal system strip", () => {
  assert.match(mounted, /document\.querySelector<HTMLElement>\("\.topbar \.system-strip"\)/);
  assert.match(mounted, /createPortal\(quickActions, terminalAnchor\)/);
  assert.match(mounted, /className="global-quick-actions"/);
  assert.match(visualFixes, /\.terminal-shell \.global-quick-actions/);
  assert.match(visualFixes, /position: static;/);
  assert.doesNotMatch(visualFixes, /\.global-quick-actions[^}]*position: fixed/s);
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
