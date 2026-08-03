import { replaceExact } from "./utils.mjs";

await replaceExact(
  "app/manual-paper-ticket.tsx",
  `  entryDepthFill?: PaperDepthFillEvidence;\n  fee: number;`,
  `  entryDepthFill?: PaperDepthFillEvidence;\n  exitDepthFill?: PaperDepthFillEvidence;\n  fee: number;`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `    depthPreview=(()=>{try{return contract&&depth&&publicPrice&&publicPrice>0&&requestedContractOrder?simulatePaperMarketDepthFill({side,requestedContractVolume:requestedContractOrder.contractVolume,referencePrice:publicPrice,contract,depth}):null}catch{return null}})(),`,
  `    depthPreview=(()=>{try{return contract&&depth&&publicPrice&&publicPrice>0&&requestedContractOrder?simulatePaperMarketDepthFill({side,requestedContractVolume:requestedContractOrder.contractVolume,referencePrice:publicPrice,contract,depth}):null}catch{return null}})(),\n    exitDepthPreview=(()=>{try{const openVolume=position&&contract?(position.contractVolume??position.quantity/contract.contractSize):0;return position&&contract&&depth&&mark>0&&openVolume>0?simulatePaperMarketDepthFill({side:position.side,opening:false,requestedContractVolume:openVolume,openContractVolume:openVolume,minimumRemainingContractVolume:position.minContractVolume??contract.minVol,referencePrice:mark,contract,depth}):null}catch{return null}})(),`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `              <span>New entries walk visible public depth. Current close, reversal and automatic risk exits retain the configured fallback slippage until the next Fidelity V2 sub-slice.</span>`,
  `              <span>New entries and manual Close / Flash Close actions walk visible public depth. Reverse, Flatten All and automatic risk exits retain fallback slippage until their dedicated lifecycle slice.</span>`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `                          <span className={styles.rowActions}>\n                            {[25, 50, 75].map((percentage) => (`,
  `                          <span className={styles.rowActions}>\n                            {p.symbol===symbol&&exitDepthPreview?<small>{\`Exit depth \${exitDepthPreview.fillStatus} · \${exitDepthPreview.filledContractVolume}/\${exitDepthPreview.requestedContractVolume} contracts · \${exitDepthPreview.levelsConsumed} levels · \${exitDepthPreview.priceImpactBps.toFixed(2)} bps\`}</small>:null}\n                            {[25, 50, 75].map((percentage) => (`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `void action("partial-close", { percentage })`,
  `void action("partial-close", { symbol:p.symbol, percentage })`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `onClick={() => void action("flash-close")}`,
  `onClick={() => void action("flash-close",{symbol:p.symbol})}`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `onClick={() => void action("reverse")}`,
  `onClick={() => void action("reverse",{symbol:p.symbol})}`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `{fill.entryDepthFill?<small>{\`depth \${fill.entryDepthFill.fillStatus} · \${fill.entryDepthFill.filledContractVolume}/\${fill.entryDepthFill.requestedContractVolume} contracts · \${fill.entryDepthFill.levelsConsumed} levels · \${fill.entryDepthFill.priceImpactBps.toFixed(2)} bps\`}</small>:null}`,
  `{fill.entryDepthFill?<small>{\`entry depth \${fill.entryDepthFill.fillStatus} · \${fill.entryDepthFill.filledContractVolume}/\${fill.entryDepthFill.requestedContractVolume} contracts · \${fill.entryDepthFill.levelsConsumed} levels · \${fill.entryDepthFill.priceImpactBps.toFixed(2)} bps\`}</small>:null}\n                          {fill.exitDepthFill?<small>{\`exit depth \${fill.exitDepthFill.fillStatus} · \${fill.exitDepthFill.filledContractVolume}/\${fill.exitDepthFill.requestedContractVolume} contracts · remaining \${fill.exitDepthFill.remainingPositionContractVolume??0} · \${fill.exitDepthFill.levelsConsumed} levels · \${fill.exitDepthFill.priceImpactBps.toFixed(2)} bps\`}</small>:null}`
);
