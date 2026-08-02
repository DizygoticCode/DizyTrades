import test from "node:test";
import assert from "node:assert/strict";
import { buildScannerRow, normaliseWatchlist, scannerUniverse, sortScannerRows } from "../app/lib/market-scanner.ts";

const market=(key,volume=0,marketType="futures")=>({key,exchange:"mexc",marketType,contractType:marketType==="spot"?"spot":"perpetual",sourceSymbol:key.split(":").at(-1),symbol:key.split(":").at(-1),displayName:key.split(":").at(-1).replace("_"," / "),contractDisplayName:key,baseAsset:"BTC",quoteAsset:"USDT",settlementAsset:"USDT",base:"BTC",quote:"USDT",fullName:key,status:"active",state:"enabled",pricePrecision:2,volume24h:volume});
const candles=Array.from({length:50},(_,index)=>({time:1000+index,open:100+index,high:102+index,low:99+index,close:101+index,volume:1000}));
const analysis=(signalTime=1049)=>({atr:[],vwap:[],trend:[],channelBasis:[],channelTop:[],channelBottom:[],activeChannel:null,upperTrendline:[],lowerTrendline:[],levels:[],fibs:[],triangles:[],tradeSignals:[{id:"s",time:signalTime,price:150,direction:"buy",status:"confirmed",label:"BUY",confluence:3,confluenceTotal:5,components:{supportResistance:true,triangle:false,channel:true,fibonacci:false,structure:true},primaryTrigger:"support-resistance"}],patternStages:[],completedPatterns:[],scoreLong:4,scoreShort:1,bias:"Bullish",phase:"Markup",lastSignal:"BUY",diagnostics:{barsLoaded:50,barsAfterWarmup:20,rawLongCandidates:1,rawShortCandidates:0,blockedByConfluence:0,blockedByVwap:0,blockedByTrend:0,ambiguousTies:0,confirmedBuys:1,confirmedSells:0,warmupBars:30}});

test("scanner universe prioritises valid favourites and stays bounded",()=>{
 const markets=[market("mexc:futures:BTC_USDT",100),market("mexc:futures:ETH_USDT",300),market("mexc:futures:SOL_USDT",200)];
 assert.deepEqual(scannerUniverse(markets,["mexc:futures:BTC_USDT"],2).map(item=>item.key),["mexc:futures:BTC_USDT","mexc:futures:ETH_USDT"]);
 assert.deepEqual(scannerUniverse(markets,[],2).map(item=>item.key),["mexc:futures:ETH_USDT","mexc:futures:SOL_USDT"]);
});

test("watchlist normalisation removes missing keys and duplicates",()=>{
 const markets=[market("mexc:futures:BTC_USDT")];
 assert.deepEqual(normaliseWatchlist(["missing","mexc:futures:BTC_USDT","mexc:futures:BTC_USDT"],markets),["mexc:futures:BTC_USDT"]);
});

test("scanner row reports fresh confirmed signal evidence",()=>{
 const row=buildScannerRow(market("mexc:futures:BTC_USDT"),candles,analysis(),"15m");
 assert.equal(row.latestSignal,"buy");
 assert.equal(row.signalAgeBars,0);
 assert.equal(row.latestSignalConfluence,3);
 assert.equal(row.setupScore,4);
 assert.equal(row.setupDirection,"long");
});

test("old signals are not presented as current",()=>{
 const row=buildScannerRow(market("mexc:futures:BTC_USDT"),candles,analysis(1001),"15m");
 assert.equal(row.latestSignal,null);
 assert.equal(row.signalAgeBars,null);
 assert.equal(row.latestSignalConfluence,null);
});

test("scanner rows sort deterministically by setup then market",()=>{
 const first={...buildScannerRow(market("mexc:futures:BTC_USDT"),candles,analysis(),"15m"),setupScore:3,displayName:"BTC / USDT"};
 const second={...first,marketKey:"mexc:futures:ETH_USDT",displayName:"ETH / USDT",setupScore:5};
 assert.deepEqual(sortScannerRows([first,second],"setup",true).map(row=>row.displayName),["ETH / USDT","BTC / USDT"]);
});
