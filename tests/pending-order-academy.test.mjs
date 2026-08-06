import assert from "node:assert/strict";
import test from "node:test";

import {
  academyLessons,
  filterAcademyLessons,
  readAcademyProgress,
  writeAcademyProgress,
} from "../app/school/academy-catalogue.ts";
import { pendingOrderAcademyLessons } from "../app/school/pending-order-academy.ts";

const lessonText = (lesson) => [
  lesson.title,
  lesson.summary,
  lesson.group,
  ...lesson.sections.flatMap((section) => [
    section.heading,
    ...section.paragraphs,
    ...(section.bullets ?? []),
  ]),
].join(" ").toLowerCase();

test("live Academy catalogue includes the two pending-order practical lessons", () => {
  assert.equal(pendingOrderAcademyLessons.length, 2);
  const slugs = academyLessons.map((lesson) => lesson.slug);
  assert.equal(new Set(slugs).size, slugs.length, "Academy lesson slugs must remain unique");
  assert.ok(slugs.includes("pending-order-execution"));
  assert.ok(slugs.includes("spot-order-reservations"));
});

test("pending-order lesson preserves execution semantics and evidence limits", () => {
  const lesson = pendingOrderAcademyLessons.find(({ slug }) => slug === "pending-order-execution");
  assert.ok(lesson);
  const text = lessonText(lesson);
  for (const term of [
    "gtc",
    "ioc",
    "fok",
    "post-only",
    "limit-maker",
    "trigger-market",
    "trigger-limit",
    "trailing stop",
    "chase-limit",
    "partially filled",
    "cancel-and-replace",
  ]) {
    assert.match(text, new RegExp(term), `missing pending-order concept: ${term}`);
  }
  assert.match(text, /snapshot alone does not prove/);
  assert.match(text, /queue/);
  assert.match(text, /explicit observed execution evidence/);
  assert.match(text, /never sends a private exchange request or live order/);
});

test("spot lesson reconciles reservations, refunds, releases and replay", () => {
  const lesson = pendingOrderAcademyLessons.find(({ slug }) => slug === "spot-order-reservations");
  assert.ok(lesson);
  const text = lessonText(lesson);
  for (const term of [
    "available",
    "reserved",
    "base",
    "quote",
    "price-improvement",
    "partial fills",
    "ioc",
    "fok",
    "manual cancellation",
    "replacement",
    "immutable account ledger",
    "replaying",
  ]) {
    assert.match(text, new RegExp(term), `missing spot-accounting concept: ${term}`);
  }
  assert.match(text, /cannot mutate/);
  assert.match(text, /never infer fees, hidden liquidity or queue priority/);
});

test("new lessons participate in catalogue search and progress persistence", () => {
  assert.ok(filterAcademyLessons("price improvement").some(({ slug }) => slug === "spot-order-reservations"));
  assert.ok(filterAcademyLessons("chase-limit").some(({ slug }) => slug === "pending-order-execution"));

  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  writeAcademyProgress(storage, ["pending-order-execution", "spot-order-reservations", "not-a-real-lesson"]);
  assert.deepEqual(readAcademyProgress(storage), ["pending-order-execution", "spot-order-reservations"]);
});
