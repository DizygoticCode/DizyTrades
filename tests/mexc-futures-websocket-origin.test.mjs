import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  DepthCollector,
  MEXC_FUTURES_WS_URL,
  parseMexcFuturesWsUrl,
} from "../app/lib/order-flow/depth-collector.ts";

const current="wss://api.mexc.com/edge";
const retiredWsOrigin=["wss://","contract",".","mexc",".","com"].join("");
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

test("MEXC futures websocket origin is current and safely configurable",()=>{
 assert.equal(MEXC_FUTURES_WS_URL,current);
 assert.equal(parseMexcFuturesWsUrl(undefined),current);
 assert.equal(parseMexcFuturesWsUrl("wss://api.mexc.com/edge/"),current);
 assert.equal(parseMexcFuturesWsUrl(`${retiredWsOrigin}/edge`),current);
 assert.equal(parseMexcFuturesWsUrl("https://api.mexc.com/edge"),current);
 assert.equal(parseMexcFuturesWsUrl("wss://example.com/edge"),current);
 assert.equal(parseMexcFuturesWsUrl("wss://api.mexc.com/ws"),current);
});

test("WS transport opens the configured futures endpoint",()=>{
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
 assert.equal(opened,current);
 collector.stop();
 assert.equal(closed,true);
});

test("retired MEXC futures websocket origin is absent from repository text",async()=>{
 const files=await textFiles(".");
 const offenders=[];
 for(const file of files){
  const source=await readFile(file,"utf8");
  if(source.includes(retiredWsOrigin))offenders.push(file);
 }
 assert.deepEqual(offenders,[]);
});
