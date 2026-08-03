import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {buildDizyBrainBeginnerOverview,DIZYBRAIN_DEFAULT_WIDTH,DIZYBRAIN_MIN_WIDTH} from "../app/lib/dizybrain-workspace.ts";

const snapshot={
  currentDirection:"BUY",marketBias:"Bullish",marketPhase:"Markup",activeConfluence:4,qualificationThreshold:3,qualified:false,confirmedSignal:null,
  explanation:{confidencePercent:80,rejectionReasons:["No direction-consistent signal exists on the current confirmed candle."]},
};

test("beginner overview separates market lean from actual setup readiness",()=>{
  const view=buildDizyBrainBeginnerOverview(snapshot,false);
  assert.equal(view.marketRead,"Bullish lean");
  assert.equal(view.actionState,"Watch");
  assert.equal(view.confidenceLabel,"Strong evidence");
  assert.equal(view.confidencePercent,80);
  assert.match(view.summary,/has not confirmed/);
  assert.deepEqual(view.reasons,["Bullish market bias","Markup structure phase","4 of 5 setup checks currently agree"]);
  const ready=buildDizyBrainBeginnerOverview({...snapshot,qualified:true,confirmedSignal:"BUY"},false);
  assert.equal(ready.actionState,"Setup ready");
  assert.match(ready.summary,/meets the current deterministic setup rules/);
});

test("Replay is clearly review evidence rather than a live setup",()=>{
  const view=buildDizyBrainBeginnerOverview(snapshot,true);
  assert.equal(view.marketRead,"Historical review");
  assert.equal(view.actionState,"Review mode");
  assert.equal(view.tone,"neutral");
  assert.match(view.summary,/not a live setup/);
});

test("DizyBrain defaults are larger and the source keeps intelligence behind detailed evidence",async()=>{
  assert.equal(DIZYBRAIN_MIN_WIDTH,340);
  assert.equal(DIZYBRAIN_DEFAULT_WIDTH,420);
  const [brain,css]=await Promise.all([readFile("app/dizybrain-shell.tsx","utf8"),readFile("app/globals.css","utf8")]);
  assert.match(brain,/Current market read/);
  assert.match(brain,/Why DizyBrain says that/);
  assert.match(brain,/What still matters/);
  assert.match(brain,/Advanced details/);
  assert.match(brain,/Detailed evidence/);
  assert.match(brain,/buildDizyBrainBeginnerOverview/);
  assert.match(css,/Beginner-first DizyBrain readability/);
  assert.match(css,/\.brain-overview-state strong\{[^}]*font-size:24px/);
  assert.match(css,/\.brain-row\{[^}]*font-size:11px/);
  assert.match(css,/\.brain-nav button\{[^}]*font-size:10px/);
});
