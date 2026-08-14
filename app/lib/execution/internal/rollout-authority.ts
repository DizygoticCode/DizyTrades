import "server-only";

import { MEXC_PROVIDER_READBACK_MAX_AGE_MS } from "../../mexc-provider-readback";
import type { AuthenticatedExecutionCaller } from "../types";
import { verifyProductionExecutionCaller } from "./caller-assertion";
import { ownershipBindingMatches, readProductionExecutionOwnershipBinding, type ExecutionOwnershipBinding } from "./ownership-binding";
import type { ExecutionOwnershipStore } from "./ownership-store";
import type { ExecutionReconciliationStore } from "./reconciliation-store";
import type { ExecutionRiskPolicy, ExecutionRiskStore } from "./risk-store";
import { createProductionExecutionOwnershipStore } from "./ownership-store";
import { createProductionExecutionReconciliationStore } from "./reconciliation-store";
import { createProductionExecutionRiskStore } from "./risk-store";
import { createProductionExecutionRolloutStore, EXECUTION_ROLLOUT_MAX_AGE_MS, type ExecutionRolloutState, type ExecutionRolloutStore, type RestrictedRolloutPolicy } from "./rollout-store";

type Identity=Readonly<{userId:string;accountId:string}>;
type Dependencies=Readonly<{ownership:ExecutionOwnershipStore;reconciliation:ExecutionReconciliationStore;risk:ExecutionRiskStore;rollout:ExecutionRolloutStore;binding:ExecutionOwnershipBinding|null}>;
const fresh=(value:string|null,now:Date,max=MEXC_PROVIDER_READBACK_MAX_AGE_MS)=>{const age=value===null?NaN:now.getTime()-Date.parse(value);return Number.isFinite(age)&&age>=0&&age<=max};
export const policyWithinRisk=(rollout:RestrictedRolloutPolicy,risk:ExecutionRiskPolicy)=>rollout.allowedSymbols.every(s=>risk.allowedSymbols.includes(s))&&rollout.maximumLeverage<=risk.maximumLeverage&&rollout.maximumOrderNotional<=risk.maximumOrderNotional&&risk.maximumDailyDrawdownUsdt!==undefined&&rollout.maximumDailyLoss<=risk.maximumDailyDrawdownUsdt;

/** All authoritative prerequisites are re-read at each deliberate CAS transition. */
function prerequisites(id:Identity,dependencies:Dependencies,now:Date,policy?:RestrictedRolloutPolicy){
  if(!ownershipBindingMatches(dependencies.binding,id))return null;
  const ownership=dependencies.ownership.read(id);
  if(ownership.status!=="active"||ownership.bindingDigest!==dependencies.binding!.bindingDigest||!fresh(ownership.proofObservedAt,now))return null;
  const reconciliation=dependencies.reconciliation.read(id);
  if(reconciliation.status!=="clean"||!fresh(reconciliation.observedAt,now))return null;
  const risk=dependencies.risk.read(id.userId,id.accountId);
  if(!risk||!risk.enabled||Date.parse(risk.reviewAt)<=now.getTime()||(policy&&!policyWithinRisk(policy,risk)))return null;
  return Object.freeze({bindingDigest:dependencies.binding!.bindingDigest,risk});
}

export function approveRestrictedRollout(dependencies:Dependencies,caller:AuthenticatedExecutionCaller,policy:RestrictedRolloutPolicy,expectedRevision:number,now=new Date()):ExecutionRolloutState {
  const id=Object.freeze({userId:caller.userId,accountId:caller.accountId});
  const ready=prerequisites(id,dependencies,now,policy);
  if(!ready)return dependencies.rollout.read(id);
  return dependencies.rollout.approve(id,ready.bindingDigest,ready.risk.revision,policy,now.toISOString(),expectedRevision);
}
export function armRestrictedRollout(dependencies:Dependencies,caller:AuthenticatedExecutionCaller,expectedRevision:number,now=new Date()):ExecutionRolloutState {
  const id=Object.freeze({userId:caller.userId,accountId:caller.accountId}),state=dependencies.rollout.read(id);
  if(state.status!=="approved"||!state.policy||!fresh(state.approvedAt,now,EXECUTION_ROLLOUT_MAX_AGE_MS))return state;
  const ready=prerequisites(id,dependencies,now,state.policy);
  if(!ready||state.bindingDigest!==ready.bindingDigest||state.riskRevision!==ready.risk.revision)return state;
  return dependencies.rollout.arm(id,now.toISOString(),expectedRevision);
}
export const disarmRestrictedRollout=(store:ExecutionRolloutStore,caller:AuthenticatedExecutionCaller,revision:number,now=new Date())=>store.disarm(caller,now.toISOString(),revision);
export const revokeRestrictedRollout=(store:ExecutionRolloutStore,caller:AuthenticatedExecutionCaller,revision:number,now=new Date())=>store.revoke(caller,now.toISOString(),revision);

type ProductionRequest=Readonly<{callerAssertion:Readonly<{callerId:string;assertionId:string}>;userId:string;accountId:string;expectedRevision:number;policy?:RestrictedRolloutPolicy}>;
const productionDependencies=():Dependencies=>Object.freeze({ownership:createProductionExecutionOwnershipStore(),reconciliation:createProductionExecutionReconciliationStore(),risk:createProductionExecutionRiskStore(),rollout:createProductionExecutionRolloutStore(),binding:readProductionExecutionOwnershipBinding()});
const caller=(request:ProductionRequest)=>{const verified=verifyProductionExecutionCaller(request.callerAssertion);return verified&&verified.userId===request.userId&&verified.accountId===request.accountId?verified:null};

/** Server-only, single-use TOTP-assured approval; intentionally has no route. */
export function approveProductionRestrictedRollout(request:ProductionRequest,dependencies=productionDependencies(),now=new Date()) { const verified=caller(request); return verified&&request.policy?approveRestrictedRollout(dependencies,verified,request.policy,request.expectedRevision,now):null; }
/** Server-only, separate single-use TOTP-assured arming transition. */
export function armProductionRestrictedRollout(request:ProductionRequest,dependencies=productionDependencies(),now=new Date()) { const verified=caller(request); return verified?armRestrictedRollout(dependencies,verified,request.expectedRevision,now):null; }
export function disarmProductionRestrictedRollout(request:ProductionRequest,store:ExecutionRolloutStore=createProductionExecutionRolloutStore(),now=new Date()) { const verified=caller(request); return verified?disarmRestrictedRollout(store,verified,request.expectedRevision,now):null; }
export function revokeProductionRestrictedRollout(request:ProductionRequest,store:ExecutionRolloutStore=createProductionExecutionRolloutStore(),now=new Date()) { const verified=caller(request); return verified?revokeRestrictedRollout(store,verified,request.expectedRevision,now):null; }
