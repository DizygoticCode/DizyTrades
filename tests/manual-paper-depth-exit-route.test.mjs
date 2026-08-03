import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("manual close and partial-close HTTP paths require depth and current contract rules",async()=>{const source=await readFile(new URL("../app/api/manual-paper/route.ts",import.meta.url),"utf8");assert.ok(source.includes("closeManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract,reduceOnlyTarget(body))"));assert.ok(source.includes("partialCloseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,body,depth,contract,reduceOnlyTarget(body))"));assert.match(source,/Fresh public DizyFlow depth is unavailable for this market action/);assert.ok(source.includes("function reduceOnlyTarget(body:Record<string,unknown>)"))});

test("position-row actions submit their own symbol",async()=>{const source=await readFile(new URL("../app/manual-paper-ticket.tsx",import.meta.url),"utf8");assert.ok(source.includes('action("partial-close", { symbol:p.symbol, percentage })'));assert.ok(source.includes('action("flash-close",{symbol:p.symbol})'));assert.ok(source.includes('action("reverse",{symbol:p.symbol})'))});
