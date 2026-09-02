import assert from"node:assert/strict";
import{readdir,readFile}from"node:fs/promises";
import path from"node:path";
import test from"node:test";
import{
 DIZYQUANT_METRIC_DEFINITIONS,
 DIZYQUANT_METRIC_SET_VERSION,
 DIZYQUANT_RESEARCH_SCHEMA_VERSION,
 buildDizyQuantResearchSnapshot,
 canonicalDizyQuantReplayJson,
 classifyDizyQuantAvailability,
 toDizyQuantReplaySnapshot,
}from"../app/lib/dizyquant/research.ts";

const base=(overrides={})=>({
 symbol:"BTC_USDT",
 sourceTimeMs:1_000_000,
 evaluatedAtMs:1_000_500,
 maxAgeMs:2_000,
 evidenceGrade:"snapshot-grade",
 sequenceContinuous:null,
 hasGaps:false,
 sourceKinds:["depth-snapshot"],
 coverage:{fromMs:999_000,toMs:1_000_000},
 values:{"spread-bps":1.25,"depth-imbalance-25bps":12.5},
 limitations:["Public displayed depth only."],
 ...overrides,
});

test("candidate metric registry is versioned, unique and signal-ineligible",()=>{
 assert.equal(DIZYQUANT_RESEARCH_SCHEMA_VERSION,1);
 assert.equal(DIZYQUANT_METRIC_SET_VERSION,"dizyquant-candidates/1.4.0");
 assert.equal(new Set(DIZYQUANT_METRIC_DEFINITIONS.map(value=>value.id)).size,DIZYQUANT_METRIC_DEFINITIONS.length);
 assert.equal(DIZYQUANT_METRIC_DEFINITIONS.length,67);
 assert.deepEqual(DIZYQUANT_METRIC_DEFINITIONS.filter(value=>value.evidenceGrade==="snapshot-grade").map(value=>value.id).slice(0,3),["spread-price","spread-ticks","spread-bps"]);
 assert.ok(DIZYQUANT_METRIC_DEFINITIONS.some(value=>value.id==="flow-efficiency-bps-per-million-10s"&&value.unit==="basis-points-per-million-quote"));
 assert.ok(DIZYQUANT_METRIC_DEFINITIONS.some(value=>value.id==="near-depth-concentration-shift-25-of-100bps-30s"&&value.unit==="percentage-points"));
 assert.ok(DIZYQUANT_METRIC_DEFINITIONS.some(value=>value.id==="post-shock-continuation-flag"&&value.unit==="flag"));
 const experimental=DIZYQUANT_METRIC_DEFINITIONS.filter(value=>value.promotionStatus==="experimental").map(value=>value.id).sort();
 assert.deepEqual(experimental,["absorption-candidate-flag","exhaustion-candidate-flag"]);
 for(const definition of DIZYQUANT_METRIC_DEFINITIONS){
  assert.equal(definition.version,1);
  assert.equal(definition.signalEligible,false);
  assert.ok(["informational","experimental"].includes(definition.promotionStatus));
  assert.ok(Object.isFrozen(definition));
 }
 assert.ok(Object.isFrozen(DIZYQUANT_METRIC_DEFINITIONS));
});

test("snapshot-grade evidence can be fresh without sequence claims",()=>{
 const snapshot=buildDizyQuantResearchSnapshot(base());
 assert.equal(snapshot.availability,"fresh");
 assert.equal(snapshot.evidenceGrade,"snapshot-grade");
 assert.equal(snapshot.sequenceContinuous,null);
 assert.equal(snapshot.availableMetricCount,2);
 assert.equal(snapshot.decisionEligible,false);
 assert.equal(snapshot.signalInfluence,"forbidden");
 assert.ok(Object.isFrozen(snapshot));
 assert.ok(Object.isFrozen(snapshot.metrics));
 assert.ok(Object.isFrozen(snapshot.metrics[0]));
 assert.throws(()=>{snapshot.metrics[0].value=999},TypeError);
});

