import { replaceExact, replaceRegex } from "./utils.mjs";

await replaceExact(
  "app/manual-paper-ticket.tsx",
  `import {clampContractLeverage,isMexcStepAligned,leverageStopsForContract,quantizeMexcExecutionPrice,quantizeMexcStep,sizeMexcContractOrder,type MexcContractMetadata} from "./lib/mexc-contract-metadata";`,
  `import {clampContractLeverage,isMexcStepAligned,leverageStopsForContract,quantizeMexcStep,sizeMexcContractOrder,type MexcContractMetadata} from "./lib/mexc-contract-metadata";\nimport {simulatePaperMarketDepthFill,type PaperDepthFillEvidence} from "./lib/manual-paper-depth";\nimport type {DepthEnvelope} from "./lib/order-flow/types";`
);

await replaceExact(
  "app/manual-paper-ticket.tsx",
  `  maxContractVolume?: number;\n  entryPrice: number;`,
  `  maxContractVolume?: number;\n  entryDepthFill?: PaperDepthFillEvidence;\n  entryPrice: number;`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `  contractVolume?: number;\n  fee: number;`,
  `  contractVolume?: number;\n  entryDepthFill?: PaperDepthFillEvidence;\n  fee: number;`
);

await replaceExact(
  "app/manual-paper-ticket.tsx",
  `  const [riskState,setRiskState]=useState<{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null>(null),[contract,setContract]=useState<MexcContractMetadata|null>(null),[funding,setFunding]=useState<FundingRate|null>(null);`,
  `  const [riskState,setRiskState]=useState<{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null>(null),[contract,setContract]=useState<MexcContractMetadata|null>(null),[funding,setFunding]=useState<FundingRate|null>(null),[depth,setDepth]=useState<DepthEnvelope|null>(null);`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `contract?:MexcContractMetadata|null;funding?:FundingRate|null },nextContract=payload.contract??null;setAccount(payload.account);setRiskState(payload.riskPrice??null);setContract(nextContract);setFunding(payload.funding??null);`,
  `contract?:MexcContractMetadata|null;funding?:FundingRate|null;depth?:DepthEnvelope|null },nextContract=payload.contract??null;setAccount(payload.account);setRiskState(payload.riskPrice??null);setContract(nextContract);setFunding(payload.funding??null);setDepth(payload.depth??null);`
);

await replaceRegex(
  "app/manual-paper-ticket.tsx",
  /    rawExecutionPrice=.*?    contractVolume=contractOrder\?\.contractVolume\?\?0,/s,
  `    rawContractVolume=contract&&publicPrice&&publicPrice>0?targetNotional/(publicPrice*contract.contractSize):0,
    steppedContractVolume=contract&&rawContractVolume>0?quantizeMexcStep(rawContractVolume,contract.volUnit,"floor"):0,
    contractVolumeIssue=contract&&targetNotional>0?(steppedContractVolume<contract.minVol?\`Minimum \${contract.minVol} contracts\`:steppedContractVolume>contract.maxVol?\`Maximum \${contract.maxVol} contracts\`:null):null,
    requestedContractOrder=(()=>{try{return contract&&publicPrice&&publicPrice>0&&!contractVolumeIssue?sizeMexcContractOrder(targetNotional,publicPrice,contract):null}catch{return null}})(),
    depthPreview=(()=>{try{return contract&&depth&&publicPrice&&publicPrice>0&&requestedContractOrder?simulatePaperMarketDepthFill({side,requestedContractVolume:requestedContractOrder.contractVolume,referencePrice:publicPrice,contract,depth}):null}catch{return null}})(),
    executionPrice=depthPreview?.executionPrice??publicPrice??0,
    contractOrder=depthPreview?{contractVolume:depthPreview.filledContractVolume,quantity:depthPreview.quantity,notional:depthPreview.notional}:requestedContractOrder,
    contractVolume=contractOrder?.contractVolume??0,`
);

await replaceExact(
  "app/manual-paper-ticket.tsx",
  `                ["Execution assumption", "Market · taker"],`,
  `                ["Execution assumption", "Market · taker"],\n                ["Entry fill model", depthPreview?"DizyFlow visible-book walk":"Fresh depth captured on submit"],\n                ["Visible fill", depthPreview?\`${depthPreview.fillStatus} · \${depthPreview.filledContractVolume}/\${depthPreview.requestedContractVolume} contracts\`:"Preview unavailable"],\n                ["Depth impact", depthPreview?\`${depthPreview.priceImpactBps.toFixed(2)} bps · \${money(depthPreview.executionPrice)} avg\`:"Calculated on submit"],\n                ["Depth levels", depthPreview?\`${depthPreview.levelsConsumed} \${depthPreview.bookSide} level\${depthPreview.levelsConsumed===1?"":"s"}\`:"—"],\n                ["Depth snapshot", depthPreview?\`v\${depthPreview.snapshotVersion} · \${Math.round(depthPreview.snapshotAgeMs)}ms · \${depthPreview.sourceMode??"public depth"}\`:"Not warm"],`
);

await replaceExact(
  "app/manual-paper-ticket.tsx",
  `              {invalidPriceStep&&contract?<span>Stop loss and take profit must use {contract.priceUnit} price increments.</span>:null}\n              <span>Immediate Manual Paper actions assume market execution and taker liquidity. Public fee rates do not include account-specific discounts or promotions.</span>`,
  `              {invalidPriceStep&&contract?<span>Stop loss and take profit must use {contract.priceUnit} price increments.</span>:null}\n              {depthPreview?.fillStatus==="partial"?<span>Visible depth fills {depthPreview.filledContractVolume} of {depthPreview.requestedContractVolume} requested contracts; the remainder is not invented.</span>:null}\n              {!depth?<span>Depth preview is not warm; a fresh DizyFlow book is required and captured on submit.</span>:null}\n              <span>New entries walk visible public depth. Current close, reversal and automatic risk exits retain the configured fallback slippage until the next Fidelity V2 sub-slice.</span>\n              <span>Immediate Manual Paper actions assume market execution and taker liquidity. Public fee rates do not include account-specific discounts or promotions.</span>`
);

await replaceExact(
  "app/manual-paper-ticket.tsx",
  `{fill.feeSource?<small>{\`${fill.executionType??"market"} · \${fill.liquidityRole??"taker"} · \${((fill.feeRate??0)*100).toFixed(4)}% · \${fill.feeSource==="mexc-public-contract"?"MEXC public":"legacy fallback"} · fee \${money(fill.fee)}\`}</small>:null}`,
  `{fill.feeSource?<small>{\`${fill.executionType??"market"} · \${fill.liquidityRole??"taker"} · \${((fill.feeRate??0)*100).toFixed(4)}% · \${fill.feeSource==="mexc-public-contract"?"MEXC public":"legacy fallback"} · fee \${money(fill.fee)}\`}</small>:null}\n                          {fill.entryDepthFill?<small>{\`depth \${fill.entryDepthFill.fillStatus} · \${fill.entryDepthFill.filledContractVolume}/\${fill.entryDepthFill.requestedContractVolume} contracts · \${fill.entryDepthFill.levelsConsumed} levels · \${fill.entryDepthFill.priceImpactBps.toFixed(2)} bps\`}</small>:null}`
);
