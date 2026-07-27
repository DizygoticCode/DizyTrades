export type StrategyMode = "scalp-15m" | "swing-1h-4h" | "pine-v1-exact" | "custom";
export type StrategySettings = {
  mode: StrategyMode; pivotLength:number; srLookback:number; srTolerancePct:number; srClusterAtr:number; minTouches:number;
  triangleTightnessPct:number; breakoutVolumeMultiple:number; vwapLength:number; trendLength:number; channelLength:number;
  channelDeviation:number; channelReversalWindow:number; fibLength:number; zigZagThresholdPct:number; structureWindow:number;
  requireMinConfluence:boolean; minConfluence:number; useVwapFilter:boolean; useTrendFilter:boolean;
};
export type EffectiveStrategySettings = StrategySettings;
const shared = { trendLength:50, channelDeviation:2, requireMinConfluence:true, minConfluence:2, useVwapFilter:false, useTrendFilter:false };
export const STRATEGY_PRESETS: Record<Exclude<StrategyMode,"custom">,EffectiveStrategySettings> = {
  "scalp-15m": { mode:"scalp-15m", ...shared, srLookback:300,pivotLength:3,srClusterAtr:.8,minTouches:2,srTolerancePct:.1,triangleTightnessPct:.5,breakoutVolumeMultiple:1.4,channelLength:80,channelReversalWindow:5,fibLength:100,zigZagThresholdPct:1,structureWindow:4,vwapLength:96 },
  "pine-v1-exact": { mode:"pine-v1-exact", ...shared, srLookback:300,pivotLength:3,srClusterAtr:.8,minTouches:2,srTolerancePct:.1,triangleTightnessPct:.5,breakoutVolumeMultiple:1.4,channelLength:80,channelReversalWindow:5,fibLength:100,zigZagThresholdPct:1,structureWindow:4,vwapLength:96 },
  "swing-1h-4h": { mode:"swing-1h-4h", ...shared, srLookback:1000,pivotLength:8,srClusterAtr:1.3,minTouches:3,srTolerancePct:.2,triangleTightnessPct:.8,breakoutVolumeMultiple:1.1,channelLength:240,channelReversalWindow:8,fibLength:320,zigZagThresholdPct:2.5,structureWindow:8,vwapLength:192 },
};
export const strategyModeLabel=(mode:StrategyMode)=>mode==="scalp-15m"?"Scalping · 15m":mode==="pine-v1-exact"?"Pine V1 Exact":mode==="swing-1h-4h"?"Swing · 1H/4H":"Custom";
export const resolveStrategySettings=(settings:StrategySettings):EffectiveStrategySettings=>settings.mode==="custom"?settings:STRATEGY_PRESETS[settings.mode]??STRATEGY_PRESETS["scalp-15m"];
export const strategyHistoryCapacity=(settings:StrategySettings)=>settings.mode==="swing-1h-4h"?1400:(settings.mode==="scalp-15m"||settings.mode==="pine-v1-exact")?800:Math.min(2000,Math.max(800,settings.srLookback+Math.max(settings.channelLength,settings.fibLength)+settings.pivotLength*2));
export const strategyWarmup=(s:EffectiveStrategySettings)=>Math.max(20,s.trendLength,s.vwapLength,s.channelLength,s.fibLength,s.pivotLength*6+s.structureWindow);
