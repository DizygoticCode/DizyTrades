import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
import test from"node:test";

const read=path=>readFile(path,"utf8");

test("README reports the completed DizyQuant foundation without claiming validation",async()=>{
 const source=await read("README.md");
 assert.match(source,/DizyQuant Research/);
 assert.match(source,/67 stable metric identities/);
 assert.match(source,/65 informational, two experimental, zero validated and zero signal-eligible/);
 assert.match(source,/six-slice implementation programme is complete/i);
 assert.match(source,/representative evidence studies/i);
 assert.doesNotMatch(source,/DizyQuant microstructure research with Replay\/statistical validation\n/);
});

test("roadmap distinguishes completed implementation from ongoing evidence studies",async()=>{
 const source=await read("ROADMAP.md");
 assert.match(source,/DizyQuant research foundation — complete/);
 assert.match(source,/- \[x\] deterministic Replay\/statistical laboratory and bounded public presentation/);
 assert.match(source,/Ongoing DizyQuant evidence campaigns/);
 assert.match(source,/Read-only MEXC Account Companion and shadow reconciliation/);
 assert.match(source,/Liquidity heatmap presentation and DizyFlow evidence quality/);
 assert.doesNotMatch(source,/### Candidate microstructure research\n\n- \[ \]/);
});

test("vision and architecture preserve the research-to-signal firewall",async()=>{
 const[vision,architecture]=await Promise.all([read("VISION.md"),read("ARCHITECTURE.md")]);
 assert.match(vision,/67 stable metric identities/);
 assert.match(vision,/none are validated or signal-eligible/);
 assert.doesNotMatch(vision,/DizyQuant.*future measurable microstructure research/);
 assert.match(architecture,/bounded read-only DizyQuant research registry/);
 assert.match(architecture,/65 informational and two experimental/);
 assert.match(architecture,/promotionEligible: false/);
 assert.match(architecture,/public `\/research` route/);
});

test("research contract records all six completed slices and current registry status",async()=>{
 const source=await read("docs/DIZYQUANT_RESEARCH_CONTRACT.md");
 assert.match(source,/original six-slice implementation programme is complete/i);
 assert.match(source,/dizyquant-candidates\/1\.4\.0/);
 assert.match(source,/67 stable metric identities/);
 assert.match(source,/65 `informational` metrics/);
 assert.match(source,/two `experimental` metrics/);
 assert.match(source,/zero `validated` metrics/);
 assert.match(source,/Replay and statistical laboratory/);
 assert.match(source,/Bounded public presentation/);
 assert.doesNotMatch(source,/## Planned focused slices/);
});

test("homepage and navigation expose only the bounded DizyQuant research surface",async()=>{
 const[marketing,header]=await Promise.all([read("app/marketing/marketing-page.tsx"),read("app/marketing/site-header.tsx")]);
 assert.match(marketing,/\["DizyQuant", "Research"/);
 assert.match(marketing,/\["research", "VERSIONED MICROSTRUCTURE RESEARCH"/);
 assert.match(marketing,/if \(id === "research"\) return "\/research"/);
 assert.match(marketing,/67 versioned metric identities/);
 assert.match(marketing,/cannot influence production signals/i);
 assert.match(header,/href="\/research"[^>]*>DizyQuant/);
 for(const source of[marketing,header]){
  const imports=source.split("\n").filter(line=>/^\s*import\b/.test(line)).join("\n");
  assert.doesNotMatch(imports,/dizyquant|order-flow|depth-collector|RawTrade|live-order/i);
 }
});
