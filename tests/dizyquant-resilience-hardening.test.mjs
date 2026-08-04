import assert from"node:assert/strict";
import test from"node:test";
import{calculateDizyQuantResilience,DIZYQUANT_RESILIENCE_WINDOW_MS}from"../app/lib/dizyquant/resilience.ts";

const FROM=2_000_000,SHOCK=FROM+20_000,TO=FROM+DIZYQUANT_RESILIENCE_WINDOW_MS;
const levels=[
 {priceTick:999,bidContracts:1_000,askContracts:0},
 {priceTick:998,bidContracts:1_000,askContracts:0},
 {priceTick:1001,bidContracts:0,askContracts:1_000},
 {priceTick:1002,bidContracts:0,askContracts:1_000},
];
const shock=[
 {priceTick:999,bidContracts:0,askContracts:0},
 {priceTick:998,bidContracts:200,askContracts:0},
 {priceTick:1001,bidContracts:0,askContracts:1_000},
 {priceTick:1002,bidContracts:0,askContracts:1_000},
];
const frames=[
 {timestampMs:FROM,midpoint:100,levels},
 {timestampMs:SHOCK,midpoint:100,levels:shock},
 {timestampMs:TO,midpoint:100,levels},
];
const input=overrides=>({frames,windowFromMs:FROM,windowToMs:TO,shockTimestampMs:SHOCK,priceStep:.1,contractSize:1,sequenceContinuous:true,hasGaps:false,sourceKind:"depth-stream",...overrides});

test("invalid window, shock endpoint and malformed runtime frames fail unavailable",()=>{
 const variants=[
  input({windowToMs:TO+1}),
  input({shockTimestampMs:FROM}),
  input({frames:null}),
  input({frames:[frames[0],frames[2]]}),
 ];
 for(const value of variants){
  const state=calculateDizyQuantResilience(value);
  assert.equal(state.valid,false);
  assert.equal(Object.keys(state.values).length,0);
 }
});

test("duplicate, crossed and wrong-side price ticks fail unavailable",()=>{
 const duplicate={...frames[0],levels:[...levels,levels[0]]};
 const crossed={...frames[0],levels:[{priceTick:1001,bidContracts:1,askContracts:0},...levels.slice(1)]};
 const dual={...frames[0],levels:[{priceTick:999,bidContracts:1,askContracts:1},...levels.slice(1)]};
 for(const opening of[duplicate,crossed,dual]){
  const state=calculateDizyQuantResilience(input({frames:[opening,frames[1],frames[2]]}));
  assert.equal(state.valid,false);
 }
});

test("unsafe timestamps, numeric overflow and non-shock frames fail closed",()=>{
 const unsafe={...frames[1],timestampMs:Number.MAX_SAFE_INTEGER+1};
 const overflow=calculateDizyQuantResilience(input({contractSize:Number.MAX_VALUE}));
 const noShock={...frames[1],levels};
 for(const state of[
  calculateDizyQuantResilience(input({frames:[frames[0],unsafe,frames[2]]})),
  overflow,
  calculateDizyQuantResilience(input({frames:[frames[0],noShock,frames[2]]})),
 ]){
  assert.equal(state.valid,false);
  assert.ok(state.limitations.length);
 }
});
