import { replaceExact, replaceRegex, write } from "./utils.mjs";

await replaceExact(
  "app/manual-paper-ticket.tsx",
  `type Position = {`,
  `type FundingRate={symbol:string;fundingRate:number;minFundingRate:number;maxFundingRate:number;collectCycleHours:number;nextSettleTime:number;observedAt:number;source:"mexc-public-funding-rate"};\ntype FundingPayment={paymentId:string;tradeId:string;symbol:string;side:"long"|"short";settleTime:number;observedAt:number;price:number;priceSource:"fair"|"last";notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";resultingBalance:number};\ntype Position = {`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `  takerFeeRate?: number;\n  riskPriceSource:`,
  `  takerFeeRate?: number;\n  fundingRate?: number;\n  fundingCollectCycleHours?: number;\n  nextFundingTime?: number;\n  fundingSource?: "mexc-public-funding-rate";\n  fundingPnl?: number;\n  riskPriceSource:`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `  fees: number;\n  positions:`,
  `  fees: number;\n  fundingPnl: number;\n  fundingPayments: FundingPayment[];\n  positions:`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `  const [riskState,setRiskState]=useState<{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null>(null),[contract,setContract]=useState<MexcContractMetadata|null>(null);`,
  `  const [riskState,setRiskState]=useState<{price:number;source:"fair"|"last";fallback:boolean;stale?:boolean}|null>(null),[contract,setContract]=useState<MexcContractMetadata|null>(null),[funding,setFunding]=useState<FundingRate|null>(null);`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `contract?:MexcContractMetadata|null },nextContract=payload.contract??null;setAccount(payload.account);setRiskState(payload.riskPrice??null);setContract(nextContract);`,
  `contract?:MexcContractMetadata|null;funding?:FundingRate|null },nextContract=payload.contract??null;setAccount(payload.account);setRiskState(payload.riskPrice??null);setContract(nextContract);setFunding(payload.funding??null);`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `    fee = Math.max(0,notional*feeRate),`,
  `    fee = Math.max(0,notional*feeRate),\n    fundingRate=funding?.fundingRate??position?.fundingRate??0,\n    fundingNotional=position?position.quantity*mark:notional,\n    estimatedFunding=(side==="long"?-1:1)*fundingNotional*fundingRate,\n    nextFundingTime=funding?.nextSettleTime??position?.nextFundingTime??0,\n    lastFundingPayment=account?.fundingPayments?.at(-1),`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `                ["Estimated fee", money(fee)],`,
  `                ["Estimated fee", money(fee)],\n                ["Funding rate", funding?\`${(fundingRate*100).toFixed(4)}% · \${funding.collectCycleHours}h\`:"Unavailable"],\n                ["Next funding", nextFundingTime?new Date(nextFundingTime).toLocaleString():"Unavailable"],\n                ["Est. next funding", funding?\`${estimatedFunding>=0?"Receive":"Pay"} \${money(Math.abs(estimatedFunding))}\`:"Unavailable"],\n                ["Funding source", funding?.source??"Unavailable"],`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}`,
  `              {!stopLoss?<span>No stop loss — estimated liquidation remains active.</span>:null}\n              {funding?<span>Funding uses public settled rates with the observed {riskState?.source??"risk"} price as an explicit notional approximation.</span>:null}`
);
await replaceExact(
  "app/manual-paper-ticket.tsx",
  `                  ["Cash balance", money(account?.cashBalance ?? 0)],`,
  `                  ["Cash balance", money(account?.cashBalance ?? 0)],\n                  ["Funding P/L", money(account?.fundingPnl ?? 0)],\n                  ["Last funding", lastFundingPayment?\`${lastFundingPayment.cashDelta>=0?"Received":"Paid"} \${money(Math.abs(lastFundingPayment.cashDelta))} · \${lastFundingPayment.source}\`:"None"],`
);

