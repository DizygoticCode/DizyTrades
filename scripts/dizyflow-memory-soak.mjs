import {DepthCollector} from "../app/lib/order-flow/depth-collector.ts";

const durationMs=Number(process.env.DIZYFLOW_SOAK_MS)||15*60_000;
const collector=new DepthCollector("BTC_USDT",fetch,Date.now,undefined,{transport:"ws",maxLevels:100,maxHistory:150,historySampleMs:2_000});
const beginning=process.memoryUsage().rss;let peak=beginning,version=0,updates=0;
const batch=()=>{for(let i=0;i<10_000;i++){version++;collector.applyWsUpdate({symbol:"BTC_USDT",version,engineTimeMs:Date.now(),bids:[{price:100_000-(version%1_000),orderCount:1,contractQuantity:1}],asks:[{price:100_000+(version%1_000),orderCount:1,contractQuantity:1}]});updates++}peak=Math.max(peak,process.memoryUsage().rss)};
const timer=setInterval(batch,1_000);batch();
await new Promise(resolve=>setTimeout(resolve,durationMs));
clearInterval(timer);globalThis.gc?.();const ending=process.memoryUsage().rss;collector.stop();
console.log(JSON.stringify({durationMinutes:durationMs/60_000,updates,beginningRssMb:(beginning/1048576).toFixed(1),peakRssMb:(peak/1048576).toFixed(1),endingRssMb:(ending/1048576).toFixed(1)}));
