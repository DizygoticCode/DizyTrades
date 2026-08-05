import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [
  layout,
  mounted,
  visualFixes,
  responsivePolish,
  globals,
  terminal,
  orderFlowToolbar,
] = await Promise.all([
  readFile("app/layout.tsx", "utf8"),
  readFile("app/command-palette-mounted.tsx", "utf8"),
  readFile("app/terminal-visual-fixes.css", "utf8"),
  readFile("app/terminal-responsive-polish.css", "utf8"),
  readFile("app/globals.css", "utf8"),
  readFile("app/trading-terminal.tsx", "utf8"),
  readFile("app/order-flow-toolbar.tsx", "utf8"),
]);

test("terminal responsive polish is the final global stylesheet", () => {
  const terminalStyles = layout.indexOf('import "./terminal-visual-fixes.css";');
  const responsiveStyles = layout.indexOf(
    'import "./terminal-responsive-polish.css";',
  );
  assert.ok(terminalStyles >= 0);
  assert.ok(responsiveStyles > terminalStyles);
});

test("Commands and Recent occupy a full-size reserved row below the topbar", () => {
  assert.match(mounted, /className="global-quick-actions"/);
  assert.match(mounted, /<CommandPalette \/>/);
  assert.match(mounted, /<RecentShortcuts \/>/);
  assert.doesNotMatch(mounted, /createPortal|MutationObserver|querySelector/);
  assert.match(
    responsivePolish,
    /\.terminal-body-layout \{\s*padding-top: 50px;/s,
  );
  assert.match(
    responsivePolish,
    /\.global-quick-actions \{\s*position: absolute;[^}]*top: 68px;/s,
  );
  assert.match(responsivePolish, /flex-flow: row wrap;/);
  assert.match(responsivePolish, /min-width: max-content !important;/);
  assert.match(responsivePolish, /font-size: 10px !important;/);
});

test("user settings remains a full-height independent terminal sidebar", () => {
  assert.match(terminal, /className="settings-panel"/);
  assert.match(
    visualFixes,
    /\.terminal-primary-column:has\(\.settings-panel\) \{\s*padding-right: 342px;/s,
  );
  assert.match(
    visualFixes,
    /\.settings-panel \{\s*position: absolute !important;/s,
  );
  assert.match(visualFixes, /top: 0;\s*right: 0;\s*bottom: 0;/s);
  assert.doesNotMatch(visualFixes, /grid-template-areas: "chart dom settings";/);
});

test("DizyFlow purple controls wrap without an internal horizontal scrollbar", () => {
  assert.match(orderFlowToolbar, /className="dizyflow-controls"/);
  assert.match(orderFlowToolbar, /className="flow-component-toggles"/);
  assert.match(
    responsivePolish,
    /\.dizyflow-controls \{[^}]*min-width: 0 !important;[^}]*max-width: 100% !important;/s,
  );
  assert.match(
    responsivePolish,
    /\.flow-component-toggles \{[^}]*flex-wrap: wrap !important;[^}]*overflow: visible !important;/s,
  );
  assert.doesNotMatch(
    responsivePolish,
    /\.flow-component-toggles \{[^}]*overflow-x: auto;/s,
  );
});

test("DOM ladder cannot exceed or horizontally scroll its own lane", () => {
  assert.match(globals, /\.dom-head,.dom-row\{[^}]*min-width:270px/);
  assert.match(
    responsivePolish,
    /clamp\(270px, var\(--dom-width, 280px\), 380px\)/,
  );
  assert.match(
    responsivePolish,
    /\.dizyflow-dom \{[^}]*width: 100% !important;[^}]*overflow: hidden !important;/s,
  );
  assert.match(
    responsivePolish,
    /\.dom-head,[\s\S]*\.dom-row \{[\s\S]*min-width: 0 !important;/,
  );
  assert.match(
    responsivePolish,
    /\.dom-book \{\s*overflow-x: hidden !important;\s*overflow-y: auto !important;/s,
  );
});

test("setup dock below the chart reflows when settings reduce chart width", () => {
  assert.match(terminal, /className="signal-dock"/);
  assert.match(
    responsivePolish,
    /\.terminal-primary-column:has\(\.settings-panel\) \.signal-dock/,
  );
  assert.match(
    responsivePolish,
    /repeat\(auto-fit, minmax\(min\(142px, 100%\), 1fr\)\) !important;/,
  );
  assert.match(
    responsivePolish,
    /\.chart-section \{\s*min-width: 0;\s*overflow: hidden;/s,
  );
});

test("market activity toast centres both text lines in the taller card", () => {
  assert.match(
    visualFixes,
    /\.flow-toast-rail \{[^}]*block-size: 44px !important;/s,
  );
  assert.match(
    responsivePolish,
    /\.flow-toast-rail > article > span:nth-of-type\(1\) \{[^}]*align-items: center !important;[^}]*justify-content: center !important;[^}]*text-align: center;/s,
  );
});
