import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { academyLessons, filterAcademyLessons } from "../app/school/academy-extension.ts";

const text = (lesson) => [lesson.title, lesson.summary, ...lesson.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])])].join(" ").toLowerCase();

test("DizyBrain lesson is discoverable and maps its original diagram", () => {
  const lesson = academyLessons.find(({ slug }) => slug === "dizybrain");
  assert.ok(lesson);
  assert.ok(filterAcademyLessons("typed snapshot").some(({ slug }) => slug === "dizybrain"));
  assert.ok(filterAcademyLessons("historical signals").some(({ slug }) => slug === "dizybrain"));
  const diagrams = readFileSync("app/school/concept-diagram.tsx", "utf8");
  assert.match(diagrams, /dizybrain:\s*\{[^}]*dizybrain-typed-flow\.svg/);
  assert.ok(existsSync("public/school/diagrams/dizybrain-typed-flow.svg"));
});

test("DizyBrain content separates setup lean from current qualification", () => {
  const content = text(academyLessons.find(({ slug }) => slug === "dizybrain"));
  assert.match(content, /setup lean[^.]*not a confirmed signal/);
  assert.match(content, /configured strategy threshold is authoritative/);
  assert.match(content, /latest closed candle/);
  assert.match(content, /matching confirmed buy signal/);
  assert.match(content, /historical signals are deliberately excluded/);
  assert.match(content, /not profit probability/);
  assert.doesNotMatch(content, /confidence[^.]*chance of profit/);
});

test("platform lessons preserve unresolved and execution boundaries", () => {
  const flow = text(academyLessons.find(({ slug }) => slug === "dizyflow"));
  const paper = text(academyLessons.find(({ slug }) => slug === "dizypaper"));
  assert.match(flow, /heatmap[^.]*not yet reliably customer-visible|heatmap[^.]*not reliably visible/);
  assert.match(flow, /market depth[^.]*historical volume profile/);
  assert.match(paper, /never submits an exchange order/);
  assert.match(paper, /simulation/);
  assert.doesNotMatch(`${flow} ${paper}`, /live (order|execution) (is|now) enabled/);
});
