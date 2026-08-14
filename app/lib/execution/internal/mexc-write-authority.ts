import "server-only";

import type { MexcExecutionIntent,MexcWriteAuthority } from "./mexc-execution-writer";
import { executionKillSwitchReason,type ExecutionKillSwitches } from "./kill-switch";
import type { ExecutionResult } from "../types";

export type MexcPreWriteEvidence = Readonly<{
  caller:Readonly<{userId:string;accountId:string;totpAssured:true}>;
  ownership:Readonly<{userId:string;accountId:string;bindingGeneration:string;freshUntil:string}>;
  reconciliation:Readonly<{userId:string;accountId:string;revision:number;positionId:string;positionSide:"long"|"short";positionMode:"one-way";positionVolume:number;freshUntil:string;clean:true}>;
  risk:Readonly<{userId:string;accountId:string;revision:number;enabled:true}>;
  rollout:Readonly<{userId:string;accountId:string;revision:number;armed:true}>;
  switches:ExecutionKillSwitches;
  airlock:Readonly<{userId:string;accountId:string;intentId:string;idempotencyKey:string;result:ExecutionResult}>;
  network:Readonly<{mexcEgressAllowlisted:true}>;
}>;

/** Derives the write gate from independently read server evidence. Callers cannot
 * supply an authority boolean bag: identity, freshness and every revision are
 * compared with the exact canonical intent immediately before signing. */
export function composeMexcPreWriteAuthority(intent:MexcExecutionIntent,e:MexcPreWriteEvidence,now=Date.now()):MexcWriteAuthority {
  const identity=(x:{userId:string;accountId:string})=>x.userId===intent.userId&&x.accountId===intent.accountId;
  const fresh=(value:string)=>{const end=Date.parse(value);return Number.isFinite(end)&&end>=now;};
  const callerAssured=identity(e.caller)&&e.caller.totpAssured===true;
  const ownerBound=identity(e.ownership)&&e.ownership.bindingGeneration===intent.bindingGeneration;
  const ownershipFresh=ownerBound&&fresh(e.ownership.freshUntil);
  const reconciliationClean=identity(e.reconciliation)&&e.reconciliation.clean===true&&fresh(e.reconciliation.freshUntil)&&e.reconciliation.revision===intent.reconciliationRevision&&e.reconciliation.positionId===intent.positionId&&e.reconciliation.positionSide===intent.positionSide&&e.reconciliation.positionMode===intent.positionMode&&e.reconciliation.positionVolume===intent.positionVolume;
  const riskEnabled=identity(e.risk)&&e.risk.enabled===true&&e.risk.revision===intent.riskRevision;
  const rolloutArmed=identity(e.rollout)&&e.rollout.armed===true&&e.rollout.revision===intent.rolloutRevision;
  const preview=e.airlock.result.preview;
  const airlockPrepared=identity(e.airlock)&&e.airlock.intentId===intent.intentId&&e.airlock.idempotencyKey===intent.idempotencyKey&&e.airlock.result.intentId===intent.intentId&&e.airlock.result.idempotencyKey===intent.idempotencyKey&&e.airlock.result.state==="prepared"&&e.airlock.result.executed===false&&preview!==null&&preview.symbol===intent.symbol&&preview.side===intent.positionSide&&preview.normalizedContractVolume===intent.volume&&preview.leverage===intent.leverage&&preview.reduceOnly===true&&preview.referencePrice===intent.referencePrice&&preview.estimatedNotional===intent.estimatedNotional&&(!Object.hasOwn(preview,"price")||preview.price===intent.price);
  return Object.freeze({callerAssured,ownerBound,ownershipFresh,reconciliationClean,riskEnabled,rolloutArmed,killSwitchesClear:executionKillSwitchReason(e.switches,intent)===null,airlockPrepared,networkAllowlisted:e.network.mexcEgressAllowlisted===true});
}
