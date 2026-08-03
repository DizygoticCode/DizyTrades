import { readFile, writeFile } from "node:fs/promises";

const path="tests/manual-paper-depth-exits.test.mjs",source=await readFile(path,"utf8"),next=source
  .replace('{submitManualOrder,closeManualPosition,ManualPaperError}=await import("../app/lib/manual-paper.ts")','{submitManualOrder,closeManualPosition,readManualAccount,ManualPaperError}=await import("../app/lib/manual-paper.ts")')
  .replace('amount:1.2,leverage:2','amount:.9,leverage:2')
  .replace('contractVolume,11','contractVolume,9')
  .replace('account=(await import("../app/lib/manual-paper.ts")).readManualAccount?await (await import("../app/lib/manual-paper.ts")).readManualAccount("depth-min-remnant"):account','account=await readManualAccount("depth-min-remnant")');
if(next===source)throw new Error("Minimum-remnant fixture was not updated.");
await writeFile(path,next);
