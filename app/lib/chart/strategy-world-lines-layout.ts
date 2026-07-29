import {calculateChartLayout,stackLabels,type LineSegment,type Rect} from "./chart-layout.ts";

const SAFETY_GAP=8;
export function calculateStrategyWorldLinesPlots(width:number,height:number,model:{volumeProfile:boolean;profileWidthPct:number;profileMaxWidth:number;profileInset:number;supportResistance:boolean;srLabelPlacement:string}){
 const projectionPlot:Rect={x:0,y:0,width:Math.max(0,width),height:Math.max(0,height)};
 const layout=calculateChartLayout({width,height,priceScaleWidth:0,profileEnabled:model.volumeProfile,profileWidthPct:model.profileWidthPct,profileMaxWidth:model.profileMaxWidth,profileInset:model.profileInset,rightLabels:model.supportResistance&&model.srLabelPlacement==="right-before-profile"});
 const reservedStart=model.supportResistance&&model.srLabelPlacement==="right-before-profile"?layout.rightLabels.x:layout.profile.x;
 const safeRight=Math.max(0,reservedStart-SAFETY_GAP);
 const safeIndicatorPlot:Rect={x:0,y:0,width:safeRight,height:Math.max(0,height)};
 return {projectionPlot,safeIndicatorPlot,profile:layout.profile,rightLabels:layout.rightLabels};
}

export function layoutStrategyWorldLineLabels(input:{entries:readonly {line:{id:string};style:{label:boolean}}[];segments:Readonly<Record<string,LineSegment>>;widths:Readonly<Record<string,number>>;labelHeight:number;safePlot:Rect;latestX:number|null;labelOffset:number}){
 const gap=Math.max(8,input.labelOffset), inset=6;
 const candidates=input.entries.filter(entry=>entry.style.label&&input.segments[entry.line.id]).map(entry=>{
  const segment=input.segments[entry.line.id],width=input.widths[entry.line.id];
  const minX=Math.min(segment.start.x,segment.end.x),maxX=Math.max(segment.start.x,segment.end.x),latestVisible=input.latestX!=null&&input.latestX>=input.safePlot.x&&input.latestX<=input.safePlot.x+input.safePlot.width;
  let x:number;
  if(latestVisible&&input.latestX!+gap+width<=input.safePlot.x+input.safePlot.width-inset)x=input.latestX!+gap;
  else if(latestVisible)x=input.latestX!-gap-width;
  else x=Math.min(maxX-inset-width,input.safePlot.x+input.safePlot.width-inset-width);
  x=Math.max(input.safePlot.x+inset,Math.min(x,input.safePlot.x+input.safePlot.width-width-inset));
  const sampleX=Math.max(minX,Math.min(maxX,x+width/2)),dx=segment.end.x-segment.start.x;
  const y=dx===0?(segment.start.y+segment.end.y)/2:segment.start.y+(segment.end.y-segment.start.y)*(sampleX-segment.start.x)/dx;
  return {id:entry.line.id,x,width,y};
 });
 const stacked=stackLabels(candidates.map(item=>({id:item.id,y:item.y-input.safePlot.y})),input.safePlot.height,input.labelHeight,4);
 return candidates.map(item=>{const placed=stacked.find(value=>value.id===item.id)!;return {id:item.id,x:item.x,y:input.safePlot.y+placed.placedY,width:item.width,height:input.labelHeight}});
}

