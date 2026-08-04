import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
import test from"node:test";
import{buildDizyQuantResearchPresentation,DIZYQUANT_PRESENTATION_VERSION}from"../app/lib/dizyquant/presentation.ts";

test("bounded presentation exposes registry status without live values or signal eligibility",()=>{
 const value=buildDizyQuantResearchPresentation();
 assert.equal(value.presentationVersion,DIZYQUANT_PRESENTATION_VERSION);
 assert.equal(value.surface,"bounded-read-only");
 assert.equal(value.totalMetricCount,67);
 assert.equal(value.informationalCount,65);
 assert.equal(value.experimentalCount,2);
 assert.equal(value.validatedCount,0);
 assert.equal(value.rejectedCount,0);
 assert.equal(value.signalEligibleCount,0);
 assert.equal(value.decisionEligible,false);
 assert.equal(value.signalInfluence,"forbidden");
 assert.equal(value.liveValuesLoaded,false);
 assert.equal(value.rawBookStreamExposed,false);
 assert.equal(value.slices.length,6);
 assert.ok(value.slices.every(slice=>slice.status==="complete"));
 assert.ok(value.metrics.every(metric=>metric.signalEligible===false));
 assert.ok(Object.isFrozen(value));
 assert.ok(Object.isFrozen(value.metrics));
 assert.ok(Object.isFrozen(value.slices));
});

test("research page consumes only the bounded presentation model",async()=>{
 const source=await readFile("app/research/page.tsx","utf8");
 assert.match(source,/buildDizyQuantResearchPresentation/);
 assert.doesNotMatch(source,/order-flow|depth-collector|DizySignals|RawTrade|live-order/i);
});
