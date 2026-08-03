import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, css, globals, terminal] = await Promise.all([
  readFile("app/dizyflow-toast-rail.tsx", "utf8"),
  readFile("app/dizyflow-toast-rail.module.css", "utf8"),
  readFile("app/globals.css", "utf8"),
  readFile("app/trading-terminal.tsx", "utf8"),
]);

test("DizyFlow activity notification owns a compact reserved toolbar lane", () => {
  assert.match(component, /styles\.rail/);
  assert.match(component, /styles\.card/);
  assert.match(component, /DizyFlow activity/);
  assert.ok(css.includes("position: static !important;"));
  assert.ok(css.includes("inline-size: clamp(228px, 18vw, 258px);"));
  assert.ok(css.includes("min-block-size: 32px;"));
  assert.ok(css.includes("block-size: 30px;"));
  assert.ok(globals.includes(".flow-toast-rail{position:static!important"));
  assert.ok(!globals.includes(".flow-toast-rail{position:fixed!important"));
});

test("toolbar toast cannot cover neighbouring controls", () => {
  assert.ok(globals.includes("top:auto!important"));
  assert.ok(globals.includes(".flow-toast-rail.top-left,.flow-toast-rail.top-centre,.flow-toast-rail.top-right{left:auto!important;right:auto!important;transform:none!important}"));
  assert.ok(css.includes("flex: 0 1 258px;"));
  assert.ok(css.includes("overflow: hidden;"));
  assert.ok(css.includes("text-overflow: ellipsis;"));
  assert.ok(css.includes("box-shadow: none;"));
  assert.ok(!css.includes("position: fixed"));
});

test("toast remains in the toolbar between DizyFlow controls and execution mode", () => {
  const controls = terminal.lastIndexOf("<OrderFlowToolbar settings=");
  const toast = terminal.lastIndexOf("<DizyFlowToastRail alerts=");
  const executionMode = terminal.lastIndexOf('<div className="mode-control"');
  assert.ok(controls >= 0);
  assert.ok(toast > controls);
  assert.ok(executionMode > toast);
});

test("toolbar activity toast retains stable expiry and accessible controls", () => {
  assert.match(component, /const activeAlertId = activeAlert\?\.id \?\? null/);
  assert.match(component, /\[activeAlertId, paused, settings\.alerts\.durationMs\]/);
  assert.doesNotMatch(component, /\[paused, settings\.alerts\.durationMs, visible\]/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-atomic="true"/);
  assert.match(component, /role="status"/);
  assert.match(component, /Open DizyFlow alert history/);
  assert.match(component, /Dismiss /);
  assert.match(css, /prefers-reduced-motion/);
});
