import {readFile,writeFile} from "node:fs/promises";

const path="app/lib/manual-paper-engine.ts";
let source=await readFile(path,"utf8");
const typeOld='collateralBasis:"assigned-margin"|"cross-collateral-snapshot";collateral:number;usableCollateral:number;entryFee:number;';
const typeNew='collateralBasis:"assigned-margin"|"cross-collateral-snapshot";positionQuantity:number;collateral:number;usableCollateral:number;entryFee:number;';
if(source.split(typeOld).length-1!==1)throw new Error("liquidation audit type basis anchor unavailable");
source=source.replace(typeOld,typeNew);
const returnOld='collateralBasis:input.marginMode==="isolated"?"assigned-margin":"cross-collateral-snapshot",collateral,usableCollateral,';
const returnNew='collateralBasis:input.marginMode==="isolated"?"assigned-margin":"cross-collateral-snapshot",positionQuantity:quantity,collateral,usableCollateral,';
if(source.split(returnOld).length-1!==1)throw new Error("liquidation audit return basis anchor unavailable");
source=source.replace(returnOld,returnNew);
await writeFile(path,source);
