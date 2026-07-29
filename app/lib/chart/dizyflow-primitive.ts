import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { IPrimitivePaneRenderer,IPrimitivePaneView,ISeriesPrimitive,Logical,SeriesAttachedParameter,Time } from "lightweight-charts";
import type { Candle } from "../strategy.ts";
import { aggregateTrades,bubbleComposition,bubbleRadius,bubbleThreshold } from "../order-flow/aggregator.ts";
import { percentile } from "../order-flow/normalisation.ts";
import { candleCloseMs,timestampToLogicalPosition } from "../order-flow/time-projection.ts";
import type { FlowRenderStore } from "../order-flow/render-store.ts";
import type { CandleTimeframe } from "../market/types.ts";

type Attached=SeriesAttachedParameter<Time,"Candlestick">;
const rgba=(hex:string,alpha:number)=>{const value=parseInt(hex.slice(1),16);return `rgba(${value>>16},${value>>8&255},${value&255},${alpha})`};
const blendHex=(from:string,to:string,ratio:number)=>{const a=parseInt(from.slice(1),16),b=parseInt(to.slice(1),16),mix=(shift:number)=>Math.round(((a>>shift)&255)*(1-ratio)+((b>>shift)&255)*ratio);return `rgb(${mix(16)},${mix(8)},${mix(0)})`};
class FlowRenderer implements IPrimitivePaneRenderer {constructor(private owner:DizyFlowPrimitive){}draw(target:CanvasRenderingTarget2D){target.useMediaCoordinateSpace(({context,mediaSize})=>this.owner.paint(context,mediaSize.width,mediaSize.height));}}
class FlowPaneView implements IPrimitivePaneView {private painter:FlowRenderer;constructor(owner:DizyFlowPrimitive){this.painter=new FlowRenderer(owner)}zOrder(){return "bottom" as const}renderer(){return this.painter}}

/** One stable bottom-pane primitive. All retained input remains in time/price coordinates. */
export class DizyFlowPrimitive implements ISeriesPrimitive<Time> {
 private attachedApi:Attached|null=null;private unsubscribe:(()=>void)|null=null;private candles:readonly Candle[]=[];private timeframe:CandleTimeframe="15m";private projectionGeneration=0;private views:readonly IPrimitivePaneView[]=[new FlowPaneView(this)];
 constructor(private store:FlowRenderStore){}
 attached(param:Attached){this.attachedApi=param;this.unsubscribe=this.store.subscribe(param.requestUpdate)}
 detached(){this.unsubscribe?.();this.unsubscribe=null;this.attachedApi=null}
 paneViews(){return this.views}
 setProjection(candles:readonly Candle[],timeframe:CandleTimeframe,generation:number,series:{count:number;finalTime:number|null;generation:number}){const finalTime=candles.at(-1)?.time??null;if(generation!==series.generation||candles.length!==series.count||finalTime!==series.finalTime||generation<this.projectionGeneration)return false;this.candles=candles;this.timeframe=timeframe;this.projectionGeneration=generation;this.attachedApi?.requestUpdate();return true}
 paint(context:CanvasRenderingContext2D,width:number,height:number){
  const api=this.attachedApi,s=this.store.getSnapshot(),settings=s.settings;if(!api||!s.enabled||!this.candles.length)return;const range=api.chart.timeScale().getVisibleLogicalRange();if(!range)return;
  const from=Math.max(0,Math.floor(range.from)-1),to=Math.min(this.candles.length-1,Math.ceil(range.to)+1),start=(this.candles[from]?.time??0)*1000,atLiveEdge=range.to>=this.candles.length-.5,end=atLiveEdge?Date.now():candleCloseMs(this.candles[to]?.time??0,this.timeframe);
  const projectX=(timestampMs:number)=>{const logical=timestampToLogicalPosition(this.candles,timestampMs,this.timeframe);if(logical===null||logical<range.from-1||logical>range.to+1)return null;const coordinate=api.chart.timeScale().logicalToCoordinate(logical as Logical);return coordinate!==null&&Number(coordinate)>0&&Number(coordinate)<width?coordinate:null};
  context.save();context.beginPath();context.rect(0,0,width,height);context.clip();
  if(settings.heatmapVisible&&typeof document!=="undefined"){
   const step=settings.heatmap.priceMode==="fixed"?settings.heatmap.fixedPriceStep:s.priceStep,byTick=new Map<number,Array<(typeof s.heatmap)[number]>>();for(const item of s.heatmap){const list=byTick.get(item.priceTick)??[];list.push(item);byTick.set(item.priceTick,list)}const quantities=s.heatmap.flatMap(v=>[v.bidQuantity,v.askQuantity]).filter(v=>v>0),clip=percentile(quantities,settings.heatmap.percentile)||1,raster=document.createElement("canvas");raster.width=Math.max(1,Math.ceil(width));raster.height=Math.max(1,Math.ceil(height));const r=raster.getContext("2d");
   if(r)for(const [tick,items] of byTick){items.sort((a,b)=>a.timestampMs-b.timestampMs);for(let i=0;i<items.length;i++){const item=items[i],until=items[i+1]?.timestampMs??end;if(until<=start||item.timestampMs>=end)continue;const x1=projectX(Math.max(start,item.timestampMs)),x2=projectX(Math.min(end-1,until));const price=tick*step,y=api.series.priceToCoordinate(price),y2=api.series.priceToCoordinate(price+step);if(x1==null||x2==null||y==null||y2==null)continue;for(const side of ["bid","ask"] as const){if(settings.heatmap.side!=="both"&&settings.heatmap.side!==(side==="bid"?"bids":"asks"))continue;const quantity=side==="bid"?item.bidQuantity:item.askQuantity;if(quantity<=0||quantity*price<settings.heatmap.minimumNotional)continue;const normal=settings.heatmap.intensity==="log"?Math.log1p(Math.min(quantity,clip))/Math.log1p(clip):Math.min(quantity,clip)/clip,alpha=settings.heatmap.opacity*Math.min(1,settings.heatmap.intensityMultiplier*Math.pow(normal,settings.heatmap.gamma));r.fillStyle=rgba(side==="bid"?settings.heatmap.bidColour:settings.heatmap.askColour,alpha);r.fillRect(Math.floor(Math.min(Number(x1),Number(x2))),Math.floor(Math.min(Number(y),Number(y2)))-1,Math.max(1,Math.ceil(Math.abs(Number(x2)-Number(x1)))),Math.max(2,Math.ceil(Math.abs(Number(y2)-Number(y)))+2))}}}context.drawImage(raster,0,0);
  }
  if(settings.bubblesVisible){const visible=s.trades.filter(v=>v.timestampMs>=start&&v.timestampMs<end),groups=aggregateTrades(visible,projectX,p=>api.series.priceToCoordinate(p) as number|null),totals=groups.map(v=>v.buyNotional+v.sellNotional),threshold=bubbleThreshold(totals,settings.bubbles);for(const bubble of groups){const x=projectX(bubble.timeMs),y=api.series.priceToCoordinate(bubble.price),composition=bubbleComposition(bubble),radius=bubbleRadius(composition.total,threshold,settings.bubbles.minimumRadius,settings.bubbles.maximumRadius);if(x==null||y==null||!radius)continue;context.globalAlpha=settings.bubbles.opacity;context.fillStyle=blendHex(settings.bubbles.sellColour,settings.bubbles.buyColour,composition.buyRatio);context.beginPath();context.arc(Number(x),Number(y),radius,0,Math.PI*2);context.fill();context.globalAlpha=1;context.strokeStyle=settings.bubbles.outlineColour;context.stroke()}}
  context.restore();
 }
}
