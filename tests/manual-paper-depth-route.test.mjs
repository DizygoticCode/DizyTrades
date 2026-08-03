import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Manual Paper HTTP entries require fresh DizyFlow depth while close routes retain their current model",async()=>{const source=await readFile(new URL("../app/api/manual-paper/route.ts",import.meta.url),"utf8");assert.match(source,/latestManualPaperDepth/);assert.match(source,/DEPTH_UNAVAILABLE/);assert.ok(source.includes("submitManualOrder(user.id,body as never,risk.price,risk.source,contract,fundingData.current??undefined,depth)"));assert.match(source,/action==="close"||action==="flash-close"/)});
