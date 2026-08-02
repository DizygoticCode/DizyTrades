import assert from "node:assert/strict";
import test from "node:test";
import {
  clampDizyBrainWidth,
  DEFAULT_DIZYBRAIN_PREFERENCES,
  DIZYBRAIN_DEFAULT_WIDTH,
  DIZYBRAIN_MAX_WIDTH,
  DIZYBRAIN_MIN_WIDTH,
  DIZYBRAIN_MODULES,
  parseDizyBrainPreferences,
  presentOverviewFlow,
  shouldUseDizyBrainOverlay,
} from "../app/lib/dizybrain-workspace.ts";

test("workspace registry is typed, ordered, and complete", () => {
  assert.deepEqual(DIZYBRAIN_MODULES.map(({ id }) => id), ["overview", "signals", "flow", "position", "replay", "journal", "behaviour", "diagnostics"]);
});

test("responsive dock preserves the chart minimum and persisted panel width", () => {
  assert.equal(shouldUseDizyBrainOverlay(900, DIZYBRAIN_DEFAULT_WIDTH), true);
  assert.equal(shouldUseDizyBrainOverlay(901, DIZYBRAIN_DEFAULT_WIDTH), true);
  assert.equal(shouldUseDizyBrainOverlay(1120, DIZYBRAIN_MAX_WIDTH), true);
  assert.equal(shouldUseDizyBrainOverlay(1200, DIZYBRAIN_DEFAULT_WIDTH), false);
  assert.equal(shouldUseDizyBrainOverlay(1200, DIZYBRAIN_MAX_WIDTH), false);
});

test("Replay overview content is invariant when current live Flow changes", () => {
  const first = presentOverviewFlow(true, { availability:"available", intelligenceConfidence:99, confidenceBand:"high", walls:{candidates:[1,2,3]} });
  const changed = presentOverviewFlow(true, { availability:"stale", intelligenceConfidence:1, confidenceBand:"insufficient", walls:{candidates:[]} });
  assert.deepEqual(first, changed);
  assert.deepEqual(first, { hidden:true, message:"Live DizyFlow hidden during historical Replay." });
  assert.doesNotMatch(JSON.stringify(first), /99|walls|available/);
});

test("workspace preferences safely default without browser storage", () => {
  assert.equal(parseDizyBrainPreferences(null), DEFAULT_DIZYBRAIN_PREFERENCES);
  assert.equal(parseDizyBrainPreferences("not json"), DEFAULT_DIZYBRAIN_PREFERENCES);
});

test("workspace preferences reject invalid modules and migrate partial values", () => {
  assert.deepEqual(parseDizyBrainPreferences(JSON.stringify({ open: true, selectedModule: "prediction", width: 450 })), {
    open: true, collapsed: false, width: 450, selectedModule: "overview",
  });
  assert.equal(parseDizyBrainPreferences(JSON.stringify({ selectedModule: "flow" })).selectedModule, "flow");
});

test("workspace width is deterministically clamped", () => {
  assert.equal(clampDizyBrainWidth(-1), DIZYBRAIN_MIN_WIDTH);
  assert.equal(clampDizyBrainWidth(9999), DIZYBRAIN_MAX_WIDTH);
  assert.equal(clampDizyBrainWidth(Number.NaN), DIZYBRAIN_DEFAULT_WIDTH);
});

test("workspace source preserves launcher, focus, resize, and compact-toolbar boundaries", async () => {
  const { readFile } = await import("node:fs/promises");
  const [brain, toolbar, paper, terminal] = await Promise.all([
    readFile("app/dizybrain-shell.tsx", "utf8"),
    readFile("app/order-flow-toolbar.tsx", "utf8"),
    readFile("app/manual-paper-ticket.tsx", "utf8"),
    readFile("app/trading-terminal.tsx", "utf8"),
  ]);
  assert.match(brain, /role="separator"/);
  assert.match(brain, /event\.key === "Escape"/);
  assert.match(brain, /lastTrigger\.current/);
  assert.match(brain, /dizybrain-rail/);
  assert.match(toolbar, /open\("flow", event\.currentTarget\)/);
  assert.doesNotMatch(toolbar, /market-depth-summary|DizyFlow Intelligence<|flow-diagnostics/);
  assert.match(paper, /id="manual-paper-panel"/);
  assert.match(brain, /getElementById\("manual-paper-panel"\)/);
  assert.doesNotMatch(brain, /dizybrain-panel/);
  assert.match(terminal, /analysis-layout/);
});
