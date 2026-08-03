import { replaceExact, replaceRegex } from "./utils.mjs";

await replaceExact(
  "app/lib/manual-paper.ts",
  `entryFee:fee,...feeSnapshot,riskPriceSource`,
  `entryFee:fee,...feeSnapshot,...fundingPositionSnapshot(funding),fundingPnl:0,riskPriceSource`
);

await replaceExact(
  "app/lib/manual-paper.ts",
  `pnl=(slipped-position.entryPrice)*position.quantity*(position.side==="long"?1:-1),net=pnl-position.entryFee-fee;account.cashBalance=Math.max(0,account.cashBalance+pnl-fee);account.realisedPnl+=net;`,
  `pnl=(slipped-position.entryPrice)*position.quantity*(position.side==="long"?1:-1),tradingNet=pnl-position.entryFee-fee,fundingPnl=position.fundingPnl??0,net=tradingNet+fundingPnl;account.cashBalance=Math.max(0,account.cashBalance+pnl-fee);account.realisedPnl+=tradingNet;`
);
await replaceRegex(
  "app/lib/manual-paper.ts",
  /closeReason,grossPnl:pnl,netPnl:net,realisedPnl:net,resultingBalance/,
  `closeReason,grossPnl:pnl,fundingPnl,netPnl:net,realisedPnl:net,resultingBalance`
);

await replaceRegex(
  "app/lib/manual-paper.ts",
  /export async function markManualPosition\(.*?\}\)\nfunction validateKey/s,
  `export async function syncManualFunding(userId:string,symbol:string,riskPrice:number,source:RiskPriceSource,current?:MexcFundingRateSnapshot,history:readonly MexcFundingSettlement[]=[]){return serial(userId,async()=>{const account=await readManualAccount(userId),position=account.positions[symbol];if(!position)return account;applyFundingHistory(account,userId,position,riskPrice,source,current,history);account.updatedAt=new Date().toISOString();await writeManualAccount(userId,account);return account})}\nexport async function markManualPosition(userId:string,symbol:string,riskPrice:number,source:RiskPriceSource,current?:MexcFundingRateSnapshot,history:readonly MexcFundingSettlement[]=[]){return serial(userId,async()=>{const account=await readManualAccount(userId),position=account.positions[symbol];if(!position)return account;applyFundingHistory(account,userId,position,riskPrice,source,current,history);position.lastRiskPrice=riskPrice;position.riskPriceSource=source;const reason=evaluatePaperClose({side:position.side,riskPrice,stopLoss:position.stopLoss,takeProfit:position.takeProfit,estimatedLiquidation:position.estimatedLiquidation});if(reason)closeAt(account,userId,symbol,riskPrice,\`auto-\${reason}-\${Date.now()}\`,reason);account.updatedAt=new Date().toISOString();await writeManualAccount(userId,account);return account})}\nfunction validateKey`
);

await replaceExact(
  "app/lib/manual-paper.ts",
  `account.positions[symbol]={...old,...feeSnapshot,tradeId,side:openSide,entryPrice:openPrice,margin,stopLoss:null,takeProfit:null,openedAt:timestamp};`,
  `account.positions[symbol]={...old,...feeSnapshot,tradeId,side:openSide,entryPrice:openPrice,margin,stopLoss:null,takeProfit:null,fundingPnl:0,lastFundingSettlementAt:Date.parse(timestamp),openedAt:timestamp};`
);
await replaceExact(
  "app/lib/manual-paper.ts",
  `openedAt:old.openedAt,closeReason:"reversal",realisedPnl:pnl`,
  `openedAt:old.openedAt,closeReason:"reversal",fundingPnl:old.fundingPnl??0,netPnl:pnl-closeFee+(old.fundingPnl??0),realisedPnl:pnl-closeFee+(old.fundingPnl??0)`
);
