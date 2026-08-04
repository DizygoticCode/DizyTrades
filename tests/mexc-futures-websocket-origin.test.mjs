import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  ACTIVE_MEXC_FUTURES_WS_URL,
  DEPTH_TRANSPORT,
  DOM_PUBLISH_MS,
  DepthCollector,
  MEXC_FUTURES_WS_URL,
  parseMexcFuturesWsUrl,
} from "../app/lib/order-flow/depth-collector.ts";
import {
  MEXC_REST_ORIGIN,
  MEXC_SPOT_WS_URL,
  parseMexcRestOrigin,
} from "../app/lib/market/mexc-shared.ts";

const futuresWs=["wss://","contract",".","mexc",".","com","/edge"].join("");
const wrongFuturesWs=["wss://","api",".","mexc",".","com","/edge"].join("");
const retiredRest=["https://","contract",".","mexc",".","com"].join("");
const textExtensions=new Set([".ts",".tsx",".js",".mjs",".json",".yaml",".yml",".md"]);

async function textFiles(root){
 const result=[];
 for(const entry of await readdir(root,{withFileTypes:true})){
  if([".git",".next","node_modules","playwright-report","test-results"].includes(entry.name))continue;
  const target=path.join(root,entry.name);
  if(entry.isDirectory())result.push(...await textFiles(target));
  else if(textExtensions.has(path.extname(entry.name))||entry.name===".env.example")result.push(target);
 }
 return result;
}

test("MEXC transport split keeps REST and WebSocket hosts distinct",()=>{
 assert.equal(MEXC_REST_ORIGIN,"https://api.mexc.com");
 assert.equal(parseMexcRestOrigin(undefined),MEXC_REST_ORIGIN);
 assert.equal(parseMexcRestOrigin("https://api.mexc.com/"),MEXC_REST_ORIGIN);
 assert.equal(parseMexcRestOrigin(retiredRest),MEXC_REST_ORIGIN);
 assert.equal(MEXC_FUTURES_WS_URL,futuresWs);
 assert.equal(ACTIVE_MEXC_FUTURES_WS_URL,futuresWs);
 assert.equal(parseMexcFuturesWsUrl(undefined),futuresWs);
 assert.equal(parseMexcFuturesWsUrl(`${futuresWs}/`),futuresWs);
 assert.equal(parseMexcFuturesWsUrl(wrongFuturesWs),futuresWs);
 assert.equal(parseMexcFuturesWsUrl("https://contract.mexc.com/edge"),futuresWs);
 assert.equal(parseMexcFuturesWsUrl("wss://example.com/edge"),futuresWs);
 assert.equal(MEXC_SPOT_WS_URL,"wss://wbs-api.mexc.com/ws");
});

test("Render-bounded depth defaults are websocket-first and coalesced",()=>{
 assert.equal(DEPTH_TRANSPORT,"ws");
 assert.equal(DOM_PUBLISH_MS,125);
});

test("WS transport opens the canonical futures endpoint",()=>{
 let opened=null,closed=false;
 const socket={
  readyState:0,
  addEventListener(){},
  send(){},
  close(){closed=true},
 };
 const collector=new DepthCollector(
  "BTC_USDT",
  async()=>new Response("{}",{status:503}),
  Date.now,
  url=>{opened=url;return socket},
  {transport:"ws"},
 );
 collector.start();
 assert.equal(opened,futuresWs);
 collector.stop();
 assert.equal(closed,true);
});

test("wrong MEXC transport origins are absent from repository runtime text",async()=>{
 const files=await textFiles(".");
 const offenders=[];
 for(const file of files){
  const source=await readFile(file,"utf8");
  if(source.includes(wrongFuturesWs)||source.includes(retiredRest))offenders.push(file);
 }
 assert.deepEqual(offenders,[]);
});
