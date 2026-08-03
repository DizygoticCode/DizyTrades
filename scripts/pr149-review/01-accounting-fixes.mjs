import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,from,to,label)=>{const index=source.indexOf(from);if(index<0)throw new Error(`Missing ${label}`);if(source.indexOf(from,index+from.length)>=0)throw new Error(`Ambiguous ${label}`);return source.slice(0,index)+to+source.slice(index+from.length)};
const transform=(source,start,end,replacement,label)=>{const a=source.indexOf(start);if(a<0)throw new Error(`Missing ${label} start`);const b=source.indexOf(end,a+start.length);if(b<0)throw new Error(`Missing ${label} end`);return source.slice(0,a)+replacement+source.slice(b)};

let source=await readFile("app/lib/manual-paper.ts","utf8");
source=replaceOnce(source,
 'export type ManualFundingPayment={paymentId:string;tradeId:string;userId:string;symbol:string;side:ManualSide;settleTime:number;observedAt:number;price:number;priceSource:RiskPriceSource;quantity:number;notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";resultingBalance:number};',
 'export type ManualFundingPayment={paymentId:string;tradeId:string;userId:string;symbol:string;side:ManualSide;settleTime:number;observedAt:number;price:number;priceSource:RiskPriceSource;quantity:number;notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";marginMode?:MarginMode;protectedIsolatedMargin?:number;isolatedMarginDebit?:number;settlementMethod?:"single-asset-usdt-funding-settlement-v1";resultingBalance:number};',
 "funding payment audit type");

const fundingFunction=String.raw`function applyFundingHistory(account:ManualAccount,userId:string,position:ManualPosition,riskPrice:number,priceSource:RiskPriceSource,current?:MexcFundingRateSnapshot,history:readonly MexcFundingSettlement[]=[]){
 const observedAt=Date.now(),due=dueMexcFundingSettlements(history,Date.parse(position.openedAt),position.lastFundingSettlementAt,observedAt);
 for(const settlement of due){
  const paymentId=position.tradeId+":"+settlement.settleTime;
  if(account.fundingPayments.some(payment=>payment.paymentId===paymentId))continue;
  const calculated=calculatePaperFundingPayment({side:position.side,quantity:position.quantity,observedPrice:riskPrice,fundingRate:settlement.fundingRate}),before=account.cashBalance,protectedIsolatedMargin=isolatedReservedMargin(account);
  let cashDelta=calculated.calculatedCashDelta,isolatedMarginDebit=0;
  if(cashDelta<0){
   const requestedDebit=-cashDelta,freePool=Math.max(0,before-protectedIsolatedMargin);
   if(position.marginMode==="cross")cashDelta=-Math.min(requestedDebit,freePool);
   else{
    const minimumMargin=Math.min(position.margin,1e-9),marginCapacity=Math.max(0,position.margin-minimumMargin),appliedDebit=Math.min(requestedDebit,freePool+marginCapacity);
    isolatedMarginDebit=Math.max(0,Math.min(marginCapacity,appliedDebit-freePool));
    cashDelta=-appliedDebit;
    if(isolatedMarginDebit>0)position.margin=Number((position.margin-isolatedMarginDebit).toPrecision(15));
   }
  }
  const after=before+cashDelta;
  account.cashBalance=after;
  account.fundingPnl+=cashDelta;
  account.realisedPnl+=cashDelta;
  position.fundingPnl=(position.fundingPnl??0)+cashDelta;
  position.lastFundingSettlementAt=settlement.settleTime;
  account.fundingPayments.push({paymentId,tradeId:position.tradeId,userId,symbol:position.symbol,side:position.side,settleTime:settlement.settleTime,observedAt,price:riskPrice,priceSource,quantity:position.quantity,notional:calculated.notional,fundingRate:settlement.fundingRate,calculatedCashDelta:calculated.calculatedCashDelta,cashDelta,balanceCapped:Math.abs(cashDelta-calculated.calculatedCashDelta)>1e-12,source:settlement.source,calculationMethod:"observed-risk-price-notional",marginMode:position.marginMode,protectedIsolatedMargin,isolatedMarginDebit,settlementMethod:"single-asset-usdt-funding-settlement-v1",resultingBalance:account.cashBalance});
 }
 if(current?.symbol===position.symbol)Object.assign(position,fundingPositionSnapshot(current));
 account.fundingPayments=account.fundingPayments.slice(-1000)
}`;
source=transform(source,"function applyFundingHistory(","\n function validatedContractOrder",fundingFunction,"funding settlement");

