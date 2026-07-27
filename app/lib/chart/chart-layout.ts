import { clipSegment, extendLineToPlot as sharedExtendLineToPlot } from "./drawing-geometry.ts";
export type Rect = { x: number; y: number; width: number; height: number };
export type LineExtension = "none" | "left" | "right" | "both";
export type LinePoint = { x: number; y: number };
export type LineSegment = { start: LinePoint; end: LinePoint };

const finitePoint = (point: LinePoint) => Number.isFinite(point.x) && Number.isFinite(point.y);

/** Clips a finite segment to a rectangle. */
export function clipLineToRect(start:LinePoint,end:LinePoint,rect:Rect):LineSegment|null{return clipSegment(start,end,rect);}
/** Shared screen-x-normalized extension geometry. */
export function extendLineToPlot(anchors:[LinePoint,LinePoint],plot:Rect,extension:LineExtension):LineSegment|null{return sharedExtendLineToPlot(anchors[0],anchors[1],plot,extension);}

export function calculateHorizontalLineExtent(startX: number, endX: number, plot: Rect, extension: LineExtension): { startX: number; endX: number } | null {
  if (![startX, endX, plot.x, plot.width].every(Number.isFinite) || plot.width <= 0) return null;
  const first = Math.min(startX, endX), last = Math.max(startX, endX);
  const left = extension === "left" || extension === "both" ? plot.x : first;
  const right = extension === "right" || extension === "both" ? plot.x + plot.width : last;
  const clippedLeft = Math.max(plot.x, Math.min(plot.x + plot.width, left));
  const clippedRight = Math.max(plot.x, Math.min(plot.x + plot.width, right));
  return clippedRight < clippedLeft ? null : { startX: clippedLeft, endX: clippedRight };
}

export function channelFillPolygon(upper: LineSegment, lower: LineSegment): LinePoint[] {
  return [upper.start, upper.end, lower.end, lower.start].filter(finitePoint);
}
export type SidePlacement = "right-before-profile" | "left-edge" | "near-latest" | "hidden";
export type PatternPlacement = "above" | "inside" | "below" | "left" | "right" | "hidden";

export function calculateChartLayout(input: { width: number; height: number; priceScaleWidth?: number; profileEnabled: boolean; profileWidthPct: number; profileMaxWidth: number; profileInset: number; rightLabels: boolean; labelLaneWidth?: number; controlsHeight?: number }) {
  const width = Math.max(0, input.width), height = Math.max(0, input.height);
  const priceWidth = Math.min(width * .28, Math.max(0, input.priceScaleWidth ?? 64));
  const usable = Math.max(0, width - priceWidth);
  const profileWidth = input.profileEnabled ? Math.min(input.profileMaxWidth, usable * Math.min(.3, Math.max(.1, input.profileWidthPct / 100)), Math.max(56, usable * .36)) : 0;
  const inset = input.profileEnabled ? Math.min(Math.max(0, input.profileInset), profileWidth / 3) : 0;
  const labelWidth = input.rightLabels ? Math.min(input.labelLaneWidth ?? 128, Math.max(72, usable * .24)) : 0;
  const profile: Rect = { x: usable - profileWidth, y: 0, width: profileWidth, height };
  const rightLabels: Rect = { x: profile.x - labelWidth, y: 0, width: labelWidth, height };
  const candles: Rect = { x: 12, y: 0, width: Math.max(0, rightLabels.x - 28), height };
  return { chart: { x: 0, y: 0, width, height }, candles, priceScale: { x: usable, y: 0, width: priceWidth, height }, profile, profileContent: { x: profile.x + inset, y: 0, width: Math.max(0, profile.width - inset * 2), height }, rightLabels, leftLabels: { x: 12, y: 36, width: Math.min(140, usable * .22), height: Math.max(0, height - 48) }, gutters: { left: 12, right: 16 }, controls: { x: Math.max(0, usable - 210), y: 8, width: 200, height: input.controlsHeight ?? 32 } };
}

