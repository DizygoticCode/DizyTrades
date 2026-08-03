import {readFile,writeFile} from "node:fs/promises";

const replaceOnce=(source,search,replacement,label)=>{const count=source.split(search).length-1;if(count!==1)throw new Error(`${label}: expected 1 match, found ${count}`);return source.replace(search,replacement)};

{
 const path="app/lib/manual-paper-risk-tiers.ts";
 let source=await readFile(path,"utf8");
 source=replaceOnce(source,' maxLeverage:number;\n baseExposure:number|null;',' maxLeverage:number;\n contractMaxLeverage:number;\n baseExposure:number|null;',"tier contract max type");
 source=replaceOnce(source,'maxLeverage:maxLeverageFor(contract.maxLeverage,initialMarginRate),baseExposure','maxLeverage:maxLeverageFor(contract.maxLeverage,initialMarginRate),contractMaxLeverage:contract.maxLeverage,baseExposure',"derived tier contract max");
 source=replaceOnce(source,'maxLeverage:contract.maxLeverage,baseExposure:null','maxLeverage:contract.maxLeverage,contractMaxLeverage:contract.maxLeverage,baseExposure:null',"flat tier contract max");
 const reselectOld='const level=exposure<=(base as number)+tolerance(base as number)?1:Math.min(snapshot.levelLimit,Math.ceil((exposure-(base as number))/(increment as number))+1),maintenanceMarginRate=snapshot.maintenanceMarginRate-snapshot.maintenanceIncrement*(snapshot.level-1)+snapshot.maintenanceIncrement*(level-1),initialMarginRate=snapshot.initialMarginRate-snapshot.initialIncrement*(snapshot.level-1)+snapshot.initialIncrement*(level-1),contractMaximum=Math.max(snapshot.maxLeverage,Math.floor(1/Math.max(1e-12,snapshot.initialMarginRate-snapshot.initialIncrement*(snapshot.level-1))+1e-10));';
 const reselectNew='const level=exposure<=(base as number)+tolerance(base as number)?1:Math.min(snapshot.levelLimit,Math.ceil((exposure-(base as number))/(increment as number))+1),maintenanceMarginRate=snapshot.maintenanceMarginRate-snapshot.maintenanceIncrement*(snapshot.level-1)+snapshot.maintenanceIncrement*(level-1),initialMarginRate=snapshot.initialMarginRate-snapshot.initialIncrement*(snapshot.level-1)+snapshot.initialIncrement*(level-1);';
 source=replaceOnce(source,reselectOld,reselectNew,"tier reselection contract max reconstruction");
 source=replaceOnce(source,'maxLeverage:maxLeverageFor(contractMaximum,initialMarginRate)','maxLeverage:maxLeverageFor(snapshot.contractMaxLeverage,initialMarginRate)',"tier reselection stored contract max");
 source=replaceOnce(source,'maxLeverage:input.maxLeverage,baseExposure:null','maxLeverage:input.maxLeverage,contractMaxLeverage:input.maxLeverage,baseExposure:null',"legacy tier contract max");
 await writeFile(path,source);
}

{
 const path="app/lib/manual-paper-backup.ts";
 let source=await readFile(path,"utf8");
 source=replaceOnce(source,'maxLeverage:number(input.maxLeverage,field+".maxLeverage",1,1000),baseExposure:','maxLeverage:number(input.maxLeverage,field+".maxLeverage",1,1000),contractMaxLeverage:number(input.contractMaxLeverage,field+".contractMaxLeverage",1,1000),baseExposure:',"backup contract leverage cap");
 source=replaceOnce(source,'if(snapshot.level>snapshot.levelLimit)throw new Error(field+" level exceeds its schedule.");','if(snapshot.level>snapshot.levelLimit)throw new Error(field+" level exceeds its schedule.");if(snapshot.maxLeverage-snapshot.contractMaxLeverage>1e-10)throw new Error(field+" tier leverage exceeds the contract maximum.");',"backup contract leverage validation");
 await writeFile(path,source);
}

{
 const path="tests/manual-paper-risk-tiers.test.mjs";
 let source=await readFile(path,"utf8");
 source=replaceOnce(source,'assert.equal(tier2.maxExposure,10);assert.equal(tier2.capturedAt,123);','assert.equal(tier2.maxExposure,10);assert.equal(tier2.contractMaxLeverage,50);assert.equal(tier2.capturedAt,123);',"tier contract max assertion");
 const anchor='test("partial exposure reselects the original snapshotted schedule",()=>{const opened=selectMexcContractRiskTier(contract(),{contractVolume:10,notional:1000},777),reduced=reselectPaperRiskTier(opened,5);assert.equal(opened.level,2);assert.equal(reduced.level,1);assert.equal(reduced.maintenanceMarginRate,.01);assert.equal(reduced.capturedAt,777);assert.equal(reduced.source,opened.source)});\n';
 const addition=anchor+'\ntest("tier reselection never exceeds the original contract leverage cap",()=>{const opened=selectMexcContractRiskTier(contract({maxLeverage:25}),{contractVolume:6,notional:600},778),reduced=reselectPaperRiskTier(opened,5);assert.equal(opened.level,2);assert.equal(opened.maxLeverage,20);assert.equal(opened.contractMaxLeverage,25);assert.equal(reduced.level,1);assert.equal(reduced.maxLeverage,25);assert.equal(reduced.contractMaxLeverage,25)});\n';
 source=replaceOnce(source,anchor,addition,"tier reselection cap regression");
 source=replaceOnce(source,'copy=>copy.positions.BTC_USDT.riskTier.maxExposure=999,copy=>copy.positions.BTC_USDT.liquidationAudit.bankruptcyPrice=1','copy=>copy.positions.BTC_USDT.riskTier.maxExposure=999,copy=>copy.positions.BTC_USDT.riskTier.contractMaxLeverage=1,copy=>copy.positions.BTC_USDT.liquidationAudit.bankruptcyPrice=1',"tier contract max tamper regression");
 await writeFile(path,source);
}
