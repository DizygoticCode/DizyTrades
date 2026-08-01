import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source=await readFile(new URL("../app/api/dizybrain/behaviour/route.ts",import.meta.url),"utf8");
test("Behaviour API retains authenticated read-only owner/viewer boundary",()=>{assert.match(source,/requireApiUser\(\)/);assert.match(source,/UNAUTHORISED/);assert.match(source,/export async function GET/);assert.doesNotMatch(source,/export async function (POST|PATCH|PUT|DELETE)/);assert.match(source,/readOnly:true/);});
test("Behaviour API is private and returns only profile diagnostics metadata",()=>{assert.match(source,/private, no-store/);assert.match(source,/\{profile,readOnly:true,diagnostics\}/);assert.doesNotMatch(source,/candles|replayMemory|notes/);});
