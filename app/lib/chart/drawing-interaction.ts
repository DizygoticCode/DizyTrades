import type { Drawing,DrawingPoint } from "./drawings.ts";
import { distanceToRect,distanceToSegment,extendRay,moveHandle,rectangleHit,type PixelPoint } from "./drawing-geometry.ts";
export type InteractionState="idle"|"hovering"|"placing-first-anchor"|"placing-next-anchor"|"dragging-new-drawing"|"dragging-handle"|"dragging-object";
export type MagnetMode="off"|"weak"|"strong";
export type ProjectedDrawing={drawing:Drawing;points:PixelPoint[];textBounds?:{x:number;y:number;width:number;height:number}};
export type DrawingHit={id:string;kind:"handle"|"label"|"line"|"interior";handleIndex?:number};
const lineHit=(p:PixelPoint,a:PixelPoint,b:PixelPoint,t:number)=>distanceToSegment(p,a,b)<=t;
export function hitTestDrawing(item:ProjectedDrawing,p:PixelPoint,tolerance=9,plotWidth=Infinity):Omit<DrawingHit,"id">|null{
 const {drawing:d,points:q}=item;
 for(let i=q.length-1;i>=0;i--)if(Math.hypot(p.x-q[i].x,p.y-q[i].y)<=tolerance+4)return {kind:"handle",handleIndex:i};
 if(d.type==="text"&&item.textBounds&&distanceToRect(p,{x:item.textBounds.x,y:item.textBounds.y},{x:item.textBounds.x+item.textBounds.width,y:item.textBounds.y+item.textBounds.height})<=tolerance)return {kind:"label"};
 if(d.type==="horizontalLine")return Math.abs(p.y-q[0].y)<=tolerance?{kind:"line"}:null;
 if(d.type==="verticalLine")return Math.abs(p.x-q[0].x)<=tolerance?{kind:"line"}:null;
 if(d.type==="rectangle"){const edge=Math.min(Math.abs(p.x-q[0].x),Math.abs(p.x-q[1].x),Math.abs(p.y-q[0].y),Math.abs(p.y-q[1].y));return rectangleHit(p,q[0],q[1],0)?{kind:edge<=tolerance?"line":"interior"}:null;}
 if(d.type==="parallelChannel"){const o={x:q[2].x-q[0].x,y:q[2].y-q[0].y},a2={x:q[0].x+o.x,y:q[0].y+o.y},b2={x:q[1].x+o.x,y:q[1].y+o.y};if(lineHit(p,q[0],q[1],tolerance)||lineHit(p,a2,b2,tolerance))return {kind:"line"};return pointInPolygon(p,[q[0],q[1],b2,a2])?{kind:"interior"}:null;}
 if(d.type==="fibonacci"){for(const ratio of d.ratios){const y=q[0].y+(q[1].y-q[0].y)*ratio;if(p.x>=Math.min(q[0].x,q[1].x)-tolerance&&p.x<=Math.max(q[0].x,q[1].x)+tolerance&&Math.abs(p.y-y)<=tolerance)return {kind:"line"};}return rectangleHit(p,q[0],q[1],0)?{kind:"interior"}:null;}
 if(d.type==="ray"){const [a,b]=extendRay(q[0],q[1],plotWidth);return lineHit(p,a,b,tolerance)?{kind:"line"}:null;}
 return q[1]&&lineHit(p,q[0],q[1],tolerance)?{kind:"line"}:null;
}
function pointInPolygon(p:PixelPoint,poly:PixelPoint[]){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i].y>p.y)!==(poly[j].y>p.y)&&p.x<(poly[j].x-poly[i].x)*(p.y-poly[i].y)/(poly[j].y-poly[i].y)+poly[i].x)inside=!inside;return inside;}
export function hitTestDrawings(items:ProjectedDrawing[],p:PixelPoint,tolerance=9,plotWidth=Infinity):DrawingHit|null {let body:DrawingHit|null=null;for(let i=items.length-1;i>=0;i--){if(!items[i].drawing.visible)continue;const h=hitTestDrawing(items[i],p,tolerance,plotWidth);if(h?.kind==="handle")return {id:items[i].drawing.id,...h};if(h&&!body)body={id:items[i].drawing.id,...h};}return body;}
export function dragHandle(original:Drawing,index:number,p:DrawingPoint){return original.locked?original:moveHandle(original,index,p);}
export function translateFromOriginal(original:Drawing,start:DrawingPoint,current:DrawingPoint):Drawing {if(original.locked)return original;const delta={time:current.time-start.time,price:current.price-start.price},move=(p:DrawingPoint)=>({time:p.time+delta.time,price:p.price+delta.price});return "points" in original?{...original,points:original.points.map(move) as never}:{...original,point:move(original.point)};}
export type SnapCandle={time:number;open:number;high:number;low:number;close:number};
export function snapToCandle(pointer:PixelPoint,candles:SnapCandle[],project:(p:DrawingPoint)=>PixelPoint|null,mode:MagnetMode,tolerance=10){if(mode==="off"||!candles.length)return null;let best:{point:DrawingPoint;pixel:PixelPoint;distance:number}|null=null;for(const c of candles)for(const price of [c.open,c.high,c.low,c.close]){const point={time:c.time,price},pixel=project(point);if(!pixel)continue;const distance=Math.hypot(pixel.x-pointer.x,pixel.y-pointer.y);if(!best||distance<best.distance)best={point,pixel,distance};}return best&&(mode==="strong"||best.distance<=tolerance)?best:null;}
