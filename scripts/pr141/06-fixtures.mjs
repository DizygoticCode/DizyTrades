import { readFile, writeFile } from "node:fs/promises";

const exitPath="tests/manual-paper-depth-exits.test.mjs",exitSource=await readFile(exitPath,"utf8"),exitNext=exitSource
  .replace('{submitManualOrder,closeManualPosition,ManualPaperError}=await import("../app/lib/manual-paper.ts")','{submitManualOrder,closeManualPosition,readManualAccount,ManualPaperError}=await import("../app/lib/manual-paper.ts")')
  .replace('amount:1.2,leverage:2','amount:.9,leverage:2')
  .replaceAll('contractVolume,11','contractVolume,9')
  .replace('account=(await import("../app/lib/manual-paper.ts")).readManualAccount?await (await import("../app/lib/manual-paper.ts")).readManualAccount("depth-min-remnant"):account','account=await readManualAccount("depth-min-remnant")');
if(exitNext===exitSource)throw new Error("Minimum-remnant fixture was not updated.");
await writeFile(exitPath,exitNext);

await writeFile(
  "tests/manual-paper-depth-exit-route.test.mjs",
  `import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("manual close and partial-close HTTP paths require depth and current contract rules",async()=>{const source=await readFile(new URL("../app/api/manual-paper/route.ts",import.meta.url),"utf8");assert.ok(source.includes("closeManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract)"));assert.ok(source.includes("partialCloseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,body,depth,contract)"));assert.match(source,/Fresh public DizyFlow depth is unavailable for this market action/)});

test("position-row actions submit their own symbol",async()=>{const source=await readFile(new URL("../app/manual-paper-ticket.tsx",import.meta.url),"utf8");assert.ok(source.includes('action("partial-close", { symbol:p.symbol, percentage })'));assert.ok(source.includes('action("flash-close",{symbol:p.symbol})'));assert.ok(source.includes('action("reverse",{symbol:p.symbol})'))});
`,
);

const ticketPath="app/manual-paper-ticket.tsx",ticketSource=await readFile(ticketPath,"utf8"),ticketNext=ticketSource
  .replace(
    '    invalidAmount = !Number.isFinite(quantity) || quantity <= 0 || margin < 0 || Boolean(contractVolumeIssue) || invalidPriceStep;\n  const choosePercent = useCallback(',
    '    invalidAmount = !Number.isFinite(quantity) || quantity <= 0 || margin < 0 || Boolean(contractVolumeIssue) || invalidPriceStep;\n  const positionSide=position?.side;\n  const choosePercent = useCallback(',
  )
  .replace(
    '        confirmReverse: Boolean(position && position.side !== orderSide),',
    '        confirmReverse: Boolean(positionSide && positionSide !== orderSide),',
  )
  .replace(
    '      takeProfit,\n      position,\n    ],',
    '      takeProfit,\n      positionSide,\n    ],',
  );
if(ticketNext===ticketSource)throw new Error("Manual Paper submit memoization was not updated.");
await writeFile(ticketPath,ticketNext);
