import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile("app/dizyflow-toast-rail.tsx", "utf8");
const css = await readFile("app/dizyflow-toast-rail.module.css", "utf8");

test("DizyFlow topbar alert reserves a stable wider lane", () => {
  assert.match(component, /styles\.rail/);
  assert.match(component, /styles\.card/);
  assert.match(component, /styles\.message/);
  assert.match(css, /inline-size:\s*clamp\(340px,\s*26vw,\s*440px\)/);
  assert.match(css, /block-size:\s*38px/);
  assert.match(css, /display:\s*grid\s*!important/);
});

test("long alert labels cannot resize the topbar card", () => {
  assert.match(component, /className=\{styles\.title\}/);
  assert.match(component, /className=\{styles\.detail\}/);
  assert.match(css, /text-overflow:\s*ellipsis/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /min-inline-size:\s*0/);
});
