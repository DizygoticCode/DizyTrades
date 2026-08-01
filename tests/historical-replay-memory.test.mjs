import assert from "node:assert/strict";
import test from "node:test";
import { captureHistoricalReplayMemory, MAX_REPLAY_MEMORY_CANDLES, replayMemoryId, validateHistoricalReplayMemory } from "../app/lib/historical-replay-memory.ts";
const interval=60;const candles=Array.from({length:150},(_,i)=>({time:Math.floor(1_700_000_000/interval)*interval+i*interval,open:100,high:102,low:99,close:101,volume:10}));
const base={tradeId:"trade-1",replaySessionId:"journal-replay|trade-1",marketKey:"mexc:spot:BTC_USDT",symbol:"BTCUSDT",timeframe:"1m",signalTimeMs:candles[109].time*1000,entryTimeMs:candles[110].time*1000,exitTimeMs:candles[120].time*1000,entryPrice:100,exitPrice:101,direction:"long",strategyVersion:null,capturedAtMs:(candles.at(-1).time+interval)*1000};
test("captures a bounded immutable closed-candle memory with honest availability",()=>{const input=[...candles,candles[110]].reverse();const memory=captureHistoricalReplayMemory({...base,candles:input});assert.equal(memory.candles.length,132);assert.equal(memory.integrity.deduplicated,true);assert.equal(memory.integrity.containsEntry,true);assert.equal(memory.integrity.containsExit,true);assert.equal(memory.brainContext,null);assert.equal(memory.flowAvailability,"capture-not-supported");assert.ok(memory.candles.length<=MAX_REPLAY_MEMORY_CANDLES);assert.deepEqual(validateHistoricalReplayMemory(memory).candles,memory.candles);});
test("excludes a forming candle and warns when optional post-exit context is short",()=>{const available=candles.slice(0,122);const memory=captureHistoricalReplayMemory({...base,candles:available,capturedAtMs:(available.at(-1).time*1000)+30_000});assert.equal(memory.candles.at(-1).time,available.at(-2).time);assert.match(memory.integrity.warnings[0],/post-exit/);});
test("rejects malformed, missing-entry and missing-exit captures",()=>{for(const patch of [{candles:[...candles,{...candles[0],time:NaN}]},{entryTimeMs:123},{exitTimeMs:123}])assert.throws(()=>captureHistoricalReplayMemory({...base,candles,...patch}));});
test("records gaps without fabricating candles",()=>{const withGap=candles.filter((_,i)=>i!==115);const memory=captureHistoricalReplayMemory({...base,candles:withGap});assert.equal(memory.integrity.gapCount,1);assert.equal(memory.candles.some(c=>c.time===candles[115].time),false);});
test("identity separates market, symbol and timeframe and is stable",()=>{const id=replayMemoryId(base);assert.equal(id,replayMemoryId(base));assert.notEqual(id,replayMemoryId({...base,marketKey:"mexc:futures:BTC_USDT"}));assert.notEqual(id,replayMemoryId({...base,symbol:"ETHUSDT"}));assert.notEqual(id,replayMemoryId({...base,timeframe:"5m"}));});

test("rejects fabricated prices, replay identity, misalignment, and future candles",()=>{
 assert.throws(()=>captureHistoricalReplayMemory({...base,candles,entryPrice:999}),/entry price/i);
 assert.throws(()=>captureHistoricalReplayMemory({...base,candles,replaySessionId:"wrong"}),/identities/i);
 assert.throws(()=>captureHistoricalReplayMemory({...base,candles:[...candles,{...candles[0],time:candles[0].time+1}]}),/misaligned/i);
 assert.throws(()=>captureHistoricalReplayMemory({...base,candles,capturedAtMs:candles.at(-1).time*1000-1}),/after capture/i);
});
test("rejects tampered intrinsic integrity and provenance metadata",()=>{const memory=captureHistoricalReplayMemory({...base,candles});const mutations=[
 m=>({...m,integrity:{...m.integrity,gapCount:9}}),m=>({...m,integrity:{...m.integrity,truncatedBefore:!m.integrity.truncatedBefore}}),
 m=>({...m,rangeEndMs:m.rangeEndMs+1}),m=>({...m,integrity:{...m.integrity,candleCount:1}}),
 m=>({...m,captureProvenance:{...m.captureProvenance,capturedAt:new Date(0).toISOString()}}),
 m=>({...m,entryTimeMs:m.entryTimeMs+60_000}),m=>({...m,integrity:{...m.integrity,contentHash:"0".repeat(64)}})];
 for(const mutate of mutations)assert.throws(()=>validateHistoricalReplayMemory(mutate(memory)));});
