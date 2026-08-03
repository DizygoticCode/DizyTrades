import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TERMINAL_SETTINGS } from "../app/lib/config.ts";
import {
  marketShortcutChanged,
  recentMarketFromSettings,
  sanitiseRecentMarketShortcuts,
} from "../app/lib/recent-shortcuts.ts";
import {
  readRecentMarketShortcuts,
  recordRecentMarketShortcut,
} from "../app/lib/recent-shortcuts-store.ts";
import {
  academyLastLessonKey,
  readAcademyLastLesson,
  writeAcademyLastLesson,
} from "../app/school/academy-recent.ts";

test("recent market shortcuts preserve exact context and deduplicate by market", () => {
  const btc = recentMarketFromSettings(
    DEFAULT_TERMINAL_SETTINGS.market,
    "2026-08-03T12:00:00.000Z",
  );
  const later = recentMarketFromSettings(
    { ...DEFAULT_TERMINAL_SETTINGS.market, timeframe: "1h" },
    "2026-08-03T13:00:00.000Z",
  );
  assert.equal(btc?.marketType, "futures");
  assert.equal(later?.timeframe, "1h");
  const values = sanitiseRecentMarketShortcuts([btc, later, { broken: true }]);
  assert.equal(values.length, 1);
  assert.equal(values[0].timeframe, "1h");
  assert.equal(values[0].visitedAt, "2026-08-03T13:00:00.000Z");
});

test("only market identity or timeframe changes create a recent shortcut", () => {
  const current = DEFAULT_TERMINAL_SETTINGS.market;
  assert.equal(marketShortcutChanged(current, { ...current }), false);
  assert.equal(
    marketShortcutChanged(current, { ...current, timeframe: "4h" }),
    true,
  );
  assert.equal(
    marketShortcutChanged(current, {
      ...current,
      symbol: "ETH_USDT",
      marketKey: "mexc:futures:ETH_USDT",
    }),
    true,
  );
});

test("recent market store is account scoped and newest first", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dizy-recents-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  try {
    await recordRecentMarketShortcut("recent_user", {
      ...DEFAULT_TERMINAL_SETTINGS.market,
      symbol: "ETH_USDT",
      marketKey: "mexc:futures:ETH_USDT",
      timeframe: "1h",
    });
    await recordRecentMarketShortcut("recent_user", {
      ...DEFAULT_TERMINAL_SETTINGS.market,
      symbol: "SOL_USDT",
      marketKey: "mexc:futures:SOL_USDT",
      timeframe: "4h",
    });
    await recordRecentMarketShortcut("other_user", {
      ...DEFAULT_TERMINAL_SETTINGS.market,
      symbol: "XRP_USDT",
      marketKey: "mexc:futures:XRP_USDT",
      timeframe: "15m",
    });
    const mine = await readRecentMarketShortcuts("recent_user");
    assert.deepEqual(mine.map((item) => item.symbol), ["SOL_USDT", "ETH_USDT"]);
    assert.deepEqual(
      (await readRecentMarketShortcuts("other_user")).map((item) => item.symbol),
      ["XRP_USDT"],
    );
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("Academy continuation accepts only known lesson slugs", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const valid = ["intro", "scanner"];
  writeAcademyLastLesson(storage, "scanner", valid);
  assert.equal(values.get(academyLastLessonKey), "scanner");
  assert.equal(readAcademyLastLesson(storage, valid), "scanner");
  writeAcademyLastLesson(storage, "invented", valid);
  assert.equal(values.get(academyLastLessonKey), "scanner");
});

test("recent UI uses real profile Journal and Academy sources", async () => {
  const [mounted, panel, profile, workspaces, school, journalPage, journalTracker] =
    await Promise.all([
      readFile("app/command-palette-mounted.tsx", "utf8"),
      readFile("app/recent-shortcuts.tsx", "utf8"),
      readFile("app/api/profile/route.ts", "utf8"),
      readFile("app/api/workspaces/route.ts", "utf8"),
      readFile("app/school/academy-recent-tracker.tsx", "utf8"),
      readFile("app/journal/page.tsx", "utf8"),
      readFile("app/journal/journal-recent-tracker.tsx", "utf8"),
    ]);
  assert.match(mounted, /<RecentShortcuts \/>/);
  assert.match(panel, /fetch\("\/api\/journal"/);
  assert.match(panel, /fetch\("\/api\/recent-shortcuts"/);
  assert.match(panel, /import\("\.\/school\/academy-catalogue"\)/);
  assert.match(panel, /\/journal\?entry=/);
  assert.match(panel, /\/school\?lesson=/);
  assert.match(profile, /recent-market\.recorded/);
  assert.match(workspaces, /recordRecentMarketShortcut/);
  assert.match(school, /pendingSlug = null/);
  assert.match(journalPage, /<JournalRecentTracker \/>/);
  assert.match(journalTracker, /entry\.id === requested/);
  assert.match(journalTracker, /\.journal-list button\.entry-row/);
});
