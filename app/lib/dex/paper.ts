export function estimateDexFill(input:{side:"buy"|"sell";notionalUsd:number;liquidityUsd:number;slippageBps:number;networkFeeUsd:number}){
  for(const value of Object.values(input)) if(typeof value==="number"&&(!Number.isFinite(value)||value<0)) throw new Error("Invalid simulation value");
  if(input.notionalUsd<=0||input.liquidityUsd<=0) throw new Error("No modeled liquidity");
  const maxFill=input.liquidityUsd*.1; if(input.notionalUsd>maxFill) throw new Error("Requested fill exceeds modeled available liquidity");
  const impactPct=(input.notionalUsd/input.liquidityUsd)*50, slippagePct=input.slippageBps/100;
  return {estimated:true,filledUsd:input.notionalUsd,priceImpactPct:impactPct,totalCostUsd:input.notionalUsd*(impactPct+slippagePct)/100+input.networkFeeUsd};
}
