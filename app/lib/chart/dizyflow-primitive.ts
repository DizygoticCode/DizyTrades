import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { IPrimitivePaneRenderer,IPrimitivePaneView,ISeriesPrimitive,Logical,SeriesAttachedParameter,Time } from "lightweight-charts";
import type { Candle } from "../strategy.ts";
import { bubbleComposition,bubbleRadius } from "../order-flow/aggregator.ts";
import { percentile } from "../order-flow/normalisation.ts";
import { containingCandleIndex,fractionalLogicalIndex,candleCloseMs } from "../order-flow/time-projection.ts";
import type { FlowRenderStore } from "../order-flow/render-store.ts";
import type { CandleTimeframe } from "../market/types.ts";

type Attached=SeriesAttachedParameter<Time,"Candlestick">;
const rgba=(hex:string,alpha:number)=>{const value=parseInt(hex.slice(1),16);return `rgba(${value>>16},${value>>8&255},${value&255},${alpha})`};
const blendHex=(from:string,to:string,ratio:number)=>{const a=parseInt(from.slice(1),16),b=parseInt(to.slice(1),16),mix=(shift:number)=>Math.round(((a>>shift)&255)*(1-ratio)+((b>>shift)&255)*ratio);return `rgb(${mix(16)},${mix(8)},${mix(0)})`};