export function calculateAutoFit(input: { candleCount: number; desiredCount: number; barSpacing: number; layout: ReturnType<typeof calculateChartLayout>; minimumGutter?: number }) {
  const gutter = input.minimumGutter ?? 16;
  const available = Math.max(1, input.layout.candles.width - gutter);
  const visible = Math.max(1, Math.min(input.candleCount, 180, input.desiredCount, Math.floor(available / Math.max(4, input.barSpacing))));
  const reservedBars = Math.max(2, Math.ceil((input.layout.chart.width - input.layout.candles.x - input.layout.candles.width + gutter) / Math.max(4, input.barSpacing)));
  return { from: Math.max(0, input.candleCount - visible), to: input.candleCount - 1 + reservedBars, visibleCount: visible, reservedBars, latestMaximumX: input.layout.candles.x + input.layout.candles.width - gutter };
}

/** Keeps the user's horizontal zoom while moving the newest bar into the safe candle lane. */
export function calculateGoToLive(input: { candleCount: number; currentRange: { from: number; to: number } | null; barSpacing: number; layout: ReturnType<typeof calculateChartLayout>; minimumGutter?: number }) {
  const gutter = input.minimumGutter ?? 16;
  const fallbackSpan = Math.max(1, Math.floor(input.layout.candles.width / Math.max(4, input.barSpacing)));
  const span = input.currentRange && Number.isFinite(input.currentRange.to - input.currentRange.from)
    ? Math.max(1, input.currentRange.to - input.currentRange.from)
    : fallbackSpan;
  const reservedBars = Math.max(2, Math.ceil((input.layout.chart.width - input.layout.candles.x - input.layout.candles.width + gutter) / Math.max(4, input.barSpacing)));
  const to = Math.max(0, input.candleCount - 1) + reservedBars;
  return { from: to - span, to, span, reservedBars };
}

/** Canvas geometry for a price bucket. The gap shrinks before the bar does. */
export function calculateProfileRowGeometry(top: number, bottom: number, rowCount: number) {
  const extent = Math.abs(bottom - top);
  const gap = rowCount >= 160 ? 0 : rowCount >= 96 ? .25 : rowCount >= 64 ? .5 : Math.min(1, extent * .2);
  const height = Math.min(extent, Math.max(.75, extent - gap));
  return { y: Math.min(top, bottom) + (extent - height) / 2, height, gap };
}

export function stackLabels(items: { id: string; y: number }[], height: number, labelHeight: number, gap = 4) {
  if (!items.length) return [];
  const sorted = items.map((item, index) => ({ ...item, index })).sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const step = labelHeight + gap;
  const top = labelHeight / 2, bottom = Math.max(top, height - labelHeight / 2);
  const output = sorted.map(item => ({ ...item, placedY: Math.min(bottom, Math.max(top, item.y)) }));
  for (let i = 1; i < output.length; i++) output[i].placedY = Math.max(output[i].placedY, output[i - 1].placedY + step);
  output[output.length - 1].placedY = Math.min(bottom, output.at(-1)!.placedY);
  for (let i = output.length - 2; i >= 0; i--) output[i].placedY = Math.min(output[i].placedY, output[i + 1].placedY - step);
  if (output[0].placedY < top) { output[0].placedY = top; for (let i = 1; i < output.length; i++) output[i].placedY = Math.max(output[i].placedY, output[i - 1].placedY + step); }
  return output.sort((a, b) => a.index - b.index).map(item => ({ id: item.id, y: item.y, placedY: item.placedY, displaced: Math.abs(item.placedY - item.y) > .5 }));
}

export type FibLabelLayout = {
  id: string; ratio: number; text: string; x: number; y: number; width: number; height: number;
  lineY: number; centreY: number; displaced: boolean; connector: boolean; emphasis: 0 | 1 | 2;
};

