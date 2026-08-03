import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  FIRST_RUN_ONBOARDING_COMPLETE,
  FIRST_RUN_ONBOARDING_PATHS,
  FIRST_RUN_ONBOARDING_VERSION,
  completeFirstRunOnboarding,
  firstRunOnboardingStorageKey,
  hasCompletedFirstRunOnboarding,
} from "../app/lib/first-run-onboarding.ts";

test("first-run onboarding completion is versioned and user scoped", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(FIRST_RUN_ONBOARDING_VERSION, 1);
  assert.notEqual(
    firstRunOnboardingStorageKey("owner"),
    firstRunOnboardingStorageKey("nick"),
  );
  assert.equal(hasCompletedFirstRunOnboarding(storage, "owner"), false);

  completeFirstRunOnboarding(storage, "owner");

  assert.equal(hasCompletedFirstRunOnboarding(storage, "owner"), true);
  assert.equal(hasCompletedFirstRunOnboarding(storage, "nick"), false);
  assert.equal(
    values.get(firstRunOnboardingStorageKey("owner")),
    FIRST_RUN_ONBOARDING_COMPLETE,
  );
});

test("onboarding exposes the three bounded starting paths", () => {
  assert.deepEqual(
    FIRST_RUN_ONBOARDING_PATHS.map((path) => path.id),
    ["explore", "learn", "paper"],
  );
  assert.match(FIRST_RUN_ONBOARDING_PATHS[1].title, /DizyAcademy/);
  assert.match(FIRST_RUN_ONBOARDING_PATHS[2].description, /simulated funds only/);
});

test("terminal mounts an accessible, reopenable beginner guide without trading logic changes", async () => {
  const [component, terminalPage, roadmap] = await Promise.all([
    readFile("app/first-run-onboarding.tsx", "utf8"),
    readFile("app/terminal/page.tsx", "utf8"),
    readFile("ROADMAP.md", "utf8"),
  ]);

  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /Start Here/);
  assert.match(component, /manual-paper-open/);
  assert.match(component, /href="\/school"/);
  assert.match(component, /Live trading is disabled/);
  assert.match(component, /prefers-reduced-motion/);
  assert.match(terminalPage, /<FirstRunOnboarding userId=\{user\.id\} userName=\{user\.name\} \/>/);
  assert.match(roadmap, /- \[x\] first-run onboarding/);
});
