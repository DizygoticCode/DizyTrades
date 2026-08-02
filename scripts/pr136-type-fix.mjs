import { readFile, writeFile } from "node:fs/promises";

const path = "app/lib/manual-paper.ts";
let source = await readFile(path, "utf8");
const before = 'const desired=requested??(pct===null?null:position.quantity*pct/100);if(desired===null||desired<=0||desired>position.quantity)fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero and no more than the open position.");if(desired>=position.quantity*(1-1e-12))return position.quantity;if(position.contractSize&&position.volUnit){const volume=quantizeMexcStep(desired/position.contractSize,position.volUnit,"floor");';
const after = 'const desiredValue=requested??(pct===null?null:position.quantity*pct/100);if(desiredValue===null)fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero and no more than the open position.");const desired=desiredValue as number;if(desired<=0||desired>position.quantity)fail("INVALID_CLOSE_SIZE","quantity","Close size must be greater than zero and no more than the open position.");if(desired>=position.quantity*(1-1e-12))return position.quantity;if(position.contractSize&&position.volUnit){const volume=quantizeMexcStep(desired/position.contractSize,position.volUnit,"floor");';
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`Expected one partial-close narrowing seam, found ${count}`);
source = source.replace(before, after);
await writeFile(path, source);
