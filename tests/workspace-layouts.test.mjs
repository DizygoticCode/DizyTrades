import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_TERMINAL_SETTINGS,
  sanitiseTerminalSettings,
} from "../app/lib/config.ts";
import {
  applyBuiltInWorkspacePreset,
  normaliseWorkspaceLayoutName,
  sanitiseSavedWorkspaceLayouts,
} from "../app/lib/workspace-layout.ts";
import {
  deleteWorkspaceLayout,
  findWorkspaceLayout,
  readWorkspaceLayouts,
  saveWorkspaceLayout,
} from "../app/lib/workspace-layout-store.ts";

test("workspace names are bounded and meaningful", () => {
  assert.equal(normaliseWorkspaceLayoutName("  BTC   15m research  "), "BTC 15m research");
  assert.throws(() => normaliseWorkspaceLayoutName("---"), /letter or number/);
  assert.throws(() => normaliseWorkspaceLayoutName("  "), /required/);
});

test("built-in presets remain sanitised and preserve the current market", () => {
  const current = sanitiseTerminalSettings({
    ...DEFAULT_TERMINAL_SETTINGS,
    market: {
      exchange: "mexc",
      symbol: "ETH_USDT",
      marketKey: "mexc:futures:ETH_USDT",
      timeframe: "4h",
      favourites: ["mexc:futures:ETH_USDT"],
    },
  });
  const clean = applyBuiltInWorkspacePreset(current, "clean-price");
  assert.equal(clean.market.symbol, "ETH_USDT");
  assert.equal(clean.market.timeframe, "4h");
  assert.equal(clean.view.volumeProfile, false);
  assert.equal(clean.view.supportResistance, true);
  assert.equal(clean.orderFlow.enabled, false);

  const flow = applyBuiltInWorkspacePreset(current, "order-flow");
  assert.equal(flow.market.symbol, "ETH_USDT");
  assert.equal(flow.orderFlow.enabled, true);
  assert.equal(flow.orderFlow.domVisible, true);
  assert.equal(flow.orderFlow.heatmapVisible, true);

  const research = applyBuiltInWorkspacePreset(current, "research");
  assert.equal(research.market.symbol, "ETH_USDT");
  assert.deepEqual(research.market.favourites, ["mexc:futures:ETH_USDT"]);
  assert.equal(research.strategy.mode, current.strategy.mode);
});

test("malformed saved layouts are discarded rather than invented", () => {
  const layouts = sanitiseSavedWorkspaceLayouts([
    { id: "bad", name: "Bad", settings: {} },
    null,
    "workspace",
  ]);
  assert.deepEqual(layouts, []);
});

test("account workspace storage creates, updates, finds and deletes snapshots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dizy-workspaces-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  try {
    const first = await saveWorkspaceLayout(
      "workspace_test_user",
      "BTC research",
      DEFAULT_TERMINAL_SETTINGS,
    );
    assert.equal(first.created, true);
    assert.match(first.layout.id, /^wsl1_/);

    const changed = sanitiseTerminalSettings({
      ...DEFAULT_TERMINAL_SETTINGS,
      market: {
        ...DEFAULT_TERMINAL_SETTINGS.market,
        symbol: "SOL_USDT",
        marketKey: "mexc:futures:SOL_USDT",
        timeframe: "1h",
      },
    });
    const updated = await saveWorkspaceLayout(
      "workspace_test_user",
      "btc RESEARCH",
      changed,
    );
    assert.equal(updated.created, false);
    assert.equal(updated.layout.id, first.layout.id);
    assert.equal(updated.layout.settings.market.symbol, "SOL_USDT");

    const layouts = await readWorkspaceLayouts("workspace_test_user");
    assert.equal(layouts.length, 1);
    assert.equal((await findWorkspaceLayout("workspace_test_user", first.layout.id))?.settings.market.timeframe, "1h");

    const persisted = JSON.parse(
      await readFile(join(directory, "workspace-layouts", "workspace_test_user.json"), "utf8"),
    );
    assert.equal(persisted.version, 1);
    assert.equal(persisted.layouts.length, 1);

    assert.equal(await deleteWorkspaceLayout("workspace_test_user", first.layout.id), true);
    assert.equal((await readWorkspaceLayouts("workspace_test_user")).length, 0);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("terminal and API expose the saved-layout workflow", async () => {
  const [terminal, client, route] = await Promise.all([
    readFile("app/terminal/page.tsx", "utf8"),
    readFile("app/workspace-layouts.tsx", "utf8"),
    readFile("app/api/workspaces/route.ts", "utf8"),
  ]);
  assert.match(terminal, /WorkspaceLayouts/);
  assert.match(client, /Save current workspace/);
  assert.match(client, /Built-in presets/);
  assert.match(client, /Account-scoped snapshots/);
  assert.match(route, /workspace\.created/);
  assert.match(route, /workspace\.applied/);
  assert.match(route, /Viewer sessions are read-only/);
});
