import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { IPrimitivePaneRenderer,IPrimitivePaneView,ISeriesPrimitive,SeriesAttachedParameter,Time } from "lightweight-charts";
import { hexToRgba } from "./appearance.ts";
import { channelFillPolygon,type LineExtension,type LinePoint,type LineSegment,type Rect } from "./chart-layout.ts";
import { logicalToCanvasX,projectWorldLine,type WorldLine } from "./world-projection.ts";
import {calculateStrategyWorldLinesPlots,layoutStrategyWorldLineLabels} from "./strategy-world-lines-layout.ts";

export type StrategyWorldLineStyle=Readonly<{colour:string;width:number;style:"solid"|"dashed"|"dotted";halo:boolean;haloColour:string;label:boolean;labelText:string;labelTextColour:string}>;
export type StrategyWorldLineEntry=Readonly<{line:WorldLine;extension:LineExtension;style:StrategyWorldLineStyle;lanePriority:number;group:"lr-upper"|"lr-basis"|"lr-lower"|"trend"}>;
export type StrategyWorldLinesModel=Readonly<{lines:readonly StrategyWorldLineEntry[];channelFill:Readonly<{visible:boolean;colour:string;opacity:number}>;fontSize:number;labelPadding:number;compactLabels:boolean;latestLogicalIndex:number;volumeProfile:boolean;profileWidthPct:number;profileMaxWidth:number;profileInset:number;supportResistance:boolean;srLabelPlacement:"right-before-profile"|"left-edge"|"near-latest"|"hidden";labelOffset:number}>;
export type StrategyWorldLineLabel=Readonly<{id:string;x:number;y:number;width:number;height:number}>;
export type StrategyWorldLinesPaint=Readonly<{ids:readonly string[];segments:Readonly<Record<string,LineSegment>>;labels?:readonly StrategyWorldLineLabel[];safeIndicatorPlot?:Rect;profile?:Rect;rightLabels?:Rect;latestX?:number|null}>;

const dashFor=(style:StrategyWorldLineStyle["style"])=>style==="dashed"?[8,5]:style==="dotted"?[2,4]:[];
class Renderer implements IPrimitivePaneRenderer{constructor(private owner:StrategyWorldLinesPrimitive){}draw(target:CanvasRenderingTarget2D){target.useMediaCoordinateSpace(({context,mediaSize})=>this.owner.paint(context,mediaSize.width,mediaSize.height))}}
class PaneView implements IPrimitivePaneView{private rendererInstance:Renderer;constructor(owner:StrategyWorldLinesPrimitive){this.rendererInstance=new Renderer(owner)}zOrder(){return "top" as const}renderer(){return this.rendererInstance}}

/** Stable series primitive retaining strategy geometry exclusively in logical-index/price space. */
export class StrategyWorldLinesPrimitive implements ISeriesPrimitive<Time>{
 private attachedApi:SeriesAttachedParameter<Time,"Candlestick">|null=null;
 private model:StrategyWorldLinesModel={lines:[],channelFill:{visible:false,colour:"#000000",opacity:0},fontSize:12,labelPadding:6,compactLabels:false,latestLogicalIndex:-1,volumeProfile:false,profileWidthPct:20,profileMaxWidth:240,profileInset:6,supportResistance:false,srLabelPlacement:"hidden",labelOffset:12};
 private views:readonly IPrimitivePaneView[]=[new PaneView(this)];
 constructor(private onPaint?:(paint:StrategyWorldLinesPaint)=>void){}
 attached(param:SeriesAttachedParameter<Time,"Candlestick">){this.attachedApi=param;param.requestUpdate()}
 detached(){this.attachedApi=null}
 paneViews(){return this.views}
 setModel(model:StrategyWorldLinesModel){this.model=model;this.attachedApi?.requestUpdate()}
 getModel(){return this.model}
 paint(context:CanvasRenderingContext2D,width:number,height:number){
  const api=this.attachedApi,visible=api?.chart.timeScale().getVisibleLogicalRange(),plots=calculateStrategyWorldLinesPlots(width,height,this.model),{projectionPlot,safeIndicatorPlot}=plots;
  if(!api||!visible||width<=0||height<=0)return;
  const logicalRange={from:Number(visible.from),to:Number(visible.to)},segments:Record<string,{start:LinePoint;end:LinePoint}>={};
  const xForLogical=(index:number)=>logicalToCanvasX(index,logicalRange,projectionPlot),latestX=xForLogical(this.model.latestLogicalIndex);
  for(const entry of this.model.lines){const segment=projectWorldLine(entry.line,logicalRange,xForLogical,price=>{const value=api.series.priceToCoordinate(price);return value===null?null:Number(value)},safeIndicatorPlot,entry.extension);if(segment)segments[entry.line.id]=segment}
  context.save();try{context.beginPath();context.rect(safeIndicatorPlot.x,safeIndicatorPlot.y,safeIndicatorPlot.width,safeIndicatorPlot.height);context.clip();
   const upper=this.model.lines.find(line=>line.group==="lr-upper"),lower=this.model.lines.find(line=>line.group==="lr-lower"),upperSegment=upper&&segments[upper.line.id],lowerSegment=lower&&segments[lower.line.id];
   if(this.model.channelFill.visible&&upperSegment&&lowerSegment){context.fillStyle=hexToRgba(this.model.channelFill.colour,this.model.channelFill.opacity);context.beginPath();channelFillPolygon(upperSegment,lowerSegment).forEach((point,index)=>index?context.lineTo(point.x,point.y):context.moveTo(point.x,point.y));context.closePath();context.fill()}
   const labelHeight=this.model.fontSize+(this.model.compactLabels?4:this.model.labelPadding*2);context.font=`600 ${this.model.fontSize}px Inter, system-ui, sans-serif`;context.textBaseline="middle";
   const widths=Object.fromEntries(this.model.lines.map(entry=>[entry.line.id,context.measureText(entry.style.labelText).width+12]));
   const labels=layoutStrategyWorldLineLabels({entries:this.model.lines,segments,widths,labelHeight,safePlot:safeIndicatorPlot,latestX,labelOffset:this.model.labelOffset});
   for(const entry of this.model.lines){const segment=segments[entry.line.id];if(!segment)continue;const stroke=(colour:string,lineWidth:number,alpha=1)=>{context.globalAlpha=alpha;context.strokeStyle=colour;context.lineWidth=lineWidth;context.setLineDash(dashFor(entry.style.style));context.beginPath();context.moveTo(segment.start.x,segment.start.y);context.lineTo(segment.end.x,segment.end.y);context.stroke();context.globalAlpha=1};if(entry.style.halo)stroke(entry.style.haloColour,Math.min(9,entry.style.width+4),.18);stroke(entry.style.colour,entry.style.width);const position=labels.find(label=>label.id===entry.line.id);if(position){context.fillStyle=hexToRgba(entry.style.colour,.9);context.beginPath();context.roundRect(position.x,position.y-labelHeight/2,position.width,labelHeight,5);context.fill();context.fillStyle=entry.style.labelTextColour;context.fillText(entry.style.labelText,position.x+6,position.y)}}
   this.onPaint?.({ids:Object.keys(segments),segments,labels,safeIndicatorPlot,profile:plots.profile,rightLabels:plots.rightLabels,latestX});
  }finally{context.restore()}
 }
}
