import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/pr137/apply.mjs";
const source = await readFile(path, "utf8");
const from = `await replaceExact(
  "app/manual-paper-ticket.tsx",
  '              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}\\n              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\\n',
  '              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}\\n              <span>Immediate Manual Paper actions assume market execution and taker liquidity. Public fee rates do not include account-specific discounts or promotions.</span>\\n              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\\n',
);`;
const to = `await replaceExact(
  "app/manual-paper-ticket.tsx",
  '              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}\\n              {contractVolumeIssue?<span>{contractVolumeIssue}; requested size cannot be opened.</span>:null}\\n              {invalidPriceStep&&contract?<span>Stop loss and take profit must use {contract.priceUnit} price increments.</span>:null}\\n              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\\n',
  '              {!contract?<span>Public MEXC contract rules unavailable — opening new paper positions is disabled.</span>:null}\\n              {contractVolumeIssue?<span>{contractVolumeIssue}; requested size cannot be opened.</span>:null}\\n              {invalidPriceStep&&contract?<span>Stop loss and take profit must use {contract.priceUnit} price increments.</span>:null}\\n              <span>Immediate Manual Paper actions assume market execution and taker liquidity. Public fee rates do not include account-specific discounts or promotions.</span>\\n              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\\n',
);`;
if (!source.includes(from)) throw new Error("PR137 warning patch target not found.");
await writeFile(path, source.replace(from, to));
