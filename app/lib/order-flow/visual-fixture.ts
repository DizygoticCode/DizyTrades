import type { Candle } from "../strategy.ts";
import type { LiquidityObservation,RawTrade } from "./types.ts";
/** Recorded-shape, sanitized BTC_USDT fixture: 10-cent source ticks over several 15m intervals. */
export function createDizyFlowVisualFixture(baseMs=Date.UTC(2026,0,1)):{candles:Candle[];liquidity:LiquidityObservation[];trades:RawTrade[]} {
 const interval=15*60_000,candles=Array.from({length:24},(_,i)=>{const open=64_000+Math.sin(i/2.7)*420+(i-12)*12,close=open+(i%2?95:-75);return{time:baseMs/1000+i*interval/1000,open,high:Math.max(open,close)+180,low:Math.min(open,close)-170,close,volume:800+i*17} as Candle});
 const liquidity:LiquidityObservation[]=[],push=(timestampMs:number,price:number,bidQuantity:number,askQuantity:number)=>liquidity.push({timestampMs,price,priceTick:Math.round(price/.1),capturedPriceStep:.1,bidQuantity,askQuantity});
 for(const [price,side,quantity] of [[63500,"bid",18],[63750,"bid",32],[64000,"bid",45],[64250,"ask",38],[64500,"ask",27],[64750,"ask",16]] as const){push(baseMs+interval,price,side==="bid"?quantity:0,side==="ask"?quantity:0);push(baseMs+7*interval,price,side==="bid"?quantity*1.8:0,side==="ask"?quantity*1.8:0);push(baseMs+15*interval,price,0,0)}
 push(baseMs+3*interval,64100,20,0);push(baseMs+10*interval,64100,34,0);push(baseMs+19*interval,64100,0,0);push(baseMs+12*interval,64350,0,29);push(baseMs+22*interval,64350,0,41);
 const tradeCandles=[2,4,6,8,10,12,14,16,18,20,22],trades:RawTrade[]=tradeCandles.flatMap((candle,i)=>Array.from({length:3},(_,j)=>{const price=63_700+(i%6)*170+j*.1,quantity=1.4+i*.15+j*.2;return{tradeId:`btc-${i}-${j}`,timestampMs:baseMs+candle*interval+(j+2)*20_000,price,quantity,notional:price*quantity,side:(i+j)%2?"sell" as const:"buy" as const}}));
 return{candles,liquidity,trades};
}
