import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {formatOrderImbalance} from "../app/lib/order-flow/imbalance.ts";

const toolbarPath=new URL("../app/order-flow-toolbar.tsx",import.meta.url),domPath=new URL("../app/dizyflow-dom.tsx",import.meta.url);

test("one signed formatter is shared by the DizyFlow toolbar and DOM",async()=>{
  const [toolbar,dom]=await Promise.all([readFile(toolbarPath,"utf8"),readFile(domPath,"utf8")]);
  assert.match(toolbar,/formatOrderImbalance\(imbalance\)/);
  assert.match(toolbar,/dizyflow-imbalance-ticker/);
  assert.match(toolbar,/summary\.imbalance/);
  assert.match(dom,/formatOrderImbalance\(summary\.imbalance\)/);
  assert.match(dom,/dom-order-imbalance/);
  assert.match(dom,/25-level order imbalance/);
});

test("order imbalance labels preserve bid and ask direction",()=>{
  assert.equal(formatOrderImbalance(14.6),"+15%");
  assert.equal(formatOrderImbalance(-14.6),"-15%");
  assert.equal(formatOrderImbalance(0),"0%");
  assert.equal(formatOrderImbalance(null),"—");
});
