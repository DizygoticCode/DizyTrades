import { readFile, writeFile } from "node:fs/promises";

const path = "app/lib/manual-paper-backup.ts";
let source = await readFile(path, "utf8");
const start = 'const input=object(value,field),evidence=Object.freeze({enabled:boolean(input.enabled,field+".enabled"),calculationMethod:';
const replacement = 'const input=object(value,field),enabled=boolean(input.enabled,field+".enabled");if(enabled!==true)throw new Error(field+" must be enabled.");const evidence=Object.freeze({enabled:true as const,calculationMethod:';
let count = source.split(start).length - 1;
if (count !== 1) throw new Error(`reduce-only enabled literal: expected 1 match, found ${count}`);
source = source.replace(start, replacement);
const guard = 'if(!evidence.enabled||fillSide!=="close")throw new Error(field+" is not attached to a close fill.");';
const narrowedGuard = 'if(fillSide!=="close")throw new Error(field+" is not attached to a close fill.");';
count = source.split(guard).length - 1;
if (count !== 1) throw new Error(`reduce-only close guard: expected 1 match, found ${count}`);
source = source.replace(guard, narrowedGuard);
await writeFile(path, source);
