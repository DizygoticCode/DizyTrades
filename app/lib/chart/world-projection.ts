import { clipLineToRect, type Rect } from "./chart-layout.ts";

export type WorldLinePoint = { index: number; time: number; price: number };
export type WorldLine = {
  id: string;
  start: WorldLinePoint;
  end: WorldLinePoint;
  labelAnchor: WorldLinePoint;
  createdAt: number;
  status: "forming" | "confirmed";
};

/** Project a market-space straight line at the visible logical boundaries. */
export function logicalToCanvasX(logical:number,visible:{from:number;to:number},plot:Rect){
  const span=visible.to-visible.from;
  if(!Number.isFinite(logical)||!Number.isFinite(visible.from)||!Number.isFinite(visible.to)||!Number.isFinite(plot.x)||!Number.isFinite(plot.width)||span===0||plot.width<0)return null;
  return plot.x+((logical-visible.from)/span)*plot.width;
}
export function projectWorldLine(
  line: WorldLine,
  visible: { from: number; to: number },
  xForLogical: (index: number) => number | null,
  yForPrice: (price: number) => number | null,
  plot: Rect,
) {
  const delta = line.end.index - line.start.index;
  if (!Number.isFinite(delta) || delta === 0) return null;
  const slope = (line.end.price - line.start.price) / delta;
  const priceAt = (index: number) =>
    line.start.price + slope * (index - line.start.index);
  const from = Math.min(visible.from, visible.to),
    to = Math.max(visible.from, visible.to);
  const coordinate=(index:number)=>{const exact=xForLogical(index);if(exact!=null)return exact;const middle=(from+to)/2,anchor=xForLogical(middle),near=xForLogical(middle+1);return anchor!=null&&near!=null?anchor+(index-middle)*(near-anchor):null};
  const ax = coordinate(from),
    ay = yForPrice(priceAt(from)),
    bx = coordinate(to),
    by = yForPrice(priceAt(to));
  if (ax == null || ay == null || bx == null || by == null) return null;
  return clipLineToRect({ x: ax, y: ay }, { x: bx, y: by }, plot);
}

export function stableLabelLane(id: string, priority: number, laneCount = 3) {
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) + priority) % Math.max(1, laneCount);
}
