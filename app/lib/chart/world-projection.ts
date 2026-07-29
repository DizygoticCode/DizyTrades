import { clipLineToRect, type Rect } from "./chart-layout.ts";
import type { LineExtension } from "./chart-layout.ts";

export type WorldLinePoint = Readonly<{ index: number; time: number; price: number }>;
export type WorldLine = {
  readonly id: string;
  readonly start: WorldLinePoint;
  readonly end: WorldLinePoint;
  readonly createdAt: number;
  readonly status: "forming" | "confirmed";
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
  extension: LineExtension = "both",
) {
  const delta = line.end.index - line.start.index;
  if (!Number.isFinite(delta) || delta === 0) return null;
  const slope = (line.end.price - line.start.price) / delta;
  const priceAt = (index: number) =>
    line.start.price + slope * (index - line.start.index);
  let from = Math.min(visible.from, visible.to),
    to = Math.max(visible.from, visible.to);
  const anchorFrom = Math.min(line.start.index, line.end.index),
    anchorTo = Math.max(line.start.index, line.end.index);
  if (extension === "none" || extension === "right") from = Math.max(from, anchorFrom);
  if (extension === "none" || extension === "left") to = Math.min(to, anchorTo);
  if (from > to) return null;
  const coordinate=(index:number)=>{const exact=xForLogical(index);if(exact!=null)return exact;const middle=(from+to)/2,anchor=xForLogical(middle),near=xForLogical(middle+1);return anchor!=null&&near!=null?anchor+(index-middle)*(near-anchor):null};
  const ax = coordinate(from),
    ay = yForPrice(priceAt(from)),
    bx = coordinate(to),
    by = yForPrice(priceAt(to));
  if (ax == null || ay == null || bx == null || by == null) return null;
  return clipLineToRect({ x: ax, y: ay }, { x: bx, y: by }, plot);
}

/** Position a label on a visible clipped segment, never on an off-screen anchor. */
export function worldLineLabelPosition(
  segment: { start: { x: number; y: number }; end: { x: number; y: number } },
  plot: Rect,
  width: number,
  height: number,
  lane: number,
  edge: "left" | "right" = "right",
  inset = 6,
) {
  const point = edge === "right"
    ? (segment.start.x >= segment.end.x ? segment.start : segment.end)
    : (segment.start.x <= segment.end.x ? segment.start : segment.end);
  const x = edge === "right" ? point.x - width - inset : point.x + inset;
  const laneOffset = (lane - 1) * (height + 3);
  return {
    x: Math.max(plot.x + inset, Math.min(x, plot.x + plot.width - width - inset)),
    y: Math.max(plot.y + height / 2 + inset, Math.min(point.y + laneOffset, plot.y + plot.height - height / 2 - inset)),
  };
}

export function stableLabelLane(id: string, priority: number, laneCount = 3) {
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) + priority) % Math.max(1, laneCount);
}