source=replaceOnce(source,
 'entryFee:position.marginMode==="isolated"?position.entryFee:0,maintenanceMarginRate:tier.maintenanceMarginRate',
 'entryFee:position.marginMode==="isolated"?Math.min(position.entryFee,Math.max(0,position.margin-1e-9)):0,maintenanceMarginRate:tier.maintenanceMarginRate',
 "risk refresh entry-fee bound");

source=replaceOnce(source,
 'const postCloseEquity=manualEquity(account,{[input.symbol]:marketPrice}),margin=notional/sizing.leverage,available=manualAvailableMargin(account),riskTier=validatedEntryRiskTier(currentContract,contractVolume,notional,sizing.leverage);if(margin>available)fail("INSUFFICIENT_EQUITY","amount","Margin exceeds available manual paper equity.");const exits=validateExits(input.side,slipped,input.stopLoss,input.takeProfit,currentContract.priceUnit),feeSnapshot=mexcPublicMarketTakerFeeSnapshot(currentContract),feeBreakdown=paperExecutionFee(notional,feeSnapshot),fee=feeBreakdown.totalFee;account.cashBalance-=fee;',
 'const postCloseEquity=manualEquity(account,{[input.symbol]:marketPrice}),margin=notional/sizing.leverage,available=manualAvailableMargin(account),riskTier=validatedEntryRiskTier(currentContract,contractVolume,notional,sizing.leverage),exits=validateExits(input.side,slipped,input.stopLoss,input.takeProfit,currentContract.priceUnit),feeSnapshot=mexcPublicMarketTakerFeeSnapshot(currentContract),feeBreakdown=paperExecutionFee(notional,feeSnapshot),fee=feeBreakdown.totalFee;if(margin+fee>available)fail("INSUFFICIENT_EQUITY","amount","Margin and entry fee exceed available manual paper equity.");account.cashBalance-=fee;',
 "entry fee capacity");

source=replaceOnce(source,
 'available=manualAvailableMargin(account),riskTier=validatedEntryRiskTier(current,entryDepthFill.filledContractVolume,notional,old.leverage);if(margin>available)fail("INSUFFICIENT_EQUITY","amount","Reversed position exceeds available equity after the close leg.");',
 'available=manualAvailableMargin(account),riskTier=validatedEntryRiskTier(current,entryDepthFill.filledContractVolume,notional,old.leverage);if(margin+fee>available)fail("INSUFFICIENT_EQUITY","amount","Reversed position margin and entry fee exceed available equity after the close leg.");',
 "depth reverse fee capacity");

const legacyReverse=String.raw`async function reverseManualPositionLegacy(userId:string,symbol:string,key:string,marketPrice:number,target?:ManualReduceOnlyTarget){return serial(userId,async()=>{
 const account=await readManualAccount(userId);
 if(!account.settings.enabled)fail("MANUAL_PAPER_DISABLED","settings.enabled","Manual Paper is disabled.");
 validateKey(account,key);
 const old=account.positions[symbol];
 if(!old)fail("NO_POSITION","symbol","No manual position.");
 if(old.pendingRiskExit)fail("RISK_EXIT_PENDING","side","A triggered risk exit must finish before reversing the position.");
 const reduceOnlyPlan=manualReduceOnlyPlan(old,old.quantity,old.quantity,"reverse",target),openSide:ManualSide=old.side==="long"?"short":"long",rawOpenPrice=marketPrice*(1+(openSide==="long"?1:-1)*account.settings.slippagePct/100),openPrice=old.priceUnit?quantizeMexcExecutionPrice(rawOpenPrice,old.priceUnit,openSide,true):rawOpenPrice,openNotional=old.quantity*openPrice,feeSnapshot=positionMarketTakerFeeSnapshot(old,account.settings),openFeeBreakdown=paperExecutionFee(openNotional,feeSnapshot),openFee=openFeeBreakdown.totalFee,margin=openNotional/old.leverage,timestamp=new Date().toISOString();
 closeAt(account,userId,symbol,marketPrice,key+":close","reversal",reduceOnlyPlan);
 const available=manualAvailableMargin(account);
 if(margin+openFee>available)fail("INSUFFICIENT_EQUITY","amount","Reversed position margin and entry fee exceed available equity after the close leg.");
 account.cashBalance-=openFee;
 account.fees+=openFee;
 const tradeId="mp1_"+randomUUID().replaceAll("-","");
 account.positions[symbol]={...old,...feeSnapshot,tradeId,side:openSide,entryPrice:openPrice,entryFee:openFee,margin,stopLoss:null,takeProfit:null,fundingPnl:0,pendingRiskExit:undefined,lastFundingSettlementAt:Date.parse(timestamp),lastRiskPrice:marketPrice,openedAt:timestamp};
 refreshAccountRisk(account);
 const reopened=account.positions[symbol];
 account.fills.push({orderId:randomUUID(),fillId:randomUUID(),tradeId,marketKey:old.marketKey,marketType:old.marketType,idempotencyKey:key+":open",userId,symbol,side:openSide,marginMode:old.marginMode,leverage:old.leverage,price:openPrice,quantity:old.quantity,...precisionSnapshot(old),notional:openNotional,marginUsed:margin,estimatedLiquidation:reopened.estimatedLiquidation,bankruptcyPrice:reopened.bankruptcyPrice,riskTier:reopened.riskTier,liquidationAudit:reopened.liquidationAudit,marginAudit:reopened.marginAudit,entryFee:openFee,...feeSnapshot,tradingFee:openFeeBreakdown.tradingFee,liquidationPenalty:openFeeBreakdown.liquidationPenalty,fee:openFee,timestamp,realisedPnl:0,resultingBalance:account.cashBalance});
 account.idempotencyKeys.push(key);
 account.updatedAt=timestamp;
 await writeManualAccount(userId,account);
 return account
})}`;
source=transform(source,"async function reverseManualPositionLegacy(","\n\nfunction mapDepthReverseEntryError",legacyReverse,"legacy reverse settlement");
await writeFile("app/lib/manual-paper.ts",source,"utf8");

