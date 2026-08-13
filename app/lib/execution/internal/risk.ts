import "server-only";
import type { ExecutionIntent, ExecutionPrerequisites, ExecutionResult, ExecutionRiskCode } from "../types";
import type { ExecutionRiskStore } from "./risk-store";
import { ExecutionRiskStoreError } from "./risk-store";
import { serverExecutionPolicy } from "./policy";

export type ExecutionRiskDecision = Readonly<{ ok: true; projectedGrossNotional: number } | { ok: false; reason: ExecutionRiskCode }>;
const deny = (reason: ExecutionRiskCode): ExecutionRiskDecision => Object.freeze({ ok:false, reason });

export function evaluateExecutionRisk(store: ExecutionRiskStore, intent: ExecutionIntent, prerequisites: ExecutionPrerequisites, preview: NonNullable<ExecutionResult["preview"]>, now=new Date()): ExecutionRiskDecision {
  let authorization;
  try { authorization=store.read(intent.userId,intent.accountId); }
  catch(e) { return deny(e instanceof ExecutionRiskStoreError && e.code==="EXECUTION_RISK_INVALID" ? "EXECUTION_RISK_INVALID" : "EXECUTION_RISK_UNAVAILABLE"); }
  if(!authorization)return deny("ACCOUNT_NOT_AUTHORIZED");
  if(!authorization.enabled)return deny("ACCOUNT_AUTHORIZATION_DISABLED");
  if(Date.parse(authorization.reviewAt)<now.getTime())return deny("ACCOUNT_AUTHORIZATION_EXPIRED");
  if(!authorization.allowedSymbols.includes(intent.symbol))return deny("ACCOUNT_SYMBOL_NOT_AUTHORIZED");
  if(intent.leverage>authorization.maximumLeverage)return deny("ACCOUNT_LEVERAGE_LIMIT_EXCEEDED");
  if(preview.estimatedNotional>authorization.maximumOrderNotional)return deny("ACCOUNT_ORDER_NOTIONAL_LIMIT_EXCEEDED");
  const snapshot=prerequisites.riskSnapshot;
  if(!snapshot)return deny("RISK_SNAPSHOT_MISSING");
  if(snapshot.userId!==intent.userId||snapshot.accountId!==intent.accountId)return deny("RISK_SNAPSHOT_IDENTITY_MISMATCH");
  const observed=Date.parse(snapshot.observedAt); const policy=serverExecutionPolicy();
  if(!Number.isFinite(observed)||!Number.isFinite(snapshot.equity)||snapshot.equity<=0||!Number.isFinite(snapshot.dayStartEquity)||snapshot.dayStartEquity<=0||!Number.isFinite(snapshot.availableMargin)||snapshot.availableMargin<0||snapshot.availableMargin>snapshot.equity*2)return deny("RISK_SNAPSHOT_INVALID");
  const age=now.getTime()-observed;if(age<0||age>policy.maximumRiskSnapshotAgeMs)return deny("RISK_SNAPSHOT_STALE");
  const drawdown=Math.max(0,snapshot.dayStartEquity-snapshot.equity);
  if((authorization.maximumDailyDrawdownUsdt!==undefined&&drawdown>authorization.maximumDailyDrawdownUsdt)||(authorization.maximumDailyDrawdownFraction!==undefined&&drawdown/snapshot.dayStartEquity>authorization.maximumDailyDrawdownFraction))return deny("ACCOUNT_DAILY_DRAWDOWN_LIMIT_EXCEEDED");
  if(preview.estimatedMargin>snapshot.availableMargin*authorization.maximumOrderMarginFractionOfAvailable)return deny("ACCOUNT_ORDER_MARGIN_LIMIT_EXCEEDED");
  let gross=0;
  for(const position of prerequisites.accountState?.positions??[]) { const reference=prerequisites.referencePrices?.get(position.symbol); if(!reference||!Number.isFinite(reference.price)||reference.price<=0||!Number.isFinite(Date.parse(reference.observedAt)))return deny("POSITION_REFERENCE_PRICE_MISSING"); const referenceAge=now.getTime()-Date.parse(reference.observedAt);if(referenceAge<0||referenceAge>policy.maximumReferencePriceAgeMs)return deny("POSITION_REFERENCE_PRICE_STALE"); gross+=Math.abs(position.quantity*reference.price);if(!Number.isFinite(gross))return deny("ACCOUNT_GROSS_EXPOSURE_LIMIT_EXCEEDED"); }
  // Existing positions are marked at reference prices, so reductions must use
  // that same valuation basis. A conservative limit-order estimate may be
  // higher and must not discount exposure in unrelated positions.
  if(intent.reduceOnly) gross=Math.max(0,gross-preview.quantity*preview.referencePrice); else gross+=preview.estimatedNotional;
  if(gross>authorization.maximumGrossNotional)return deny("ACCOUNT_GROSS_EXPOSURE_LIMIT_EXCEEDED");
  return Object.freeze({ok:true,projectedGrossNotional:gross});
}
