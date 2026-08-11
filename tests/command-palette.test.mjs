import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  COMMAND_PALETTE_COMMANDS,
  COMMAND_PALETTE_SHORTCUT,
  KEYBOARD_REFERENCE,
  KEYBOARD_REFERENCE_SHORTCUT,
  availablePaletteCommands,
  filterPaletteCommands,
} from "../app/lib/command-palette.ts";

test("command identifiers and navigation destinations are deterministic", () => {
  assert.equal(
    new Set(COMMAND_PALETTE_COMMANDS.map((command) => command.id)).size,
    COMMAND_PALETTE_COMMANDS.length,
  );
  const routes = COMMAND_PALETTE_COMMANDS
    .filter((command) => command.action.type === "navigate")
    .map((command) => command.action.href);
  assert.deepEqual(routes, [
    "/terminal",
    "/scanner",
    "/structure",
    "/performance",
    "/journal",
    "/school",
    "/backup",
    "/diagnostics",
  ]);
});

test("viewer-safe commands exclude owner operations and saved layouts", () => {
  const viewer = availablePaletteCommands(false);
  assert.equal(viewer.some((command) => command.id === "navigate-backup"), false);
  assert.equal(viewer.some((command) => command.id === "navigate-ops"), false);
  assert.equal(viewer.some((command) => command.id === "launch-layouts"), false);
  assert.equal(viewer.some((command) => command.id === "navigate-scanner"), true);
  assert.equal(availablePaletteCommands(true).length, COMMAND_PALETTE_COMMANDS.length);
});

test("command search requires every query token and searches keywords", () => {
  const commands = availablePaletteCommands(true);
  assert.deepEqual(
    filterPaletteCommands(commands, "market confluence").map((command) => command.id),
    ["navigate-scanner"],
  );
  assert.deepEqual(
    filterPaletteCommands(commands, "restore recovery").map((command) => command.id),
    ["navigate-backup"],
  );
  assert.deepEqual(filterPaletteCommands(commands, "not-a-command"), []);
});

test("keyboard reference documents only implemented palette and DOM controls", () => {
  assert.equal(COMMAND_PALETTE_SHORTCUT, "Ctrl/Cmd + K");
  assert.equal(KEYBOARD_REFERENCE_SHORTCUT, "?");
  assert.equal(KEYBOARD_REFERENCE.some((item) => item.keys === "Enter"), true);
  assert.equal(KEYBOARD_REFERENCE.some((item) => item.keys === "DOM: PgUp / PgDn"), true);
  assert.equal(KEYBOARD_REFERENCE.some((item) => item.keys === "DOM: Escape"), true);
});

test("root layout mounts hydration-safe quick actions into the native terminal strip", async () => {
  const [layout, mounted, palette] = await Promise.all([
    readFile("app/layout.tsx", "utf8"),
    readFile("app/command-palette-mounted.tsx", "utf8"),
    readFile("app/command-palette.tsx", "utf8"),
  ]);
  assert.match(layout, /<CommandPaletteMounted \/>/);
  assert.match(mounted, /useSyncExternalStore/);
  assert.match(mounted, /\(\) => true, \(\) => false/);
  assert.match(mounted, /if \(!mounted\) return null;/);
  assert.match(mounted, /\.terminal-shell \.topbar \.system-strip/);
  assert.match(mounted, /MutationObserver/);
  assert.match(mounted, /className="global-quick-actions"/);
  assert.match(mounted, /<CommandPalette \/>/);
  assert.match(mounted, /<RecentShortcuts \/>/);
  assert.match(mounted, /terminalToolbar \? createPortal\(<QuickActions \/>, terminalToolbar\) : null/);
  assert.match(palette, /Control\+K Meta\+K/);
  assert.match(palette, /first-run-onboarding-trigger/);
  assert.match(palette, /workspace-layout-trigger/);
  assert.match(palette, /manual-paper-open/);
  assert.match(palette, /dizybrain-launch/);
  assert.match(palette, /prefers-reduced-motion/);
});
