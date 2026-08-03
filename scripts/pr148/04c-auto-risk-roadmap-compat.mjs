import {readFile,writeFile} from "node:fs/promises";

const path="tests/manual-paper-depth-auto-risk-route.test.mjs";
let source=await readFile(path,"utf8");
const old='assert.match(roadmap,/Current slice: maintenance tiers and bankruptcy-price audit/)';
const next='assert.match(roadmap,/Next slice: clearer isolated versus cross-margin assumptions/)';
if(source.split(old).length-1!==1)throw new Error("automatic-risk roadmap assertion anchor unavailable");
source=source.replace(old,next);
await writeFile(path,source);
