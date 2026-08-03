import { readFile, writeFile } from "node:fs/promises";

const path = "app/lib/manual-paper.ts";
let source = await readFile(path, "utf8");
const marker = 'return fail("INVALID_REDUCE_ONLY_REQUEST","quantity","Invalid reduce-only request.")}\nfunction closeQuantityForInput';
const replacement = 'return fail("INVALID_REDUCE_ONLY_REQUEST","quantity","Invalid reduce-only request.")}}\nfunction closeQuantityForInput';
const count = source.split(marker).length - 1;
if (count !== 1) throw new Error(`manualReduceOnlyPlan boundary: expected 1 match, found ${count}`);
source = source.replace(marker, replacement);
await writeFile(path, source);
