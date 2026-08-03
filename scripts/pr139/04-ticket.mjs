import { replaceExact } from "./utils.mjs";

await replaceExact(
  "app/manual-paper-ticket.tsx",
  'type Position = {',
  'type FundingRate={symbol:string;fundingRate:number;minFundingRate:number;maxFundingRate:number;collectCycleHours:number;nextSettleTime:number;observedAt:number;source:"mexc-public-funding-rate"};\ntype FundingPayment={paymentId:string;tradeId:string;symbol:string;side:"long"|"short";settleTime:number;observedAt:number;price:number;priceSource:"fair"|"last";notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";resultingBalance:number};\ntype Position = {'
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '  takerFeeRate?: number;\n  riskPriceSource:',
  '  takerFeeRate?: number;\n  fundingRate?: number;\n  fundingCollectCycleHours?: number;\n  nextFundingTime?: number;\n  fundingSource?: "mexc-public-funding-rate";\n  fundingPnl?: number;\n  riskPriceSource:'
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '  fees: number;\n  positions:',
  '  fees: number;\n  fundingPnl: number;\n  fundingPayments: FundingPayment[];\n  positions:'
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '  const [riskState,setRiskState]=useState<{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null>(null),[contract,setContract]=useState<MexcContractMetadata|null>(null);',
  '  const [riskState,setRiskState]=useState<{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null>(null),[contract,setContract]=useState<MexcContractMetadata|null>(null),[funding,setFunding]=useState<FundingRate|null>(null);'
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  'contract?:MexcContractMetadata|null },nextContract=payload.contract??null;setAccount(payload.account);setRiskState(payload.riskPrice??null);setContract(nextContract);',
  'contract?:MexcContractMetadata|null;funding?:FundingRate|null },nextContract=payload.contract??null;setAccount(payload.account);setRiskState(payload.riskPrice??null);setContract(nextContract);setFunding(payload.funding??null);'
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '    fee = Math.max(0,notional*feeRate),',
  '    fee = Math.max(0,notional*feeRate),\n    fundingRate=funding?.fundingRate??position?.fundingRate??0,\n    fundingCycle=funding?.collectCycleHours??position?.fundingCollectCycleHours??0,\n    fundingSource=funding?.source??position?.fundingSource??null,\n    fundingNotional=position?position.quantity*mark:notional,\n    fundingSide=position?.side??side,\n    estimatedFunding=(fundingSide==="long"?-1:1)*fundingNotional*fundingRate,\n    nextFundingTime=funding?.nextSettleTime??position?.nextFundingTime??0,\n    lastFundingPayment=account?.fundingPayments?.at(-1),'
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '                ["Estimated fee", money(fee)],',
  '                ["Estimated fee", money(fee)],\n                ["Funding rate", fundingSource?`${(fundingRate*100).toFixed(4)}% · ${fundingCycle}h`:"Unavailable"],\n                ["Next funding", nextFundingTime?new Date(nextFundingTime).toLocaleString():"Unavailable"],\n                ["Est. next funding", fundingSource?`${estimatedFunding>=0?"Receive":"Pay"} ${money(Math.abs(estimatedFunding))}`:"Unavailable"],\n                ["Funding source", fundingSource??"Unavailable"],'
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}',
  '              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\n              {fundingSource?<span>Funding uses public settled rates with the observed {riskState?.source??position?.riskPriceSource??"risk"} price as an explicit notional approximation.</span>:null}'
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  '                  ["Cash balance", money(account?.cashBalance ?? 0)],',
  '                  ["Cash balance", money(account?.cashBalance ?? 0)],\n                  ["Funding P/L", money(account?.fundingPnl ?? 0)],\n                  ["Last funding", lastFundingPayment?`${lastFundingPayment.cashDelta>=0?"Received":"Paid"} ${money(Math.abs(lastFundingPayment.cashDelta))} · ${lastFundingPayment.source}`:"None"],'
);