let ticket=await readFile("app/manual-paper-ticket.tsx","utf8");
ticket=replaceOnce(ticket,
 'type FundingPayment={paymentId:string;tradeId:string;symbol:string;side:"long"|"short";settleTime:number;observedAt:number;price:number;priceSource:"fair"|"last";notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";resultingBalance:number};',
 'type FundingPayment={paymentId:string;tradeId:string;symbol:string;side:"long"|"short";settleTime:number;observedAt:number;price:number;priceSource:"fair"|"last";notional:number;fundingRate:number;calculatedCashDelta:number;cashDelta:number;balanceCapped:boolean;source:"mexc-public-funding-history";calculationMethod:"observed-risk-price-notional";marginMode?:"isolated"|"cross";protectedIsolatedMargin?:number;isolatedMarginDebit?:number;settlementMethod?:"single-asset-usdt-funding-settlement-v1";resultingBalance:number};',
 "ticket funding audit type");
ticket=replaceOnce(ticket,
 '    marginSnapshot=account?.marginSnapshot,\n    equity = Math.max(0, marginSnapshot?.crossEquity ?? ((account?.cashBalance ?? 0) + unrealised)),\n    summary=paperAccountSummary(account?.cashBalance??0,Object.values(account?.positions??{}).map(p=>({...p,margin:p.margin??p.quantity*p.entryPrice/p.leverage})),Object.values(account?.positions??{}).map(p=>p.symbol===symbol?mark:p.lastRiskPrice)),used=summary.usedMargin,',
 '    marginSnapshot=account?.marginSnapshot,\n    summary=paperAccountSummary(account?.cashBalance??0,Object.values(account?.positions??{}).map(p=>({...p,margin:p.margin??p.quantity*p.entryPrice/p.leverage})),Object.values(account?.positions??{}).map(p=>p.symbol===symbol?mark:p.lastRiskPrice)),\n    equity=summary.equity,\n    sizingEquity=Math.max(0,marginSnapshot?.crossEquity??equity),used=summary.usedMargin,',
 "ticket total and sizing equity");
ticket=ticket.replaceAll('(equity * amountNumber) / 100','(sizingEquity * amountNumber) / 100').replaceAll('equity*amountNumber/100/','sizingEquity*amountNumber/100/');
ticket=replaceOnce(ticket,
 '["Last funding", lastFundingPayment?`${lastFundingPayment.cashDelta>=0?"Received":"Paid"} ${money(Math.abs(lastFundingPayment.cashDelta))} · ${lastFundingPayment.source}`:"None"],',
 '["Last funding", lastFundingPayment?`${lastFundingPayment.cashDelta>=0?"Received":"Paid"} ${money(Math.abs(lastFundingPayment.cashDelta))} · ${lastFundingPayment.source}${(lastFundingPayment.isolatedMarginDebit??0)>0?` · isolated margin debit ${money(lastFundingPayment.isolatedMarginDebit??0)}`:""}`:"None"],',
 "ticket funding margin debit");
await writeFile("app/manual-paper-ticket.tsx",ticket,"utf8");
