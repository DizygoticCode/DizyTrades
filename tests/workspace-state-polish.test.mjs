import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { classifyWorkspaceState } from "../app/lib/workspace-state.ts";

test("scanner catalogue failure becomes an actionable offline state", () => {
  const state = classifyWorkspaceState("scanner", {
    statusText: "MEXC market catalogue is unavailable.",
  });
  assert.equal(state?.kind, "offline");
  assert.equal(state?.title, "Market catalogue unavailable");
  assert.equal(state?.action, "retry");
  assert.equal(state?.actionLabel, "Retry scanner");
  assert.match(state?.preserved ?? "", /saved watchlist/i);
});

test("partial scanner availability does not become a global outage", () => {
  const state = classifyWorkspaceState("scanner", {
    statusText: "10 markets scanned · 2 unavailable.",
  });
  assert.equal(state, null);
});

test("DizyFlow stale and recovering states remain distinct", () => {
  const stale = classifyWorkspaceState("terminal", {
    domStatusText: "STALE",
    domMarketText: "Midpoint 100 · Spread 1",
  });
  assert.equal(stale?.kind, "delayed");
  assert.match(stale?.detail ?? "", /freshness threshold/i);

  const recovering = classifyWorkspaceState("terminal", {
    domStatusText: "RECOVERING",
  });
  assert.equal(recovering?.kind, "recovering");
  assert.match(recovering?.detail ?? "", /validated book/i);
});

test("incomplete books are never described as live", () => {
  const state = classifyWorkspaceState("terminal", {
    domStatusText: "LIVE",
    domMarketText: "One-sided book · midpoint unavailable",
  });
  assert.equal(state?.kind, "empty");
  assert.equal(state?.title, "Depth book incomplete");
});

test("backup parse rejection directs the user to a new file", () => {
  const state = classifyWorkspaceState("backup", {
    alertText: "This is not a supported DizyTrades backup.",
  });
  assert.equal(state?.kind, "error");
  assert.equal(state?.action, "focus-file");
  assert.equal(state?.actionLabel, "Choose another backup");
  assert.match(state?.preserved ?? "", /no account data changes/i);
});

test("backup conflicts are explicitly blocked without implying data loss", () => {
  const state = classifyWorkspaceState("backup", {
    statusText: "Dry-run found conflicts. Nothing was changed.",
  });
  assert.equal(state?.title, "Recovery blocked safely");
  assert.equal(state?.action, "focus-file");
  assert.match(state?.detail ?? "", /changed nothing/i);
});

test("workspace boundaries mount the shared state guidance", async () => {
  const files = await Promise.all([
    readFile("app/terminal/page.tsx", "utf8"),
    readFile("app/scanner/page.tsx", "utf8"),
    readFile("app/structure/page.tsx", "utf8"),
    readFile("app/backup/page.tsx", "utf8"),
    readFile("app/workspace-state-polish.tsx", "utf8"),
  ]);
  assert.match(files[0], /workspace="terminal"/);
  assert.match(files[1], /workspace="scanner"/);
  assert.match(files[2], /workspace="structure"/);
  assert.match(files[3], /workspace="backup"/);
  assert.match(files[4], /data-workspace-state-polish/);
  assert.match(files[4], /prefers-reduced-motion/);
  assert.match(files[4], /Preserved:/);
});
