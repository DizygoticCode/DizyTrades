import {readFile,writeFile} from "node:fs/promises";

{
 const path="tests/manual-paper-risk-tier-source.test.mjs";
 let source=await readFile(path,"utf8");
 const line=source.split("\n").find(value=>value.includes("assert.match(roadmap,"));
 if(!line)throw new Error("roadmap assertion anchor unavailable");
 source=source.replace(line,line.replace('assert.match(roadmap,/- [x] maintenance tiers and bankruptcy-price audit/);','assert.ok(roadmap.includes("- [x] maintenance tiers and bankruptcy-price audit"));'));
 await writeFile(path,source);
}

{
 const path="tests/mexc-contract-metadata.test.mjs";
 let source=await readFile(path,"utf8");
 const line=source.split("\n").find(value=>value.includes("maintenanceMarginRate:contract"));
 if(!line)throw new Error("legacy maintenance source assertion unavailable");
 source=source.replace(line,'  assert.match(source, /maintenanceMarginRate:riskTierPreview\\?\\.maintenanceMarginRate\\?\\?contract\\?\\.maintenanceMarginRate\\?\\?/);');
 await writeFile(path,source);
}
