import test from "node:test";import assert from "node:assert/strict";import {mkdtemp,appendFile,rm} from "node:fs/promises";import {tmpdir} from "node:os";import path from "node:path";import {LiquidityTape} from "../app/lib/order-flow/liquidity-tape.ts";
const snapshot=(bid=2,ask=3)=>({symbol:"BTC_USDT",version:1,engineTimeMs:Date.now(),bids:[{price:100,orderCount:1,contractQuantity:bid}],asks:[{price:101,orderCount:1,contractQuantity:ask}]});
test("liquidity tape records only changes and explicit zero removals",async()=>{const root=await mkdtemp(path.join(tmpdir(),"dizy-tape-")),tape=new LiquidityTape("BTC_USDT",root),now=Date.now();assert.equal(tape.capture(snapshot(),now).length,2);assert.equal(tape.capture(snapshot(),now+5000).length,0);const removed=tape.capture(snapshot(0,3),now+10000);assert.equal(removed.find(v=>v.priceTick*tape.getPriceStep()===100).bidContracts,0);await tape.close();await rm(root,{recursive:true,force:true})});
test("persistent archive restores recent genuine changes and tolerates a corrupt tail",async()=>{const root=await mkdtemp(path.join(tmpdir(),"dizy-archive-")),now=Date.now(),first=new LiquidityTape("BTC_USDT",root);first.capture(snapshot(),now);await first.close();const names=await (await import("node:fs/promises")).readdir(path.join(root,"BTC_USDT"));await appendFile(path.join(root,"BTC_USDT",names[0]),'{truncated');const restored=new LiquidityTape("BTC_USDT",root);await restored.initialize();assert.ok(restored.records().length>=2);assert.equal(restored.coverage().hasGaps,true);await restored.close();await rm(root,{recursive:true,force:true})});
test("six-hour high update input stays at the fixed memory ceiling",async()=>{const root=await mkdtemp(path.join(tmpdir(),"dizy-soak-")),tape=new LiquidityTape("BTC_USDT",root),start=Date.now()-6*60*60_000;for(let i=0;i<25_000;i++)tape.capture(snapshot(i%17+1,3),start+i*5000);assert.ok(tape.records().length<=20_000);assert.ok(tape.diagnostic().droppedPrunedRecordCount>0);await tape.close();await rm(root,{recursive:true,force:true})});
test("history pages continue with an opaque cursor and seed the left edge",async()=>{const root=await mkdtemp(path.join(tmpdir(),"dizy-pages-")),tape=new LiquidityTape("BTC_USDT",root),start=Date.now()-60_000;for(let i=0;i<12;i++)tape.capture(snapshot(i+1,3),start+i*5000);await tape.flush();const first=await tape.history(start+5000,start+60_000,null,3,100_000);assert.equal(first.changes.length,3);assert.ok(first.seed.length>0);assert.ok(first.nextCursor);const second=await tape.history(start+5000,start+60_000,first.nextCursor,3,100_000);assert.equal(second.seed.length,0);assert.equal(second.changes.length,3);assert.notDeepEqual(second.changes,first.changes);await tape.close();await rm(root,{recursive:true,force:true})});
test("history enforces its encoded byte budget",async()=>{const root=await mkdtemp(path.join(tmpdir(),"dizy-bytes-")),tape=new LiquidityTape("BTC_USDT",root),start=Date.now()-20_000;for(let i=0;i<5;i++)tape.capture(snapshot(i+1,3),start+i*5000);await tape.flush();const page=await tape.history(start,Date.now(),null,1000,100);assert.ok(page.changes.length<5);assert.ok(page.nextCursor);await tape.close();await rm(root,{recursive:true,force:true})});
test("disk backlog remains firmly bounded under accelerated input",async()=>{const root=await mkdtemp(path.join(tmpdir(),"dizy-backlog-")),tape=new LiquidityTape("BTC_USDT",root),start=Date.now()-6*60*60_000;for(let i=0;i<30_000;i++)tape.capture(snapshot(i%31+1,3),start+i*5000);assert.ok(tape.diagnostic().pendingWrites<=5000);await tape.close();await rm(root,{recursive:true,force:true})});
test("one-pass tiles bound a six-hour archive with more than 40,000 changes",async()=>{const root=await mkdtemp(path.join(tmpdir(),"dizy-tiles-")),dir=path.join(root,"BTC_USDT"),fs=await import("node:fs/promises"),start=Date.now()-6*60*60_000;await fs.mkdir(dir,{recursive:true});const file=path.join(dir,`${start}.ndjson`),lines=[JSON.stringify({kind:"checkpoint",symbol:"BTC_USDT",priceStep:.1,at:start,records:[{timestampMs:start,priceTick:649000,bidContracts:50,askContracts:0},{timestampMs:start,priceTick:641000,bidContracts:0,askContracts:60}]})];for(let batch=0;batch<500;batch++){const records=Array.from({length:100},(_,i)=>{const n=batch*100+i;return{timestampMs:start+Math.floor(n/50_000*6*60*60_000),priceTick:638000+n%200,bidContracts:n%9,askContracts:n%11}});lines.push(JSON.stringify({kind:"changes",symbol:"BTC_USDT",priceStep:.1,at:records.at(-1).timestampMs,records,gap:batch===250}))}await fs.writeFile(file,lines.join("\n")+"\n");const tape=new LiquidityTape("BTC_USDT",root);await tape.initialize();const before=process.memoryUsage().rss,result=await tape.tiles(start,start+6*60*60_000,63_000,65_000,95_000,18.2),rssGrowth=process.memoryUsage().rss-before;assert.ok(result.cells.length<=20_000);assert.ok(result.capturedToMs-result.capturedFromMs>5.9*60*60_000);assert.equal(result.hasGaps,true);assert.ok(result.cells.some(v=>v.toMs-v.fromMs>60_000),"persistent wall is run-length encoded");assert.ok(rssGrowth<300*1024*1024);await tape.close();await rm(root,{recursive:true,force:true})});

