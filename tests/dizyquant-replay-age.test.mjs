import assert from"node:assert/strict";
import test from"node:test";
import{buildDizyQuantResearchSnapshot,canonicalDizyQuantReplayJson,toDizyQuantReplaySnapshot}from"../app/lib/dizyquant/research.ts";

const input=evaluatedAtMs=>({
 symbol:"BTC_USDT",
 sourceTimeMs:1_000_000,
 evaluatedAtMs,
 maxAgeMs:2_000,
 evidenceGrade:"snapshot-grade",
 sequenceContinuous:null,
 hasGaps:false,
 sourceKinds:["depth-snapshot"],
 coverage:{fromMs:999_000,toMs:1_000_000},
 values:{"spread-bps":1.25},
 limitations:["Public displayed depth only."],
});

test("Replay identity is unchanged when the same evidence later becomes stale",()=>{
 const fresh=buildDizyQuantResearchSnapshot(input(1_000_500));
 const stale=buildDizyQuantResearchSnapshot(input(1_010_000));
 assert.equal(fresh.availability,"fresh");
 assert.equal(stale.availability,"stale");
 assert.equal(toDizyQuantReplaySnapshot(fresh).availability,"fresh");
 assert.equal(toDizyQuantReplaySnapshot(stale).availability,"fresh");
 assert.equal(canonicalDizyQuantReplayJson(fresh),canonicalDizyQuantReplayJson(stale));
});
