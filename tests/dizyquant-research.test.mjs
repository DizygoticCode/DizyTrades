import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
 DIZYQUANT_RESEARCH_MODEL_VERSION,
 DIZYQUANT_STALE_AFTER_MS,
 buildDizyQuantResearchPresentation,
 classifyDizyQuantAvailability,
 normalizeDizyQuantResearchInput,
 serializeDizyQuantResearchInput,
} from "../app/lib/dizyquant/index.ts";

const sample={
 schemaVersion:1,
 modelVersion:DIZYQUANT_RESEARCH_MODEL_VERSION,
 symbol:"BTC_USDT",
 timeframe:"15m",
 source:"mexc-public",
 observedAtMs:1_700_000_000_000,
 capturedAtMs:1_700_000_000_250,
 coverage:{fromMs:1_699_999_100_000,toMs:1_700_000_000_000,complete:true,hasGaps:false},
 metrics:[{id:"spread-price",version:1,value:1.25,status:"observed"}],
};

test("bounded presentation exposes registry status without live values or signal eligibility",()=>{
 const out=buildDizyQuantResearchPresentation(sample,sample.capturedAtMs);
 assert.equal(out.schemaVersion,1);
 assert.equal(out.modelVersion,DIZYQUANT_RESEARCH_MODEL_VERSION);
 assert.equal(out.availability,"AVAILABLE");
 assert.equal(out.metrics.length>0,true);
 assert.equal(out.metrics.some(metric=>metric.id==="spread-price"),true);
 assert.equal("value" in out.metrics[0],false);
 assert.equal("eligible" in out.metrics[0],false);
});

test("research page consumes only the bounded presentation model",async()=>{
 const source=await readFile("app/research/page.tsx","utf8");
 assert.match(source,/buildDizyQuantResearchPresentation/);
 assert.doesNotMatch(source,/DizySignals|order-flow|depth-collector|RawTrade|live-order/i);
});

test("Replay identity is unchanged when the same evidence later becomes stale",()=>{
 const first=normalizeDizyQuantResearchInput(sample,sample.capturedAtMs);
 const later=normalizeDizyQuantResearchInput(sample,sample.capturedAtMs+DIZYQUANT_STALE_AFTER_MS+1);
 assert.deepEqual(serializeDizyQuantResearchInput(first),serializeDizyQuantResearchInput(later));
 assert.equal(first.availability,"AVAILABLE");
 assert.equal(later.availability,"STALE");
});

test("stale, explicit-gap and unavailable states never become decision eligible",()=>{
 const stale=normalizeDizyQuantResearchInput(sample,sample.capturedAtMs+DIZYQUANT_STALE_AFTER_MS+1);
 assert.equal(stale.availability,"STALE");
 const gap=normalizeDizyQuantResearchInput({...sample,coverage:{...sample.coverage,hasGaps:true}},sample.capturedAtMs);
 assert.equal(gap.availability,"GAP");
 const unavailable=normalizeDizyQuantResearchInput(null,sample.capturedAtMs);
 assert.equal(unavailable.availability,"UNAVAILABLE");
 for(const value of[stale,gap,unavailable])assert.equal("decisionEligible" in value,false);
});

test("Replay serialisation excludes evaluation-clock noise and is deterministic",()=>{
 const one=normalizeDizyQuantResearchInput(sample,sample.capturedAtMs);
 const two=normalizeDizyQuantResearchInput({...sample,metrics:[...sample.metrics]},sample.capturedAtMs);
 assert.equal(serializeDizyQuantResearchInput(one),serializeDizyQuantResearchInput(two));
 assert.doesNotMatch(serializeDizyQuantResearchInput(one),/availability|ageMs|evaluatedAt/i);
});

test("research input rejects unsafe identity, time, coverage, sources and values",()=>{
 assert.equal(normalizeDizyQuantResearchInput({...sample,symbol:"BTC_USDT<script>"},sample.capturedAtMs).availability,"UNAVAILABLE");
 assert.equal(normalizeDizyQuantResearchInput({...sample,capturedAtMs:Number.NaN},sample.capturedAtMs).availability,"UNAVAILABLE");
 assert.equal(normalizeDizyQuantResearchInput({...sample,coverage:{...sample.coverage,fromMs:sample.coverage.toMs+1}},sample.capturedAtMs).availability,"UNAVAILABLE");
 assert.equal(normalizeDizyQuantResearchInput({...sample,source:"private-account"},sample.capturedAtMs).availability,"UNAVAILABLE");
 assert.equal(normalizeDizyQuantResearchInput({...sample,metrics:[{...sample.metrics[0],value:Number.POSITIVE_INFINITY}]},sample.capturedAtMs).availability,"UNAVAILABLE");
});

