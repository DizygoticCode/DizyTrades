import test from "node:test";
import assert from "node:assert/strict";
import { initialSimulationState, simulationFingerprint, simulationReducer } from "../app/lib/paper-simulation.ts";

const strategy={mode:"custom",pivotSpan:3,regressionLength:20,atrLength:14,trendLength:20,vwapAnchor:"session",confluenceThreshold:3,confirmedPatternsOnly:true};
const risk={riskPct:1,maxNotional:1000,leverage:1,atrStop:1,tp1:1,tp2:2};
const candles=Array.from({length:40},(_,index)=>({time:1000+index*900,open:100+index,high:102+index,low:99+index,close:101+index,volume:10+index}));
const fingerprint=(overrides={})=>simulationFingerprint({marketKey:"mexc:futures:BTC_USDT",timeframe:"15m",strategy,risk,candles,...overrides});
const result={initialEquity:1000,endingEquity:1010,returnPct:1,maxDrawdownPct:.2,trades:1,wins:1,winRatePct:100,profitFactor:null,closedTrades:[]};

test("initial paper simulation reaches ready",()=>{
  const started=simulationReducer(initialSimulationState,{type:"start",requestId:1,fingerprint:fingerprint()});
  assert.equal(started.status,"calculating");
  assert.equal(simulationReducer(started,{type:"success",requestId:1,fingerprint:fingerprint(),result}).status,"ready");
});

test("ticker, current live candle, countdown and harmless UI changes are absent from the fingerprint",()=>{
  const base=fingerprint();
  assert.equal(base,fingerprint({lastPrice:99999,liveCandle:{...candles.at(-1),close:99999},countdownSeconds:2,markets:[{}],favourites:["BTC"]}));
});

test("one confirmed candle causes one new fingerprint",()=>{
  assert.notEqual(fingerprint(),fingerprint({candles:[...candles,{time:99999,open:1,high:2,low:1,close:2,volume:3}]}));
});

test("strategy and risk settings each cause one new fingerprint",()=>{
  assert.notEqual(fingerprint(),fingerprint({strategy:{...strategy,confluenceThreshold:4}}));
  assert.notEqual(fingerprint(),fingerprint({risk:{...risk,riskPct:2}}));
});

test("market and timeframe changes wait for input then calculate under a new fingerprint",()=>{
  const waiting=simulationReducer({...initialSimulationState,result},{type:"awaiting-input"});
  assert.equal(waiting.status,"updating");
  assert.notEqual(fingerprint(),fingerprint({marketKey:"mexc:futures:ETH_USDT"}));
  assert.notEqual(fingerprint(),fingerprint({timeframe:"1h"}));
});

test("aborted and stale work cannot settle the newest request",()=>{
  const old=simulationReducer(initialSimulationState,{type:"start",requestId:1,fingerprint:"old"});
  const current=simulationReducer(old,{type:"start",requestId:2,fingerprint:"new"});
  assert.deepEqual(simulationReducer(current,{type:"failure",requestId:1,message:"aborted"}),current);
  assert.deepEqual(simulationReducer(current,{type:"success",requestId:1,fingerprint:"old",result}),current);
  assert.equal(simulationReducer(current,{type:"success",requestId:2,fingerprint:"new",result}).status,"ready");
});

test("errors settle, preserve results, and a retry starts updating",()=>{
  const ready={...initialSimulationState,status:"ready",result,requestId:1,fingerprint:"one"};
  const updating=simulationReducer(ready,{type:"start",requestId:2,fingerprint:"two"});
  assert.equal(updating.status,"updating");
  assert.equal(updating.result,result);
  const failed=simulationReducer(updating,{type:"failure",requestId:2,message:"network"});
  assert.equal(failed.status,"error"); assert.equal(failed.result,result);
  assert.equal(simulationReducer(failed,{type:"start",requestId:3,fingerprint:"two"}).status,"updating");
});

test("insufficient confirmed history is explicit",()=>{
  const started=simulationReducer(initialSimulationState,{type:"start",requestId:1,fingerprint:"short"});
  assert.equal(simulationReducer(started,{type:"insufficient",requestId:1}).status,"insufficient-history");
});