await write(
  "tests/manual-paper-funding.test.mjs",
  `import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePaperFundingPayment,
  dueMexcFundingSettlements,
  parseMexcFundingHistory,
  parseMexcFundingRate,
} from "../app/lib/manual-paper-funding.ts";

const currentPayload={success:true,data:{symbol:"BTC_USDT",fundingRate:.001,maxFundingRate:.003,minFundingRate:-.003,collectCycle:8,nextSettleTime:2_000_000_000_000}};
const historyPayload=(settleTime)=>({success:true,data:{resultList:[{symbol:"BTC_USDT",fundingRate:.001,settleTime}]}});
const contract={symbol:"BTC_USDT",displayName:"BTCUSDT SWAP",contractSize:.001,minLeverage:1,maxLeverage:125,priceUnit:.1,volUnit:1,minVol:1,maxVol:1_000_000,makerFeeRate:.0002,takerFeeRate:.0006,maintenanceMarginRate:.004,initialMarginRate:.008,positionOpenType:3,riskLimitType:"BY_VOLUME"};

test("MEXC funding snapshots retain settlement cadence and provenance",()=>{const snapshot=parseMexcFundingRate(currentPayload,"BTC_USDT",1_900_000_000_000);assert.equal(snapshot.collectCycleHours,8);assert.equal(snapshot.source,"mexc-public-funding-rate");const history=parseMexcFundingHistory(historyPayload(1_950_000_000_000),"BTC_USDT");assert.equal(history[0].source,"mexc-public-funding-history");assert.equal(dueMexcFundingSettlements(history,1_900_000_000_000,null,1_960_000_000_000).length,1)});

test("positive funding charges longs and credits shorts",()=>{assert.equal(calculatePaperFundingPayment({side:"long",quantity:2,observedPrice:100,fundingRate:.001}).calculatedCashDelta,-.2);assert.equal(calculatePaperFundingPayment({side:"short",quantity:2,observedPrice:100,fundingRate:.001}).calculatedCashDelta,.2)});

test("Manual Paper applies each settled funding event once and preserves it through backup",async()=>{const {mkdtemp,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path"),{submitManualOrder,syncManualFunding,closeManualPosition}=await import("../app/lib/manual-paper.ts"),{validateManualPaperBackup}=await import("../app/lib/manual-paper-backup.ts"),prior=process.env.DATA_DIR,root=await mkdtemp(join(tmpdir(),"dizy-paper-funding-"));process.env.DATA_DIR=root;try{let account=await submitManualOrder("funding-owner",{idempotencyKey:"funding-open-000001",symbol:"BTC_USDT",side:"long",sizeMode:"fixed-notional",amount:100,leverage:10},100,"fair",contract,parseMexcFundingRate(currentPayload,"BTC_USDT",Date.now()));const position=account.positions.BTC_USDT,opened=Date.parse(position.openedAt);await new Promise(resolve=>setTimeout(resolve,5));const settlement={symbol:"BTC_USDT",fundingRate:.001,settleTime:opened+1,source:"mexc-public-funding-history"};account=await syncManualFunding("funding-owner","BTC_USDT",100,"fair",undefined,[settlement]);assert.equal(account.fundingPayments.length,1);assert.ok(account.fundingPnl<0);assert.equal(account.positions.BTC_USDT.fundingPnl,account.fundingPnl);const once=account.fundingPnl;account=await syncManualFunding("funding-owner","BTC_USDT",100,"fair",undefined,[settlement]);assert.equal(account.fundingPayments.length,1);assert.equal(account.fundingPnl,once);const restored=validateManualPaperBackup(account,"funding-owner");assert.equal(restored.fundingPayments[0].source,"mexc-public-funding-history");account=await closeManualPosition("funding-owner","BTC_USDT","funding-close-00001",101);const closed=account.fills.at(-1);assert.equal(closed.fundingPnl,once);assert.ok(Math.abs(closed.netPnl-((closed.grossPnl??0)-(closed.entryFee??0)-closed.fee+once))<1e-12)}finally{if(prior===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=prior;await rm(root,{recursive:true,force:true})}});
`
);

await replaceExact(
  "ROADMAP.md",
  `- [ ] funding-payment modelling with explicit data provenance\n- [ ] depth-sensitive slippage and partial-fill modelling`,
  `- [x] funding-payment modelling with explicit data provenance\n- [ ] depth-sensitive slippage and partial-fill modelling`
);
await replaceExact(
  "ROADMAP.md",
  `Next slice: funding-payment modelling with explicit data provenance.`,
  `Next slice: depth-sensitive slippage and partial-fill modelling.`
);
