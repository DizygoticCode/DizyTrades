import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modelPath = new URL("../app/lib/product-navigation.ts", import.meta.url);
const navigationPath = new URL("../app/product-navigation.tsx", import.meta.url);
const launcherPath = new URL("../app/dizybrain-route-launcher.tsx", import.meta.url);
const pagePath = new URL("../app/terminal/page.tsx", import.meta.url);

test("DizyBrain is discoverable from the shared product navigation and terminal launcher", async () => {
  const [model, navigation, launcher, page] = await Promise.all([
    readFile(modelPath, "utf8"),
    readFile(navigationPath, "utf8"),
    readFile(launcherPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  assert.match(model, /id: "brain"/);
  assert.match(model, /label: "DizyBrain"/);
  assert.match(model, /href: "\/terminal#dizybrain"/);
  assert.match(model, /title: "Open DizyBrain transparent signal reasoning"/);
  assert.match(navigation, /product\.id === "brain"/);
  assert.match(navigation, /document\.querySelector<HTMLButtonElement>\("\.dizybrain-launch"\)\?\.click\(\)/);
  assert.match(launcher, /document\.querySelector<HTMLButtonElement>\("\.dizybrain-launch"\)/);
  assert.match(page, /<DizyBrainRouteLauncher \/>/);
});
