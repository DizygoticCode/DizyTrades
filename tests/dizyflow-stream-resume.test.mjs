import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const source=path=>readFile(path,"utf8");

test("DizyFlow SSE routes resume pending data when browser demand returns",async()=>{
 const [dom,heatmap]=await Promise.all([
  source("app/api/dizyflow/dom/stream/route.ts"),
  source("app/api/dizyflow/heatmap/stream/route.ts"),
 ]);
 for(const route of [dom,heatmap]){
  assert.match(route,/let cleanup=\(\)=>\{\},flush=\(\)=>\{\}/);
  assert.match(route,/pull\(\)\{flush\(\)\}/);
  assert.doesNotMatch(route,/pull\(\)\{\}/);
 }
});

test("heatmap archive time cannot replace a newer DOM receipt",async()=>{
 const hook=await source("app/lib/order-flow/use-order-flow.ts");
 assert.match(hook,/latestReceiptTime\(v\.lastValidUpdate,state\.archiveTo\)/);
 assert.doesNotMatch(hook,/lastValidUpdate:state\.archiveTo/);
});