test("history tolerates a segment pruned after its manifest snapshot",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"dizy-prune-race-")),fs=await import("node:fs/promises"),dir=path.join(root,"BTC_USDT"),now=Date.now()-60_000;
  await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,`${now}.ndjson`),record={timestampMs:now,priceTick:1000,bidContracts:1,askContracts:0};
  await fs.writeFile(file,JSON.stringify({kind:"changes",symbol:"BTC_USDT",priceStep:.1,at:now,records:[record]})+"\n");
  const tape=new LiquidityTape("BTC_USDT",root);
  try{
    await tape.initialize();
    await fs.rm(file,{force:true});
    await assert.doesNotReject(()=>tape.history(now,Date.now(),null,100));
    assert.equal(tape.coverage().hasGaps,true);
  }finally{
    await tape.close();
    await rm(root,{recursive:true,force:true});
  }
});

test("global quota tolerates an archive entry that vanishes between list and stat",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"dizy-quota-race-")),fs=await import("node:fs/promises"),other=path.join(root,"ETH_USDT"),now=Date.now();
  await fs.mkdir(other,{recursive:true});
  await fs.symlink(path.join(other,"already-pruned"),path.join(other,`${now-120_000}.ndjson`));
  const tape=new LiquidityTape("BTC_USDT",root);
  try{
    tape.capture(snapshot(),now);
    await assert.doesNotReject(()=>tape.flush());
  }finally{
    await tape.close().catch(()=>{});
    await rm(root,{recursive:true,force:true});
  }
});

test("manifest refresh tolerates an archive entry that vanishes between list and stat",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"dizy-manifest-race-")),fs=await import("node:fs/promises"),dir=path.join(root,"BTC_USDT"),now=Date.now();
  await fs.mkdir(dir,{recursive:true});
  const tape=new LiquidityTape("BTC_USDT",root);
  try{
    await tape.initialize();
    await fs.symlink(path.join(dir,"already-pruned"),path.join(dir,`${now-120_000}.ndjson`));
    tape.capture(snapshot(),now);
    await assert.doesNotReject(()=>tape.flush());
  }finally{
    await tape.close().catch(()=>{});
    await rm(root,{recursive:true,force:true});
  }
});
