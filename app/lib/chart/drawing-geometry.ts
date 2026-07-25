import { drawingPoints, type Drawing, type DrawingPoint } from "./drawings.ts";
export type PixelPoint={x:number;y:number}; export type PlotRect={x:number;y:number;width:number;height:number};
export const distanceToSegment=(p:PixelPoint,a:PixelPoint,b:PixelPoint)=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)return Math.hypot(p.x-a.x,p.y-a.y);const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));};
export const hitSegment=(p:PixelPoint,a:PixelPoint,b:PixelPoint,toleranceCssPx=9)=>distanceToSegment(p,a,b)<=toleranceCssPx;
export const rectangleHit=(p:PixelPoint,a:PixelPoint,b:PixelPoint,tolerance=9)=>p.x>=Math.min(a.x,b.x)-tolerance&&p.x<=Math.max(a.x,b.x)+tolerance&&p.y>=Math.min(a.y,b.y)-tolerance&&p.y<=Math.max(a.y,b.y)+tolerance;
export const channelOffset=(basis:[PixelPoint,PixelPoint],offset:PixelPoint)=>({x:offset.x-basis[0].x,y:offset.y-basis[0].y});
export const fibLevels=(a:DrawingPoint,b:DrawingPoint,ratios:number[])=>ratios.map(r=>({ratio:r,price:a.price+(b.price-a.price)*r}));
export const clipPlot=(plot:PlotRect,profileX:number):PlotRect=>({...plot,width:Math.max(0,Math.min(plot.x+plot.width,profileX)-plot.x)});
export const handles=(drawing:Drawing)=>drawingPoints(drawing);
export function moveHandle(d:Drawing,index:number,p:DrawingPoint):Drawing {if("points" in d){const points=[...d.points];if(index>=points.length)return d;points[index]=p;return {...d,points:points as never};}return index===0?{...d,point:p}:d;}
export const distanceToRect=(p:PixelPoint,a:PixelPoint,b:PixelPoint)=>{
 const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
 if(p.x>=left&&p.x<=right&&p.y>=top&&p.y<=bottom)return 0;
 return Math.hypot(Math.max(left-p.x,0,p.x-right),Math.max(top-p.y,0,p.y-bottom));
};
export function extendRay(a:PixelPoint,b:PixelPoint,width:number):[PixelPoint,PixelPoint]{const dx=b.x-a.x;if(Math.abs(dx)<.001)return [a,b];const edge=dx>0?width:0,t=(edge-a.x)/dx;return t>0?[a,{x:edge,y:a.y+(b.y-a.y)*t}]:[a,b];}
export function constrainAngle(origin:PixelPoint,p:PixelPoint):PixelPoint {const dx=p.x-origin.x,dy=p.y-origin.y,r=Math.hypot(dx,dy),angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4;return {x:origin.x+Math.cos(angle)*r,y:origin.y+Math.sin(angle)*r};}
