export type Rect = { x: number; y: number; width: number; height: number };
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

export function patternLabelPosition(bounds: Rect, placement: PatternPlacement, label: { width: number; height: number }, plot: Rect, offset: number) {
  let x = bounds.x + (bounds.width - label.width) / 2, y = bounds.y - label.height - offset;
  if (placement === "inside") y = bounds.y + (bounds.height - label.height) / 2;
  if (placement === "below") y = bounds.y + bounds.height + offset;
  if (placement === "left") { x = bounds.x - label.width - offset; y = bounds.y + (bounds.height - label.height) / 2; }
  if (placement === "right") { x = bounds.x + bounds.width + offset; y = bounds.y + (bounds.height - label.height) / 2; }
  return { x: Math.min(plot.x + plot.width - label.width, Math.max(plot.x, x)), y: Math.min(plot.y + plot.height - label.height, Math.max(plot.y, y)) };
}

export type BubblePlacement = { id:string; anchorX:number; anchorY:number; width:number; height:number; x:number; y:number; row:number };
export function placeChartBubbles(items: {id:string;anchorX:number;anchorY:number;width:number;height:number}[], plot:Rect, reservedTop=48, gap=5): BubblePlacement[] {
  const placed: BubblePlacement[]=[];
  for (const item of [...items].sort((a,b)=>a.anchorX-b.anchorX||a.id.localeCompare(b.id))) {
    const x=Math.min(plot.x+plot.width-item.width,Math.max(plot.x,item.anchorX-item.width/2));
    let row=0, y=Math.max(plot.y+reservedTop,item.anchorY-item.height-12);
    while (placed.some(other=>x<other.x+other.width+gap&&x+item.width+gap>other.x&&y<other.y+other.height+gap&&y+item.height+gap>other.y)) { row+=1; y=Math.max(plot.y+reservedTop,item.anchorY-item.height-12+row*(item.height+gap)); }
    y=Math.min(plot.y+plot.height-item.height,Math.max(plot.y+reservedTop,y));
    placed.push({...item,x,y,row});
  }
  return placed;
}
