import {readFile,writeFile} from "node:fs/promises";

const path="app/lib/manual-paper.ts";
let source=await readFile(path,"utf8");
const old='return {...precision,entryDepthFill:position.entryDepthFill,riskTier:position.riskTier,bankruptcyPrice:position.bankruptcyPrice,liquidationAudit:position.liquidationAudit}';
const next='return {...precision,entryDepthFill:position.entryDepthFill,estimatedLiquidation:position.estimatedLiquidation,riskTier:position.riskTier,bankruptcyPrice:position.bankruptcyPrice,liquidationAudit:position.liquidationAudit}';
if(source.split(old).length-1!==1)throw new Error("close-fill liquidation trigger anchor unavailable");
source=source.replace(old,next);
await writeFile(path,source);
