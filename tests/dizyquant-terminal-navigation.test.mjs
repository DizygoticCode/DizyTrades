import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared product navigation exposes the bounded DizyQuant research page", async () => {
  const [model, navigation] = await Promise.all([
    readFile("app/lib/product-navigation.ts", "utf8"),
    readFile("app/product-navigation.tsx", "utf8"),
  ]);

  assert.match(model, /id: "quant"/);
  assert.match(model, /label: "DizyQuant"/);
  assert.match(model, /icon: "∑"/);
  assert.match(model, /href: "\/research"/);
  assert.match(model, /title: "Open bounded DizyQuant microstructure research"/);
  assert.match(navigation, /DIZY_PRODUCT_LINKS\.map/);

  const imports = `${model}\n${navigation}`
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");
  assert.doesNotMatch(imports, /lib\/dizyquant|order-flow|depth-collector|RawTrade|live-order/i);
});
