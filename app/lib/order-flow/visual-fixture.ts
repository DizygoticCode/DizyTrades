import type { Candle } from "../strategy.ts";
import type { LiquidityObservation,RawTrade } from "./types.ts";
/** Deterministic browser fixture. Import only from development/test tooling. */
export function createDizyFlowVisualFixture(baseMs=Date.UTC(2026,0,1)):{candles:Candle[];liquidity:LiquidityObservation[];trades:RawTrade[]}{
 const candles=Array.from({length:24},(_,i)=>{const wave=Math.sin(i/3)*2,open=100+wave,close=open+(i%2?.8:-.6);return{time:baseMs/1000+i*60,open,high:Math.max(open,close)+1,low:Math.min(open,close)-1,close,volume:100+i} as Candle});
 const liquidity:LiquidityObservation[]=[];for(const [priceTick,side] of [[980,"bid"],[990,"bid"],[1020,"ask"],[1030,"ask"]] as const){liquidity.push({timestampMs:baseMs+60_000,priceTick,bidQuantity:side==="bid"?12:0,askQuantity:side==="ask"?12:0},{timestampMs:baseMs+8*60_000,priceTick,bidQuantity:side==="bid"?30:0,askQuantity:side==="ask"?30:0},{timestampMs:baseMs+19*60_000,priceTick,bidQuantity:0,askQuantity:0})}
 liquidity.push({timestampMs:baseMs+2*60_000,priceTick:1010,bidQuantity:10,askQuantity:0},{timestampMs:baseMs+11*60_000,priceTick:1010,bidQuantity:28,askQuantity:0},{timestampMs:baseMs+18*60_000,priceTick:1010,bidQuantity:0,askQuantity:0});
 const currentTime=baseMs+24.5*60_000;liquidity.push({timestampMs:currentTime,priceTick:1010,bidQuantity:24,askQuantity:0});
 const trades:RawTrade[]=[...Array.from({length:5},(_,i)=>({tradeId:`merge-${i}`,timestampMs:baseMs+(10*60+i*4)*1000,price:100+i*.03,quantity:1+i,notional:(1+i)*(100+i*.03),side:(i%2?"sell":"buy") as "buy"|"sell"})),{tradeId:"buy",timestampMs:baseMs+4.5*60_000,price:99,quantity:8,notional:792,side:"buy"},{tradeId:"sell",timestampMs:baseMs+16.5*60_000,price:102,quantity:7,notional:714,side:"sell"},{tradeId:"current",timestampMs:currentTime,price:101,quantity:10,notional:1010,side:"buy"}];return{candles,liquidity,trades};
}
