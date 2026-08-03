import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error("Missing "+label);if(source.indexOf(from,index+from.length)>=0)throw new Error("Ambiguous "+label);return source.slice(0,index)+to+source.slice(index+from.length)};

let history=await readFile("app/lib/manual-paper-history.ts","utf8");
history=replaceOnce(history,
 ' if(annotated&&!steps.includes("annotate-fill-history-provenance"))steps.push("annotate-fill-history-provenance");',
 ' if(source!==4&&annotated&&!steps.includes("annotate-fill-history-provenance"))steps.push("annotate-fill-history-provenance");',
 "native history annotation state");
await writeFile("app/lib/manual-paper-history.ts",history,"utf8");

let backup=await readFile("app/lib/manual-paper-backup.ts","utf8");
backup=replaceOnce(backup,
 '  if(sourceVersion===MANUAL_PAPER_ACCOUNT_VERSION&&sourceInput.migration==null)throw new Error("Manual Paper v4 backup is missing its migration ledger.");\n  const input = object(normaliseManualAccount(sourceInput), "manualPaper");',
 '  if(sourceVersion===MANUAL_PAPER_ACCOUNT_VERSION){\n    if(sourceInput.migration==null)throw new Error("Manual Paper v4 backup is missing its migration ledger.");\n    if(!Array.isArray(sourceInput.fills)||!Array.isArray(sourceInput.fundingPayments))throw new Error("Manual Paper v4 history collections are invalid.");\n    if(sourceInput.fills.some(item=>!item||typeof item!=="object"||Array.isArray(item)||!("history" in item)))throw new Error("Manual Paper v4 fill is missing history provenance.");\n    validateManualPaperMigrationLedger(sourceInput.migration,sourceInput.fills,sourceInput.fundingPayments);\n  }\n  const input = object(normaliseManualAccount(sourceInput), "manualPaper");',
 "strict current account prevalidation");
await writeFile("app/lib/manual-paper-backup.ts",backup,"utf8");
