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
