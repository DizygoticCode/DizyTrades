import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("terminal quick actions portal into the native system strip only", async () => {
  const source = await read("app/command-palette-mounted.tsx");
  assert.match(source, /\.terminal-shell \.topbar \.system-strip/);
  assert.match(source, /terminalToolbar \? createPortal\(<QuickActions \/>, terminalToolbar\) : null/);
  assert.doesNotMatch(source, /: <QuickActions \/>/);
  assert.equal((source.match(/<CommandPalette \/>/g) ?? []).length, 1);
  assert.equal((source.match(/<RecentShortcuts \/>/g) ?? []).length, 1);
});

test("terminal shell uses one compact native toolbar row without phantom body padding", async () => {
  const css = await read("app/navigation-shell-cleanup.css");
  assert.match(css, /height: 62px !important/);
  assert.match(css, /flex-wrap: nowrap !important/);
  assert.match(css, /system-strip > \.global-quick-actions/);
  assert.match(css, /margin-left: auto/);
  assert.match(css, /terminal-body-layout[\s\S]*padding-top: 0 !important/);
});

test("legacy page headers cannot duplicate shared Dizy product links", async () => {
  const css = await read("app/navigation-shell-cleanup.css");
  for (const href of [
    "/terminal",
    "/explore",
    "/school",
    "/research",
    "/account",
    "/scanner",
    "/structure",
    "/performance",
    "/journal",
    "/backup",
    "/diagnostics",
    "/dex",
  ]) {
    assert.match(css, new RegExp(`href=\\"${href.replaceAll("/", "\\/")}\\"`));
  }
});

test("navigation cleanup stylesheet loads after earlier terminal layout layers", async () => {
  const layout = await read("app/layout.tsx");
  const oldLayer = layout.indexOf('import "./terminal-topbar-polish.css"');
  const cleanup = layout.indexOf('import "./navigation-shell-cleanup.css"');
  assert.ok(oldLayer >= 0);
  assert.ok(cleanup > oldLayer);
});