test("continuous evidence requires a proven uninterrupted sequence",()=>{
 const unknown=buildDizyQuantResearchSnapshot(base({evidenceGrade:"continuous-stream-grade",sequenceContinuous:null,sourceKinds:["depth-stream"],values:{"liquidity-added-30s":100}}));
 const broken=buildDizyQuantResearchSnapshot(base({evidenceGrade:"continuous-stream-grade",sequenceContinuous:false,sourceKinds:["depth-stream"],values:{"liquidity-added-30s":100}}));
 const complete=buildDizyQuantResearchSnapshot(base({evidenceGrade:"continuous-stream-grade",sequenceContinuous:true,sourceKinds:["depth-stream"],values:{"liquidity-added-30s":100}}));
 assert.equal(unknown.availability,"gapped");
 assert.equal(broken.availability,"gapped");
 assert.equal(complete.availability,"fresh");
});

test("stale, explicit-gap and unavailable states never become decision eligible",()=>{
 const stale=buildDizyQuantResearchSnapshot(base({evaluatedAtMs:1_010_000}));
 const gapped=buildDizyQuantResearchSnapshot(base({hasGaps:true}));
 const unavailable=buildDizyQuantResearchSnapshot(base({values:{}}));
 assert.deepEqual([stale.availability,gapped.availability,unavailable.availability],["stale","gapped","unavailable"]);
 for(const snapshot of[stale,gapped,unavailable]){
  assert.equal(snapshot.decisionEligible,false);
  assert.equal(snapshot.signalInfluence,"forbidden");
 }
});

test("Replay serialisation excludes evaluation-clock noise and is deterministic",()=>{
 const first=buildDizyQuantResearchSnapshot(base({evaluatedAtMs:1_000_500,maxAgeMs:2_000}));
 const second=buildDizyQuantResearchSnapshot(base({evaluatedAtMs:1_001_000,maxAgeMs:4_000}));
 assert.equal(canonicalDizyQuantReplayJson(first),canonicalDizyQuantReplayJson(second));
 const replay=toDizyQuantReplaySnapshot(first);
 assert.equal("evaluatedAtMs"in replay,false);
 assert.equal("ageMs"in replay,false);
 assert.equal("maxAgeMs"in replay,false);
 assert.equal(replay.signalInfluence,"forbidden");
 assert.ok(Object.isFrozen(replay));
});

test("research input rejects unsafe identity, time, coverage, sources and values",()=>{
 assert.throws(()=>buildDizyQuantResearchSnapshot(base({symbol:"../BTC"})),/symbol/);
 assert.throws(()=>buildDizyQuantResearchSnapshot(base({sourceTimeMs:1_010_000})),/time boundary/);
 assert.throws(()=>buildDizyQuantResearchSnapshot(base({sourceKinds:[]})),/sources/);
 assert.throws(()=>buildDizyQuantResearchSnapshot(base({sourceKinds:["depth-snapshot","depth-snapshot"]})),/sources/);
 assert.throws(()=>buildDizyQuantResearchSnapshot(base({coverage:{fromMs:null,toMs:1_000_000}})),/coverage/);
 assert.throws(()=>buildDizyQuantResearchSnapshot(base({values:{"spread-bps":Number.NaN}})),/value/);
 assert.throws(()=>buildDizyQuantResearchSnapshot(base({values:{"not-a-metric":1}})),/Unknown/);
 assert.throws(()=>buildDizyQuantResearchSnapshot(base({limitations:["\u0000unsafe"]})),/limitation/);
});