class FlowRenderer implements IPrimitivePaneRenderer {
  constructor(private owner:DizyFlowPrimitive,private layer:"heatmap"|"bubbles"){}
  draw(target:CanvasRenderingTarget2D){target.useMediaCoordinateSpace(({context,mediaSize})=>this.owner.paint(context,mediaSize.width,mediaSize.height,this.layer));}
}
class FlowPaneView implements IPrimitivePaneView {
  private painter:FlowRenderer;constructor(owner:DizyFlowPrimitive,private layer:"heatmap"|"bubbles"){this.painter=new FlowRenderer(owner,layer)}
  zOrder(){return this.layer==="heatmap"?"bottom" as const:"normal" as const} renderer(){return this.painter}
}
export class DizyFlowPrimitive implements ISeriesPrimitive<Time> {
  private attachedApi:Attached|null=null;private unsubscribe:(()=>void)|null=null;private candles:readonly Candle[]=[];private timeframe:CandleTimeframe="15m";private projectionGeneration=0;
  private views:readonly IPrimitivePaneView[]=[new FlowPaneView(this,"heatmap"),new FlowPaneView(this,"bubbles")];
  constructor(private store:FlowRenderStore){}
  attached(param:Attached){this.attachedApi=param;this.unsubscribe=this.store.subscribe(param.requestUpdate);}
  detached(){this.unsubscribe?.();this.unsubscribe=null;this.attachedApi=null;}
  paneViews(){return this.views;}
  setProjection(candles:readonly Candle[],timeframe:CandleTimeframe,generation:number,series:{count:number;finalTime:number|null;generation:number}){const finalTime=candles.at(-1)?.time??null;if(generation!==series.generation||candles.length!==series.count||finalTime!==series.finalTime||generation<this.projectionGeneration)return false;this.candles=candles;this.timeframe=timeframe;this.projectionGeneration=generation;this.attachedApi?.requestUpdate();return true;}
  paint(context:CanvasRenderingContext2D,width:number,height:number,layer:"heatmap"|"bubbles"){
    // Executed trades are sequence-independent: a recovering depth book may
    // dim retained liquidity, but must never suppress captured bubbles.
    const api=this.attachedApi,s=this.store.getSnapshot(),settings=s.settings;if(!api||!s.enabled||!this.candles.length)return;
    const range=api.chart.timeScale().getVisibleLogicalRange();if(!range)return;const from=Math.max(0,Math.floor(range.from)-1),to=Math.min(this.candles.length-1,Math.ceil(range.to)+1),start=(this.candles[from]?.time??0)*1000,end=candleCloseMs(this.candles[to]?.time??0,this.timeframe);
    context.save();context.beginPath();context.rect(0,0,width,height);context.clip();
    if(layer==="heatmap"&&settings.heatmapVisible){const visible=s.heatmap.filter(cell=>cell.timeMs>=start&&cell.timeMs<end&&cell.bidNotional+cell.askNotional>=settings.heatmap.minimumNotional),values=visible.flatMap(cell=>[cell.bidNotional,cell.askNotional]).filter(Boolean),clip=percentile(values,settings.heatmap.percentile)||1;for(const cell of visible){const index=containingCandleIndex(this.candles,cell.timeMs,this.timeframe);if(index<from||index>to)continue;const logical=fractionalLogicalIndex(cell.timeMs,this.candles[index].time,index,this.timeframe),x=api.chart.timeScale().logicalToCoordinate(logical as Logical),y=api.series.priceToCoordinate(cell.price),y2=api.series.priceToCoordinate(cell.price+Math.max(settings.heatmap.fixedPriceStep,cell.price*.000005));if(x==null||y==null)continue;const candleMs=candleCloseMs(this.candles[index].time,this.timeframe)-this.candles[index].time*1000,autoBucket=Math.max(1000,Math.round(candleMs/Math.max(10,width/(Number(range.to)-Number(range.from))))),bucket=settings.heatmap.timeBucketMs||autoBucket,next=api.chart.timeScale().logicalToCoordinate((logical+bucket/candleMs) as Logical),w=Math.max(2,Math.abs(Number(next??x+2)-Number(x))),h=Math.max(2,Math.abs(Number(y2??y+2)-Number(y)));for(const [side,value,colour] of [["bids",cell.bidNotional,settings.heatmap.bidColour],["asks",cell.askNotional,settings.heatmap.askColour]] as const){if(!value||settings.heatmap.side!=="both"&&settings.heatmap.side!==side)continue;const normal=settings.heatmap.intensity==="log"?Math.log1p(Math.min(value,clip))/Math.log1p(clip):Math.min(value,clip)/clip,alpha=settings.heatmap.opacity*Math.min(1,settings.heatmap.intensityMultiplier*Math.pow(normal,settings.heatmap.gamma));context.fillStyle=rgba(colour,alpha);context.fillRect(Number(x)-w/2,Number(y)-h/2,w,h);}}}
    if(layer==="bubbles"&&settings.bubblesVisible){const totals=s.bubbles.map(v=>v.buyNotional+v.sellNotional),adaptive=settings.bubbles.adaptive&&totals.length>=settings.bubbles.minimumSamples?percentile(totals,settings.bubbles.percentile):0,threshold=Math.max(settings.bubbles.minimumNotional,adaptive);for(const bubble of s.bubbles){if(bubble.timeMs<start||bubble.timeMs>=end)continue;const index=containingCandleIndex(this.candles,bubble.timeMs,this.timeframe);if(index<from||index>to)continue;const centre=api.chart.timeScale().logicalToCoordinate(index as Logical),fractional=api.chart.timeScale().logicalToCoordinate(fractionalLogicalIndex(bubble.timeMs,this.candles[index].time,index,this.timeframe) as Logical),adjacent=api.chart.timeScale().logicalToCoordinate((index+1) as Logical),spacing=centre!=null&&adjacent!=null?Math.abs(Number(adjacent)-Number(centre)):null,x=centre==null?null:fractional==null||spacing==null?centre:Number(centre)+Math.max(-spacing*.4,Math.min(spacing*.4,Number(fractional)-Number(centre))),y=api.series.priceToCoordinate(bubble.price),composition=bubbleComposition(bubble),radius=bubbleRadius(composition.total,threshold,settings.bubbles.minimumRadius,settings.bubbles.maximumRadius);if(x==null||y==null||!radius)continue;context.globalAlpha=settings.bubbles.opacity;context.fillStyle=blendHex(settings.bubbles.sellColour,settings.bubbles.buyColour,composition.buyRatio);context.beginPath();context.arc(Number(x),Number(y),radius,0,Math.PI*2);context.fill();context.globalAlpha=1;context.strokeStyle=settings.bubbles.outlineColour;context.lineWidth=1;context.stroke();}}
    context.restore();
  }
}
