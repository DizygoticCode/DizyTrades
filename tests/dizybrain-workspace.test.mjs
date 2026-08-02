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
} from "../app/lib/dizybrain-workspace.ts";

test("workspace registry is typed, ordered, and complete", () => {
  assert.deepEqual(DIZYBRAIN_MODULES.map(({ id }) => id), ["overview", "signals", "flow", "position", "replay", "journal", "behaviour", "diagnostics"]);
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
