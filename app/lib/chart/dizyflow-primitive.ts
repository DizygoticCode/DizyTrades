import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { IPrimitivePaneRenderer,IPrimitivePaneView,ISeriesPrimitive,Logical,SeriesAttachedParameter,Time } from "lightweight-charts";
import type { Candle } from "../strategy.ts";
import { bubbleComposition,bubbleRadius,buildLiquiditySegments } from "../order-flow/aggregator.ts";
import { percentile } from "../order-flow/normalisation.ts";
import { containingCandleIndex,fractionalLogicalIndex,candleCloseMs } from "../order-flow/time-projection.ts";
import type { FlowRenderStore } from "../order-flow/render-store.ts";
import type { CandleTimeframe } from "../market/types.ts";

type Attached=SeriesAttachedParameter<Time,"Candlestick">;
const rgba=(hex:string,alpha:number)=>{const value=parseInt(hex.slice(1),16);return `rgba(${value>>16},${value>>8&255},${value&255},${alpha})`};
const blendHex=(from:string,to:string,ratio:number)=>{const a=parseInt(from.slice(1),16),b=parseInt(to.slice(1),16),mix=(shift:number)=>Math.round(((a>>shift)&255)*(1-ratio)+((b>>shift)&255)*ratio);return `rgb(${mix(16)},${mix(8)},${mix(0)})`};

class FlowRenderer implements IPrimitivePaneRenderer {
  constructor(private owner:DizyFlowPrimitive){}
  draw(target:CanvasRenderingTarget2D){target.useMediaCoordinateSpace(({context,mediaSize})=>this.owner.paint(context,mediaSize.width,mediaSize.height));}
}
class FlowPaneView implements IPrimitivePaneView {
  private painter:FlowRenderer;constructor(owner:DizyFlowPrimitive){this.painter=new FlowRenderer(owner)}
  zOrder(){return "bottom" as const} renderer(){return this.painter}
}
export class DizyFlowPrimitive implements ISeriesPrimitive<Time> {
  private attachedApi:Attached|null=null;private unsubscribe:(()=>void)|null=null;private candles:readonly Candle[]=[];private timeframe:CandleTimeframe="15m";private projectionGeneration=0;
  private views:readonly IPrimitivePaneView[]=[new FlowPaneView(this)];
  constructor(private store:FlowRenderStore){}
  attached(param:Attached){this.attachedApi=param;this.unsubscribe=this.store.subscribe(param.requestUpdate);}
  detached(){this.unsubscribe?.();this.unsubscribe=null;this.attachedApi=null;}
  paneViews(){return this.views;}
  setProjection(candles:readonly Candle[],timeframe:CandleTimeframe,generation:number,series:{count:number;finalTime:number|null;generation:number}){const finalTime=candles.at(-1)?.time??null;if(generation!==series.generation||candles.length!==series.count||finalTime!==series.finalTime||generation<this.projectionGeneration)return false;this.candles=candles;this.timeframe=timeframe;this.projectionGeneration=generation;this.attachedApi?.requestUpdate();return true;}
  paint(context:CanvasRenderingContext2D,width:number,height:number){
    const api=this.attachedApi,s=this.store.getSnapshot(),settings=s.settings;if(!api||!s.enabled||!this.candles.length)return;
    const range=api.chart.timeScale().getVisibleLogicalRange();if(!range)return;const from=Math.max(0,Math.floor(range.from)-1),to=Math.min(this.candles.length-1,Math.ceil(range.to)+1),start=(this.candles[from]?.time??0)*1000,end=candleCloseMs(this.candles[to]?.time??0,this.timeframe);
    const projectX=(timestampMs:number)=>{const index=containingCandleIndex(this.candles,timestampMs,this.timeframe);if(index<from||index>to)return null;const logical=fractionalLogicalIndex(timestampMs,this.candles[index].time,index,this.timeframe);return api.chart.timeScale().logicalToCoordinate(logical as Logical)};
    context.save();context.beginPath();context.rect(0,0,width,height);context.clip();
    if(settings.heatmapVisible){const cells=s.heatmap.filter(cell=>cell.timestampMs>=start-1_000&&cell.timestampMs<end&&cell.bidNotional+cell.askNotional>=settings.heatmap.minimumNotional),segments=buildLiquiditySegments(cells),values=segments.map(value=>value.quantity),clip=percentile(values,settings.heatmap.percentile)||1;for(const segment of segments){if(settings.heatmap.side!=="both"&&settings.heatmap.side!==(segment.side==="bid"?"bids":"asks"))continue;const x1=projectX(segment.startMs),x2=projectX(Math.min(segment.endMs,end-1));const y=api.series.priceToCoordinate(segment.price),y2=api.series.priceToCoordinate(segment.price+Math.max(settings.heatmap.fixedPriceStep,segment.price*.000005));if(x1==null||x2==null||y==null||y2==null)continue;const normal=settings.heatmap.intensity==="log"?Math.log1p(Math.min(segment.quantity,clip))/Math.log1p(clip):Math.min(segment.quantity,clip)/clip,alpha=settings.heatmap.opacity*Math.min(1,settings.heatmap.intensityMultiplier*Math.pow(normal,settings.heatmap.gamma)),left=Math.min(Number(x1),Number(x2)),right=Math.max(Number(x1),Number(x2));context.fillStyle=rgba(segment.side==="bid"?settings.heatmap.bidColour:settings.heatmap.askColour,alpha);context.fillRect(Math.floor(left),Math.min(Number(y),Number(y2)),Math.max(1,Math.ceil(right-left)),Math.max(2,Math.abs(Number(y2)-Number(y))));}}
    if(settings.bubblesVisible){const totals=s.bubbles.map(v=>v.buyNotional+v.sellNotional),adaptive=settings.bubbles.adaptive&&totals.length>=settings.bubbles.minimumSamples?percentile(totals,settings.bubbles.percentile):0,threshold=Math.max(settings.bubbles.minimumNotional,adaptive);for(const bubble of s.bubbles){if(bubble.timeMs<start||bubble.timeMs>=end)continue;const x=projectX(bubble.timeMs),y=api.series.priceToCoordinate(bubble.price),composition=bubbleComposition(bubble),radius=bubbleRadius(composition.total,threshold,settings.bubbles.minimumRadius,settings.bubbles.maximumRadius);if(x==null||y==null||!radius)continue;context.globalAlpha=settings.bubbles.opacity;context.fillStyle=blendHex(settings.bubbles.sellColour,settings.bubbles.buyColour,composition.buyRatio);context.beginPath();context.arc(Number(x),Number(y),radius,0,Math.PI*2);context.fill();context.globalAlpha=1;context.strokeStyle=settings.bubbles.outlineColour;context.lineWidth=1;context.stroke();}}
    context.restore();
  }
}