test("availability helper applies unavailable, gap and age precedence",()=>{
 assert.equal(classifyDizyQuantAvailability(base({values:{}})),"unavailable");
 assert.equal(classifyDizyQuantAvailability(base({hasGaps:true})),"gapped");
 assert.equal(classifyDizyQuantAvailability(base({evidenceGrade:"continuous-stream-grade",sequenceContinuous:null})),"gapped");
 assert.equal(classifyDizyQuantAvailability(base({evaluatedAtMs:1_010_000})),"stale");
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

function assertNoExecutionCoupling(source,{allowSameOriginFetchCredentials=false}={}){
 const guardedSource=allowSameOriginFetchCredentials
  ? source.replace(/\bcredentials\s*:\s*"same-origin"\s*,?/g,"")
  : source;
 assert.doesNotMatch(guardedSource,/\b(?:placeOrder|submitOrder)\s*\(/i);
 assert.doesNotMatch(guardedSource,/\b(?:const|let|var|function|class|type|interface)\s+(?:apiKey|secret|credentials?|orderInstruction)\b/i);
 assert.doesNotMatch(guardedSource,/\.\s*(?:apiKey|secret|credentials?|orderInstruction)\b/);
 assert.doesNotMatch(guardedSource,/\b(?:apiKey|secret|credentials?|orderInstruction)\s*:/i);
}

test("DizyQuant has only bounded approved consumers and no DizySignals influence",async()=>{
 const researchPage=path.join("app","research","page.tsx"),aboutPage=path.join("app","about","page.tsx"),businessPlanPage=path.join("app","business-plan","page.tsx"),investorPage=path.join("app","investors","page.tsx"),marketingPage=path.join("app","marketing","marketing-page.tsx"),siteHeader=path.join("app","marketing","site-header.tsx"),productNavigationModel=path.join("app","lib","product-navigation.ts"),homePage=path.join("app","page.tsx"),statusRoute=path.join("app","api","dizyquant","evidence","status","route.ts"),streamRoute=path.join("app","api","dizyquant","evidence","stream","route.ts"),exportRoute=path.join("app","api","dizyquant","evidence","export","route.ts"),livePublisher=path.join("app","dizyquant-snapshot-publisher.tsx"),livePanel=path.join("app","research","dizyquant-live-panel.tsx"),campaignStatus=path.join("app","research","dizyquant-campaign-status.tsx"),tradingTerminal=path.join("app","trading-terminal.tsx");
 const allowed=new Set([researchPage,aboutPage,businessPlanPage,investorPage,marketingPage,siteHeader,productNavigationModel,homePage,statusRoute,streamRoute,exportRoute,livePublisher,livePanel,campaignStatus,tradingTerminal]),offenders=[];
 for(const file of await files("app")){
  if(file.startsWith(path.join("app","lib","dizyquant")))continue;
  const source=await readFile(file,"utf8");
  if(/dizyquant/i.test(source)&&!allowed.has(file))offenders.push(file);
 }
 assert.deepEqual(offenders,[]);
 const page=await readFile(researchPage,"utf8");
 assert.match(page,/buildDizyQuantResearchPresentation/);
 assert.match(page,/DizyQuantCampaignStatus/);
 assert.doesNotMatch(page,/DizySignals|order-flow|depth-collector|RawTrade|live-order/i);
 for(const file of[aboutPage,businessPlanPage,investorPage,marketingPage,siteHeader,productNavigationModel,homePage]){
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
 const exportSource=await readFile(exportRoute,"utf8");
 assert.match(exportSource,/export async function GET/);
 assert.match(exportSource,/user\.role !== "owner"/);
 assert.match(exportSource,/buildDizyQuantCampaignStudyExport/);
 assert.doesNotMatch(exportSource,/DizySignals|runDizyQuantReplayLab|closeDizyQuantCampaign|placeOrder|submitOrder|live-order|paper-simulation|mexc-private/i);
 assertNoExecutionCoupling(exportSource);
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
 const campaign=await readFile(campaignStatus,"utf8"),campaignImports=campaign.split("\n").filter(line=>/^\s*import\b/.test(line)).join("\n");
 assert.match(campaign,/fetch\("\/api\/dizyquant\/evidence\/status"/);
 assert.match(campaign,/credentials: "same-origin"/);
 assert.match(campaign,/Collecting live/);
 assert.match(campaign,/Next sample boundary in/);
 assert.doesNotMatch(campaignImports,/backtest|paper-simulation|live-order|use-order-flow|mexc/i);
 assert.doesNotMatch(campaign,/DizySignals|runDizyQuantReplayLab|closeDizyQuantCampaign|placeOrder|submitOrder|live-order|paper-simulation|mexc-private/i);
 assertNoExecutionCoupling(campaign,{allowSameOriginFetchCredentials:true});
 const terminal=await readFile(tradingTerminal,"utf8"),terminalDizyQuantLines=terminal.split("\n").filter(line=>/DizyQuant/.test(line));
 assert.equal(terminalDizyQuantLines.length,2);
 assert.match(terminal,/import \{ DizyQuantSnapshotPublisher \} from "\.\/dizyquant-snapshot-publisher";/);
 assert.match(terminal,/<DizyQuantSnapshotPublisher data=\{\{ snapshot: dizyBrainSnapshot,/);
});