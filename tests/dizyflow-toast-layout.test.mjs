import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, css, globals] = await Promise.all([
  readFile("app/dizyflow-toast-rail.tsx", "utf8"),
  readFile("app/dizyflow-toast-rail.module.css", "utf8"),
  readFile("app/globals.css", "utf8"),
]);

test("DizyFlow activity notification is a compact bounded floating overlay", () => {
  assert.match(component, /styles\.rail/);
  assert.match(component, /styles\.card/);
  assert.match(component, /DizyFlow activity/);
  assert.ok(css.includes("position: fixed !important;"));
  assert.ok(css.includes("inline-size: min(292px, calc(100vw - 24px));"));
  assert.ok(css.includes("pointer-events: none;"));
  assert.ok(css.includes("min-block-size: 60px;"));
  assert.ok(globals.includes(".flow-toast-rail{position:fixed!important"));
  assert.ok(!globals.includes(".flow-toast-rail{position:static!important"));
});

test("toast placement and content cannot resize the terminal toolbar", () => {
  assert.ok(globals.includes(".flow-toast-rail.top-left{left:18px!important"));
  assert.ok(globals.includes(".flow-toast-rail.top-centre{left:50%!important"));
  assert.ok(globals.includes(".flow-toast-rail.top-right{right:18px!important"));
  assert.ok(css.includes(":global(.top-left)"));
  assert.ok(css.includes(":global(.top-centre)"));
  assert.ok(css.includes(":global(.top-right)"));
  assert.ok(!css.includes("inline-size: clamp(340px, 26vw, 440px)"));
  assert.ok(css.includes("text-overflow: ellipsis;"));
  assert.ok(css.includes("box-shadow: 0 12px 30px"));
});

test("floating activity toast has stable expiry and accessible controls", () => {
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
