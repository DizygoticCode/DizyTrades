import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ticket = readFileSync(new URL("../app/manual-paper-ticket.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/manual-paper-ticket.module.css", import.meta.url), "utf8");

test("Manual Paper retries missing MEXC contract rules and preserves same-symbol rules", () => {
  assert.match(ticket, /setContract\(current=>nextContract\?\?\(current\?\.symbol===symbol\?current:null\)\)/);
  assert.match(ticket, /if\(!hasPosition&&contract\)return;const delay=contract\?5000:3000/);
  assert.match(ticket, /Leverage · recovering MEXC rules/);
});

test("Manual Paper position slider uses the same sizing equity as order calculation", () => {
  assert.match(ticket, /sliderToAmount\(safe, sizingEquity, mode, leverageNumber\)/);
  assert.doesNotMatch(ticket, /sliderToAmount\(safe, equity, mode, leverageNumber\)/);
  assert.match(
    ticket,
    /sliderToAmount\(\s*sizePercent,\s*sizingEquity,\s*next,\s*leverageNumber,?\s*\)/,
  );
  assert.match(ticket, /sliderToAmount\(sizePercent,sizingEquity,mode,value\)/);
});

test("Manual Paper keeps sizing preview live while contract rules recover", () => {
  assert.match(ticket, /notional=contractOrder\?\.notional\?\?targetNotional/);
  assert.match(ticket, /margin=contractOrder\?notional\/leverageNumber:targetMargin/);
  assert.match(ticket, /invalidAmount = invalidInput \|\| Boolean\(contract&&/);
  assert.match(ticket, /Position size<\/span>\s*<b>\{sizePercent\}% · \{money\(targetNotional\)\}<\/b>/);
});

test("Manual Paper amount unit reserves space clear of the number field spinner", () => {
  assert.match(css, /\.unit \{[\s\S]*?right: 30px;/);
  assert.match(css, /\.unit \+ input \{\s*padding-right: 72px;/);
});
