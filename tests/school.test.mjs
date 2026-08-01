import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterLessons, lessonGroups, lessons, progressKey, readProgress, writeProgress } from "../app/school/lessons.ts";

test("school is a public route and renders the learning client without auth", async () => {
  const page = await readFile(new URL("../app/school/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<SchoolClient\s*\/>/);
  assert.doesNotMatch(page, /requireUser|redirect|currentUser/);
});

test("all requested lessons render from the three structured groups", () => {
  assert.ok(lessons.length >= 21);
  assert.ok(lessons.some((lesson) => lesson.slug === "dizybrain"));
  assert.deepEqual(lessonGroups, ["Beginner", "Intermediate", "DizyTrades Tools"]);
  for (const lesson of lessons) {
    assert.ok(lesson.slug && lesson.title && lesson.summary);
    assert.ok(lesson.sections.length > 0);
  }
  assert.ok(lessons.filter((lesson) => lesson.diagram).length >= 8);
});

test("lesson search filters title, body and group and resets for blank input", () => {
  assert.deepEqual(filterLessons("elliott").map(({ slug }) => slug), ["elliott-waves"]);
  assert.ok(filterLessons("closed candle").some(({ slug }) => slug === "dizysignals"));
  assert.ok(filterLessons("DizyTrades Tools").length > 0);
  assert.equal(filterLessons("  ").length, lessons.length);
  assert.equal(filterLessons("no-such-curriculum-term").length, 0);
});

test("browser-local progress persists valid, unique lesson slugs safely", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  writeProgress(storage, ["welcome", "welcome", "not-a-lesson", "candles-price-volume-timeframes"]);
  assert.equal(values.get(progressKey), '["welcome","candles-price-volume-timeframes"]');
  assert.deepEqual(readProgress(storage), ["welcome", "candles-price-volume-timeframes"]);
  values.set(progressKey, "corrupt");
  assert.deepEqual(readProgress(storage), []);
});

test("responsive course navigation exposes an accessible mobile drawer", async () => {
  const [client, css] = await Promise.all([
    readFile(new URL("../app/school/school-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(client, /aria-expanded=\{menuOpen\}/);
  assert.match(client, /aria-controls="course-navigation"/);
  assert.match(client, /aria-label="Course navigation"/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.school-sidebar\.open \{ display: block; \}/);
});
