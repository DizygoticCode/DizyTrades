import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("reverse and flatten HTTP paths require contract metadata and fresh depth",async()=>{const source=await readFile(new URL("../app/api/manual-paper/route.ts",import.meta.url),"utf8");assert.ok(source.includes("reverseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract,reduceOnlyTarget(body))"));assert.ok(source.includes("return [symbol,{price:risk.price,contract,depth}] as const"));assert.ok(source.includes("latestPublicContractMetadata(symbol),requiredDepth(symbol)"));assert.ok(source.includes("reduceOnlyTarget(body)"))});