test("availability helper applies unavailable, gap and age precedence",()=>{
 assert.equal(classifyDizyQuantAvailability(null,0),"UNAVAILABLE");
 assert.equal(classifyDizyQuantAvailability({...sample,coverage:{...sample.coverage,hasGaps:true}},sample.capturedAtMs),"GAP");
 assert.equal(classifyDizyQuantAvailability(sample,sample.capturedAtMs+DIZYQUANT_STALE_AFTER_MS+1),"STALE");
 assert.equal(classifyDizyQuantAvailability(sample,sample.capturedAtMs),"AVAILABLE");
});

async function files(root){
 const out=[];
 for(const entry of await readdir(root,{withFileTypes:true})){
  const target=path.join(root,entry.name);
  if(entry.isDirectory())out.push(...await files(target));
  else if(/\.(?:ts|tsx|js|mjs)$/.test(entry.name))out.push(target);
 }
 return out;
}

function assertNoExecutionCoupling(source){
 assert.doesNotMatch(source,/\b(?:placeOrder|submitOrder)\s*\(/i);
 assert.doesNotMatch(source,/\b(?:const|let|var|function|class|type|interface)\s+(?:apiKey|secret|credentials?|orderInstruction)\b/i);
 assert.doesNotMatch(source,/\.\s*(?:apiKey|secret|credentials?|orderInstruction)\b/);
 assert.doesNotMatch(source,/\b(?:apiKey|secret|credentials?|orderInstruction)\s*:/i);
}

test("DizyQuant has only bounded presentation consumers and no DizySignals influence",async()=>{
 const researchPage=path.join("app","research","page.tsx"),marketingPage=path.join("app","marketing","marketing-page.tsx"),siteHeader=path.join("app","marketing","site-header.tsx"),productNavigationModel=path.join("app","lib","product-navigation.ts"),homePage=path.join("app","page.tsx"),statusRoute=path.join("app","api","dizyquant","evidence","status","route.ts"),streamRoute=path.join("app","api","dizyquant","evidence","stream","route.ts"),livePublisher=path.join("app","dizyquant-snapshot-publisher.tsx"),livePanel=path.join("app","research","dizyquant-live-panel.tsx"),tradingTerminal=path.join("app","trading-terminal.tsx");
 const allowed=new Set([researchPage,marketingPage,siteHeader,productNavigationModel,homePage,statusRoute,streamRoute,livePublisher,livePanel,tradingTerminal]),offenders=[];
 for(const file of await files("app")){
  if(file.startsWith(path.join("app","lib","dizyquant")))continue;
  const source=await readFile(file,"utf8");
  if(/dizyquant/i.test(source)&&!allowed.has(file))offenders.push(file);
 }
 assert.deepEqual(offenders,[]);
 const page=await readFile(researchPage,"utf8");
 assert.match(page,/buildDizyQuantResearchPresentation/);
 assert.doesNotMatch(page,/DizySignals|order-flow|depth-collector|RawTrade|live-order/i);
 for(const file of[marketingPage,siteHeader,productNavigationModel,homePage]){
  const source=await readFile(file,"utf8"),imports=source.split("\n").filter(line=>/^\s*import\b/.test(line)).join("\n");
  assert.match(source,/DizyQuant/);
  assert.doesNotMatch(imports,/order-flow|depth-collector|RawTrade|live-order/i);
  assertNoExecutionCoupling(source);
 }
 for(const file of[statusRoute,streamRoute]){
  const source=await readFile(file,"utf8");
  assert.match(source,/export async function GET/);
  assert.doesNotMatch(source,/DizySignals|placeOrder|submitOrder|live-order|paper-simulation|mexc-private/i);
  assertNoExecutionCoupling(source);
 }
 const publisher=await readFile(livePublisher,"utf8"),publisherImports=publisher.split("\n").filter(line=>/^\s*import\b/.test(line)).join("\n");
 assert.match(publisher,/createDizyQuantLiveSnapshot/);
 assert.match(publisher,/writeDizyQuantLiveSnapshot/);
 assert.doesNotMatch(publisherImports,/backtest|paper-simulation|live-order|use-order-flow|mexc/i);
 assertNoExecutionCoupling(publisher);
 const panel=await readFile(livePanel,"utf8"),panelImports=panel.split("\n").filter(line=>/^\s*import\b/.test(line)).join("\n");
 assert.match(panel,/readDizyQuantLiveSnapshot/);
 assert.doesNotMatch(panelImports,/backtest|paper-simulation|live-order|use-order-flow|mexc/i);
 assertNoExecutionCoupling(panel);
 assert.match(panel,/never stores raw candles, DOM rows, account data, credentials or order instructions/i);
 const terminal=await readFile(tradingTerminal,"utf8"),terminalDizyQuantLines=terminal.split("\n").filter(line=>/DizyQuant/.test(line));
 assert.equal(terminalDizyQuantLines.length,2);
 assert.match(terminal,/import \{ DizyQuantSnapshotPublisher \} from "\.\/dizyquant-snapshot-publisher";/);
 assert.match(terminal,/<DizyQuantSnapshotPublisher data=\{\{ snapshot: dizyBrainSnapshot,/);
});
