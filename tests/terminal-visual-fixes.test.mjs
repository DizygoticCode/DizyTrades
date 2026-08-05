import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [
  layout,
  mounted,
  visualFixes,
  responsivePolish,
  scrollbarPolish,
  globals,
  terminal,
  orderFlowToolbar,
] = await Promise.all([
  readFile("app/layout.tsx", "utf8"),
  readFile("app/command-palette-mounted.tsx", "utf8"),
  readFile("app/terminal-visual-fixes.css", "utf8"),
  readFile("app/terminal-responsive-polish.css", "utf8"),
  readFile("app/terminal-scrollbar-polish.css", "utf8"),
  readFile("app/globals.css", "utf8"),
  readFile("app/trading-terminal.tsx", "utf8"),
  readFile("app/order-flow-toolbar.tsx", "utf8"),
]);

test("terminal scrollbar polish is the final global stylesheet", () => {
  const terminalStyles = layout.indexOf('import "./terminal-visual-fixes.css";');
  const responsiveStyles = layout.indexOf(
    'import "./terminal-responsive-polish.css";',
  );
  const mobileStyles = layout.indexOf(
    'import "./terminal-responsive-mobile.css";',
  );
  const scrollbarStyles = layout.indexOf(
    'import "./terminal-scrollbar-polish.css";',
  );
  assert.ok(terminalStyles >= 0);
  assert.ok(responsiveStyles > terminalStyles);
  assert.ok(mobileStyles > responsiveStyles);
  assert.ok(scrollbarStyles > mobileStyles);
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
  assert.match(orderFlowToolbar, /dizyflow-controls/);
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

test("DizyFlow is content-sized and denser on desktop", () => {
  assert.match(
    scrollbarPolish,
    /@media \(min-width: 761px\)[\s\S]*\.dizyflow-controls \{[^}]*width: fit-content;[^}]*flex: 0 1 auto !important;/,
  );
  assert.match(
    scrollbarPolish,
    /\.flow-component-toggles button,[\s\S]*\.flow-history-button \{[^}]*padding: 2px 5px;[^}]*font-size: 8\.5px;/,
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
    scrollbarPolish,
    /\.dom-book \{[^}]*overflow-x: hidden !important;[^}]*overflow-y: auto !important;[^}]*scrollbar-width: none;/s,
  );
});

test("chart and DOM retain scrolling without visible vertical rails", () => {
  assert.match(
    scrollbarPolish,
    /\.drawing-toolbar \{[^}]*overflow-y: auto;[^}]*scrollbar-width: none;/s,
  );
  assert.match(
    scrollbarPolish,
    /\.drawing-toolbar::-webkit-scrollbar \{\s*display: none;/s,
  );
  assert.match(
    scrollbarPolish,
    /\.dom-book::-webkit-scrollbar \{\s*display: none;/s,
  );
});

test("DOM footer help is modestly larger and higher contrast", () => {
  assert.match(
    scrollbarPolish,
    /\.dizyflow-dom footer \{[^}]*font-size: 9px;[^}]*color: #9aa6bb;/s,
  );
  assert.match(
    scrollbarPolish,
    /\.dizyflow-dom footer small \{[^}]*font-size: 9px;[^}]*color: #d1a66d;/s,
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
    scrollbarPolish,
    /\.flow-toast-rail > article \{[^}]*grid-template-columns: 3px minmax\(0, 1fr\) auto !important;[^}]*grid-template-rows: minmax\(0, 1fr\) !important;[^}]*align-items: center !important;[^}]*block-size: 42px !important;/s,
  );
  assert.match(
    scrollbarPolish,
    /\.flow-toast-rail > article > span:first-of-type \{[^}]*align-self: stretch !important;[^}]*justify-content: center !important;[^}]*text-align: center;/s,
  );
});
