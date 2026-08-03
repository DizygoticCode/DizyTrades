import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("opposite ticket submissions use sequential depth and pending exits block reversal",async()=>{const source=await readFile("app/lib/manual-paper.ts","utf8");assert.match(source,/planOppositeDepthReplacement/);assert.match(source,/priorConsumedContractVolume:closePreview\.filledContractVolume/);assert.match(source,/oppositeDepthPlan\?\.entryDepthFill/);assert.match(source,/RISK_EXIT_PENDING/);assert.doesNotMatch(source,/if\(existing\)closeAt\(account,userId,input\.symbol/)});
