import type { PaperTrade } from "./backtest";

export type PaperCompletionTracker=Readonly<{identity:string;observed:Readonly<Record<string,PaperTrade["exitReason"]>>;seenFinal:readonly string[];latestObservedExitTime:number}>;
export type PaperCompletionObservation=Readonly<{tracker:PaperCompletionTracker;completed:PaperTrade|null}>;

/** Baselines recalculations and emits only lifecycle closures observed within one stable simulation identity. */
export function observePaperCompletions(previous:PaperCompletionTracker|null,identity:string,trades:ReadonlyArray<PaperTrade>):PaperCompletionObservation {
  const observed=Object.fromEntries(trades.map(trade=>[trade.id,trade.exitReason])) as Record<string,PaperTrade["exitReason"]>;
  const finalIds=trades.filter(t=>t.exitReason!=="MARK").map(t=>t.id);
  const latestObservedExitTime=trades.reduce((latest,trade)=>Math.max(latest,trade.exitTime),0);
  if(!previous||previous.identity!==identity)return {tracker:Object.freeze({identity,observed:Object.freeze(observed),seenFinal:Object.freeze(finalIds),latestObservedExitTime}),completed:null};
  const seen=new Set(previous.seenFinal);let completed:PaperTrade|null=null;
  for(const trade of trades){if(trade.exitReason==="MARK"||seen.has(trade.id))continue;const prior=previous.observed[trade.id];if(prior==="MARK"||prior===undefined&&trade.exitTime>previous.latestObservedExitTime){completed=trade;seen.add(trade.id);}}
  return {tracker:Object.freeze({identity,observed:Object.freeze(observed),seenFinal:Object.freeze([...seen]),latestObservedExitTime:Math.max(previous.latestObservedExitTime,latestObservedExitTime)}),completed};
}
