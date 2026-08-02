import assert from "node:assert/strict";
import test from "node:test";
import {
  academyLessonGroups,
  academyLessons,
  academyProgressKey,
  filterAcademyLessons,
  readAcademyProgress,
  writeAcademyProgress,
} from "../app/school/academy-catalogue.ts";
import { canAccessOperations } from "../app/lib/operations-access.ts";
import {
  DEFAULT_ORDER_FLOW_SETTINGS,
  DOM_SAFE_MINIMUM_WIDTH,
  sanitiseOrderFlowSettings,
} from "../app/lib/order-flow/settings.ts";

const workflowSlugs = [
  "dizy-workflow-overview",
  "dizyscanner-watchlists",
  "dizystructure-workspace",
  "dizyreplay-historical-flow",
  "guided-trade-review",
  "dizyperformance-dashboard",
  "dizybrain-behaviour",
  "dizyops-diagnostics",
  "dizybackup-recovery",
];

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    value(key) {
      return values.get(key);
    },
  };
}

test("Academy exposes the complete current DizyTrades workflow course", () => {
  assert.ok(academyLessonGroups.includes("Current DizyTrades Workflow"));
  const slugs = academyLessons.map((lesson) => lesson.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of workflowSlugs) assert.ok(slugs.includes(slug), slug);
  assert.equal(
    academyLessons.filter((lesson) => lesson.group === "Current DizyTrades Workflow").length,
    workflowSlugs.length,
  );
});

test("Academy search reaches newly shipped workflows", () => {
  assert.deepEqual(
    filterAcademyLessons("saved watchlists").map((lesson) => lesson.slug),
    ["dizyscanner-watchlists"],
  );
  assert.ok(
    filterAcademyLessons("Historical DizyFlow").some(
      (lesson) => lesson.slug === "dizyreplay-historical-flow",
    ),
  );
  assert.ok(
    filterAcademyLessons("owner admin").some(
      (lesson) => lesson.slug === "dizyops-diagnostics",
    ),
  );
});

test("Academy progress migrates, deduplicates and drops unknown lessons", () => {
  const storage = memoryStorage({
    "dizyschool-progress-v1": JSON.stringify(["welcome", "unknown-lesson"]),
    "dizyschool-progress-v2": JSON.stringify(["welcome", "dizyscanner-watchlists"]),
    [academyProgressKey]: JSON.stringify(["dizybackup-recovery"]),
  });
  assert.deepEqual(readAcademyProgress(storage), [
    "welcome",
    "dizyscanner-watchlists",
    "dizybackup-recovery",
  ]);

  writeAcademyProgress(storage, [
    "dizybackup-recovery",
    "dizybackup-recovery",
    "not-a-lesson",
    "guided-trade-review",
  ]);
  assert.deepEqual(JSON.parse(storage.value(academyProgressKey)), [
    "dizybackup-recovery",
    "guided-trade-review",
  ]);
});

test("DOM defaults and saved settings stay above the no-scroll minimum", () => {
  assert.equal(DOM_SAFE_MINIMUM_WIDTH, 260);
  assert.equal(DEFAULT_ORDER_FLOW_SETTINGS.dom.width, DOM_SAFE_MINIMUM_WIDTH);
  assert.equal(
    sanitiseOrderFlowSettings({ dom: { width: 190 } }).dom.width,
    DOM_SAFE_MINIMUM_WIDTH,
  );
  assert.equal(sanitiseOrderFlowSettings({ dom: { width: 999 } }).dom.width, 380);
  assert.equal(sanitiseOrderFlowSettings({ dom: { width: 300 } }).dom.width, 300);
});

test("DizyOps permits only owner and admin roles", () => {
  assert.equal(canAccessOperations("owner"), true);
  assert.equal(canAccessOperations("admin"), true);
  assert.equal(canAccessOperations("user"), false);
  assert.equal(canAccessOperations("viewer"), false);
  assert.equal(canAccessOperations("unknown"), false);
});
