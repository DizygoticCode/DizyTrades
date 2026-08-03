import {readFile,writeFile} from "node:fs/promises";
const path="app/lib/manual-paper.ts",source=await readFile(path,"utf8"),start=source.indexOf("export async function partialCloseManualPosition");
if(start<0)throw new Error("partial close anchor missing");
const old='closeReason:fullyClosed?"manual":undefined',index=source.indexOf(old,start);
if(index<0)throw new Error("partial close reason anchor missing");
const next=source.slice(0,index)+'closeReason:fullyClosed?("manual"):undefined'+source.slice(index+old.length);
await writeFile(path,next);