export function calculateFibLabelLayout(input: {
  levels: { ratio: number; label: string; lineY: number; textWidth: number }[];
  placement: SidePlacement;
  plot: Rect;
  leftX: number;
  rightBoundary: number;
  latestX: number;
  offset: number;
  labelHeight: number;
  horizontalPadding: number;
  top?: number;
  bottom?: number;
  gap?: number;
}): FibLabelLayout[] {
  if (input.placement === "hidden") return [];
  const top = Math.max(input.plot.y, input.top ?? input.plot.y);
  const bottom = Math.min(input.plot.y + input.plot.height, input.bottom ?? input.plot.y + input.plot.height);
  const laneHeight = Math.max(input.labelHeight, bottom - top);
  const stacked = stackLabels(
    input.levels.map(level => ({ id: `fib-${Math.round(level.ratio * 1_000)}`, y: level.lineY - top })),
    laneHeight,
    input.labelHeight,
    input.gap ?? 3,
  );
  return input.levels.map((level, index) => {
    const width = Math.max(1, level.textWidth + input.horizontalPadding * 2);
    let x = input.leftX;
    if (input.placement === "right-before-profile") x = input.rightBoundary - width;
    if (input.placement === "near-latest") x = Math.min(input.rightBoundary - width, input.latestX + input.offset);
    x = Math.max(input.plot.x, Math.min(x, input.plot.x + input.plot.width - width));
    const placed = stacked[index];
    const centreY = top + placed.placedY;
    const ratioKey = Math.round(level.ratio * 1_000);
    return {
      id: placed.id, ratio: level.ratio, text: level.label, x,
      y: centreY - input.labelHeight / 2, width, height: input.labelHeight,
      lineY: level.lineY, centreY, displaced: placed.displaced,
      connector: placed.displaced, emphasis: ratioKey === 618 ? 2 : ratioKey === 500 ? 1 : 0,
    };
  });
}

export function patternLabelPosition(bounds: Rect, placement: PatternPlacement, label: { width: number; height: number }, plot: Rect, offset: number, clampToPlot=true) {
  let x = bounds.x + (bounds.width - label.width) / 2, y = bounds.y - label.height - offset;
  if (placement === "inside") y = bounds.y + (bounds.height - label.height) / 2;
  if (placement === "below") y = bounds.y + bounds.height + offset;
  if (placement === "left") { x = bounds.x - label.width - offset; y = bounds.y + (bounds.height - label.height) / 2; }
  if (placement === "right") { x = bounds.x + bounds.width + offset; y = bounds.y + (bounds.height - label.height) / 2; }
  return clampToPlot ? { x: Math.min(plot.x + plot.width - label.width, Math.max(plot.x, x)), y: Math.min(plot.y + plot.height - label.height, Math.max(plot.y, y)) } : {x,y};
}

export type BubblePlacement = { id:string; anchorX:number; anchorY:number; width:number; height:number; x:number; y:number; row:number; side?:"above"|"below" };
export function placeChartBubbles(items: {id:string;anchorX:number;anchorY:number;width:number;height:number;side?:"above"|"below"}[], plot:Rect, reservedTop=48, gap=5, tolerance=2): BubblePlacement[] {
  const placed: BubblePlacement[]=[];
  const visible=items.filter(item=>{const x=item.anchorX-item.width/2;return x<plot.x+plot.width+tolerance&&x+item.width>plot.x-tolerance});
  for (const item of [...visible].sort((a,b)=>a.anchorX-b.anchorX||a.id.localeCompare(b.id))) {
    const x=item.anchorX-item.width/2;
    const below=item.side==="below";
    const baseY=below?item.anchorY+12:item.anchorY-item.height-12;
    let row=0, y=baseY;
    const laneOffset=(lane:number)=>{
      if(lane===0)return 0;
      const distance=Math.ceil(lane/2)*(item.height+gap);
      const preferred=below?1:-1;
      return distance*(lane%2===1?preferred:-preferred);
    };
    const collides=(candidate:number)=>placed.some(other=>x<other.x+other.width+gap&&x+item.width+gap>other.x&&candidate<other.y+other.height+gap&&candidate+item.height+gap>other.y);
    while(row<24){const candidate=baseY+laneOffset(row);if(candidate>=plot.y+reservedTop&&candidate+item.height<=plot.y+plot.height&&!collides(candidate)){y=candidate;break;}row+=1;}
    if(row===24)continue;
    placed.push({...item,x,y,row});
  }
  return placed;
}
