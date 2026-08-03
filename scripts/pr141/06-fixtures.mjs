import { readFile, writeFile } from "node:fs/promises";

const exitPath="tests/manual-paper-depth-exits.test.mjs",exitSource=await readFile(exitPath,"utf8"),exitNext=exitSource
  .replace('{submitManualOrder,closeManualPosition,ManualPaperError}=await import("../app/lib/manual-paper.ts")','{submitManualOrder,closeManualPosition,readManualAccount,ManualPaperError}=await import("../app/lib/manual-paper.ts")')
  .replace('amount:1.2,leverage:2','amount:.9,leverage:2')
  .replaceAll('contractVolume,11','contractVolume,9')
  .replace('account=(await import("../app/lib/manual-paper.ts")).readManualAccount?await (await import("../app/lib/manual-paper.ts")).readManualAccount("depth-min-remnant"):account','account=await readManualAccount("depth-min-remnant")');
if(exitNext===exitSource)throw new Error("Minimum-remnant fixture was not updated.");
await writeFile(exitPath,exitNext);

const routePath="tests/manual-paper-depth-exit-route.test.mjs",routeSource=await readFile(routePath,"utf8"),routeNext=routeSource
  .replace('assert.match(source,/action\\("partial-close", \\{ symbol:p\\.symbol, percentage \\}\\)/);','assert.ok(source.includes(\'action("partial-close", { symbol:p.symbol, percentage })\'));')
  .replace('assert.match(source,/action\\("flash-close",\\{symbol:p\\.symbol\\}\\)/);','assert.ok(source.includes(\'action("flash-close",{symbol:p.symbol})\'));')
  .replace('assert.match(source,/action\\("reverse",\\{symbol:p\\.symbol\\}\\)/)','assert.ok(source.includes(\'action("reverse",{symbol:p.symbol})\'))');
if(routeNext===routeSource)throw new Error("Position-row action fixture was not updated.");
await writeFile(routePath,routeNext);
