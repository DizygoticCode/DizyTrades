import {readFile,writeFile} from "node:fs/promises";
const once=(value,oldText,newText,label)=>{const count=value.split(oldText).length-1;if(count!==1)throw new Error(label+": "+count);return value.replace(oldText,newText)};
{
 const path="app/api/manual-paper/route.ts",source=await readFile(path,"utf8");
 const old='account=await markManualPosition(user.id,symbol,selected.price,selected.source,fundingData.current??undefined,fundingData.history)';
 const next=once(source,old,'account=await markManualPosition(user.id,symbol,selected.price,selected.source,fundingData.current??undefined,fundingData.history,depth,contract,true)','route auto depth');
 await writeFile(path,next);
}
{
 const path="app/manual-paper-ticket.tsx",source=await readFile(path,"utf8");
 let next=once(source,'  lastRiskPrice: number;\n  stopLoss?: number;','  lastRiskPrice: number;\n  pendingRiskExit?:{reason:"stop"|"target"|"liquidation";triggeredAt:string;triggerPrice:number;priceSource:"fair"|"last"};\n  stopLoss?: number;','position pending type');
 next=once(next,'  timestamp: string;\n  closeReason?: "manual"|"stop"|"target"|"liquidation"|"reversal";','  timestamp: string;\n  riskExitTrigger?:{reason:"stop"|"target"|"liquidation";triggeredAt:string;triggerPrice:number;priceSource:"fair"|"last"};\n  closeReason?: "manual"|"stop"|"target"|"liquidation"|"reversal";','fill trigger type');
 next=once(next,'<span>{p.marginMode}<small>Estimated liquidation {money(p.estimatedLiquidation)}</small></span>','<span>{p.marginMode}<small>Estimated liquidation {money(p.estimatedLiquidation)}</small>{p.pendingRiskExit?<small>{`${p.pendingRiskExit.reason.toUpperCase()} triggered · ${money(p.pendingRiskExit.triggerPrice)} · awaiting visible depth`}</small>:null}</span>','position pending display');
 next=once(next,'                          {fill.exitDepthFill?<small>{`exit depth ${fill.exitDepthFill.fillStatus} · ${fill.exitDepthFill.filledContractVolume}/${fill.exitDepthFill.requestedContractVolume} contracts · remaining ${fill.exitDepthFill.remainingPositionContractVolume??0} · ${fill.exitDepthFill.levelsConsumed} levels · ${fill.exitDepthFill.priceImpactBps.toFixed(2)} bps`}</small>:null}\n                          {fill.closeReason?<small>{fill.closeReason}</small>:null}','                          {fill.exitDepthFill?<small>{`exit depth ${fill.exitDepthFill.fillStatus} · ${fill.exitDepthFill.filledContractVolume}/${fill.exitDepthFill.requestedContractVolume} contracts · remaining ${fill.exitDepthFill.remainingPositionContractVolume??0} · ${fill.exitDepthFill.levelsConsumed} levels · ${fill.exitDepthFill.priceImpactBps.toFixed(2)} bps`}</small>:null}\n                          {fill.riskExitTrigger?<small>{`${fill.riskExitTrigger.reason} triggered ${new Date(fill.riskExitTrigger.triggeredAt).toLocaleString()} at ${money(fill.riskExitTrigger.triggerPrice)} · ${fill.riskExitTrigger.priceSource}`}</small>:null}\n                          {fill.closeReason?<small>{fill.closeReason}</small>:null}','history trigger display');
 next=once(next,'              <span>New entries and manual Close / Flash Close actions walk visible public depth. Reverse, Flatten All and automatic risk exits retain fallback slippage until their dedicated lifecycle slice.</span>','              {position?.pendingRiskExit?<span>{`${position.pendingRiskExit.reason.toUpperCase()} triggered at ${money(position.pendingRiskExit.triggerPrice)}; the residual exit remains active until fresh visible depth can execute it.`}</span>:null}\n              <span>Entries, manual exits, Reverse and Flatten All walk visible public depth. Triggered stop, target and liquidation exits persist and retry against fresh depth; unfilled residuals are never invented away.</span>','risk warning copy');
 await writeFile(path,next);
}
{
 const path="ROADMAP.md",source=await readFile(path,"utf8");
 let next=once(source,'- [ ] depth-sensitive slippage and partial-fill modelling','- [x] depth-sensitive slippage and partial-fill modelling','complete depth roadmap');
 next=once(next,'Current slice: visible-book market entries and manual exits are complete; Reverse and Flatten All now use sequential visible-book execution. Automatic stop/target/liquidation depth lifecycle remains before this roadmap item is complete.','Depth-sensitive visible-book execution is complete across entries, manual exits, Reverse, Flatten All and automatic stop/target/liquidation exits, including persistent partial risk exits. Current slice: reduce-only semantics.','roadmap current slice');
 await writeFile(path,next);
}
