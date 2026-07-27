import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { IPrimitivePaneRenderer,IPrimitivePaneView,ISeriesPrimitive,Logical,SeriesAttachedParameter,Time } from "lightweight-charts";
import type { Candle } from "../strategy.ts";
import { bubbleComposition,bubbleRadius } from "../order-flow/aggregator.ts";
import { percentile } from "../order-flow/normalisation.ts";
import { fractionalLogicalIndex } from "../order-flow/time-projection.ts";
import type { FlowRenderStore } from "../order-flow/render-store.ts";
import type { CandleTimeframe } from "../market/types.ts";

type Attached=SeriesAttachedParameter<Time,"Candlestick">;
function candleIndex(candles:readonly Candle[],timeMs:number){let low=0,high=candles.length-1,best=-1;const target=timeMs/1000;while(low<=high){const mid=(low+high)>>1;if(candles[mid].time<=target){best=mid;low=mid+1}else high=mid-1}return best;}
const rgba=(hex:string,alpha:number)=>{const value=parseInt(hex.slice(1),16);return `rgba(${value>>16},${value>>8&255},${value&255},${alpha})`};

class FlowRenderer implements IPrimitivePaneRenderer {
  constructor(private owner:DizyFlowPrimitive,private layer:"heatmap"|"bubbles"){}
  draw(target:CanvasRenderingTarget2D){target.useMediaCoordinateSpace(({context,mediaSize})=>this.owner.paint(context,mediaSize.width,mediaSize.height,this.layer));}
}
class FlowPaneView implements IPrimitivePaneView {
  private painter:FlowRenderer;constructor(owner:DizyFlowPrimitive,private layer:"heatmap"|"bubbles"){this.painter=new FlowRenderer(owner,layer)}
  zOrder(){return this.layer==="heatmap"?"bottom" as const:"normal" as const} renderer(){return this.painter}
}
export class DizyFlowPrimitive implements ISeriesPrimitive<Time> {
  private attachedApi:Attached|null=null;private unsubscribe:(()=>void)|null=null;private candles:readonly Candle[]=[];private timeframe:CandleTimeframe="15m";
  private views:readonly IPrimitivePaneView[]=[new FlowPaneView(this,"heatmap"),new FlowPaneView(this,"bubbles")];
  constructor(private store:FlowRenderStore){}
  attached(param:Attached){this.attachedApi=param;this.unsubscribe=this.store.subscribe(param.requestUpdate);}
  detached(){this.unsubscribe?.();this.unsubscribe=null;this.attachedApi=null;}
  paneViews(){return this.views;}
  setProjection(candles:readonly Candle[],timeframe:CandleTimeframe){this.candles=candles;this.timeframe=timeframe;this.attachedApi?.requestUpdate();}
  paint(context:CanvasRenderingContext2D,width:number,height:number,layer:"heatmap"|"bubbles"){
    // Executed trades are sequence-independent: a recovering depth book may
    // dim retained liquidity, but must never suppress captured bubbles.
    const api=this.attachedApi,s=this.store.getSnapshot(),settings=s.settings;if(!api||!s.enabled||!this.candles.length)return;
    const range=api.chart.timeScale().getVisibleLogicalRange();if(!range)return;const from=Math.max(0,Math.floor(range.from)-1),to=Math.min(this.candles.length-1,Math.ceil(range.to)+1),start=(this.candles[from]?.time??0)*1000,end=((this.candles[to]?.time??0)+86400)*1000;
    context.save();context.beginPath();context.rect(0,0,width,height);context.clip();
    if(layer==="heatmap"&&settings.heatmapVisible){const visible=s.heatmap.filter(cell=>cell.timeMs>=start&&cell.timeMs<=end&&cell.bidNotional+cell.askNotional>=settings.heatmap.minimumNotional),values=visible.flatMap(cell=>[cell.bidNotional,cell.askNotional]).filter(Boolean),clip=percentile(values,settings.heatmap.percentile)||1;for(const cell of visible){const index=candleIndex(this.candles,cell.timeMs);if(index<from||index>to)continue;const logical=fractionalLogicalIndex(cell.timeMs,this.candles[index].time,index,this.timeframe),x=api.chart.timeScale().logicalToCoordinate(logical as Logical),y=api.series.priceToCoordinate(cell.price),y2=api.series.priceToCoordinate(cell.price+Math.max(settings.heatmap.fixedPriceStep,cell.price*.000005));if(x==null||y==null)continue;const next=api.chart.timeScale().logicalToCoordinate((logical+settings.heatmap.timeBucketMs/1000/Math.max(1,(this.candles[Math.min(index+1,this.candles.length-1)].time-this.candles[index].time||60))) as Logical),w=Math.max(1,Math.abs(Number(next??x+1)-Number(x))),h=Math.max(1,Math.abs(Number(y2??y+1)-Number(y)));for(const [side,value,colour] of [["bids",cell.bidNotional,settings.heatmap.bidColour],["asks",cell.askNotional,settings.heatmap.askColour]] as const){if(!value||settings.heatmap.side!=="both"&&settings.heatmap.side!==side)continue;const normal=settings.heatmap.intensity==="log"?Math.log1p(Math.min(value,clip))/Math.log1p(clip):Math.min(value,clip)/clip,alpha=settings.heatmap.opacity*Math.pow(normal,settings.heatmap.gamma);context.fillStyle=rgba(colour,alpha);context.fillRect(Number(x)-w/2,Number(y)-h/2,w,h);}}}
    if(layer==="bubbles"&&settings.bubblesVisible){const totals=s.bubbles.map(v=>v.buyNotional+v.sellNotional),adaptive=settings.bubbles.adaptive&&totals.length>=settings.bubbles.minimumSamples?percentile(totals,settings.bubbles.percentile):0,threshold=Math.max(settings.bubbles.minimumNotional,adaptive);for(const bubble of s.bubbles){if(bubble.timeMs<start||bubble.timeMs>end)continue;const index=candleIndex(this.candles,bubble.timeMs);if(index<from||index>to)continue;const x=api.chart.timeScale().logicalToCoordinate(fractionalLogicalIndex(bubble.timeMs,this.candles[index].time,index,this.timeframe) as Logical),y=api.series.priceToCoordinate(bubble.price),composition=bubbleComposition(bubble),radius=bubbleRadius(composition.total,threshold,settings.bubbles.minimumRadius,settings.bubbles.maximumRadius);if(x==null||y==null||!radius)continue;const angle=-Math.PI/2+Math.PI*2*composition.buyRatio;context.globalAlpha=settings.bubbles.opacity;context.beginPath();context.moveTo(Number(x),Number(y));context.arc(Number(x),Number(y),radius,-Math.PI/2,angle);context.closePath();context.fillStyle=settings.bubbles.buyColour;context.fill();context.beginPath();context.moveTo(Number(x),Number(y));context.arc(Number(x),Number(y),radius,angle,Math.PI*1.5);context.closePath();context.fillStyle=settings.bubbles.sellColour;context.fill();context.globalAlpha=1;context.strokeStyle=settings.bubbles.outlineColour;context.lineWidth=1;context.beginPath();context.arc(Number(x),Number(y),radius,0,Math.PI*2);context.stroke();}}
    context.restore();
  }
}
