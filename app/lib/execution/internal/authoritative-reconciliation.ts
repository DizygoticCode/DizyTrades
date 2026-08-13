import "server-only";

import { MEXC_PROVIDER_READBACK_MAX_AGE_MS, MEXC_PROVIDER_READBACK_VERSION, type MexcProviderAccountRiskReadback } from "../../mexc-provider-readback";
import type { ExecutionAccountIdentity, ExecutionReconciliationStore, ReconciliationReason } from "./reconciliation-store";

export type AuthoritativeReconciliationResult = Readonly<{ status:"clean"|"quarantined"; reason:ReconciliationReason; revision:number; executed:false }>;

/** Reconciles only the normalized output contract produced by MEXC Radar. */
export function reconcileAuthoritativeMexcReadback(store:ExecutionReconciliationStore, identity:ExecutionAccountIdentity, observation:unknown, now=new Date()):AuthoritativeReconciliationResult {
  const state=store.read(identity);
  let reason: ReconciliationReason = "OBSERVATION_INVALID";
  let observedAt: string | undefined;
  if(observation && typeof observation==="object") {
    const readback=observation as Partial<MexcProviderAccountRiskReadback>;
    if(readback.userId!==identity.userId||readback.accountId!==identity.accountId) reason="IDENTITY_MISMATCH";
    else if(readback.version!==MEXC_PROVIDER_READBACK_VERSION||readback.provider!=="mexc"||readback.settlementCurrency!=="USDT"||!Array.isArray(readback.positions)) reason="OBSERVATION_INVALID";
    else if(!Number.isFinite(Date.parse(String(readback.observedAt)))||now.getTime()-Date.parse(String(readback.observedAt))<0||now.getTime()-Date.parse(String(readback.observedAt))>MEXC_PROVIDER_READBACK_MAX_AGE_MS) reason="OBSERVATION_STALE";
    else {
      observedAt=new Date(String(readback.observedAt)).toISOString();
      const observed=readback.positions;
      const valid=observed.every(p=>p&&/^[A-Z0-9]{1,20}_USDT$/.test(p.symbol)&&(p.side==="long"||p.side==="short")&&Number.isFinite(p.contractVolume)&&p.contractVolume>0);
      const duplicate=new Set(observed.map(p=>`${p.symbol}:${p.side}`)).size!==observed.length;
      if(!valid) reason="OBSERVATION_INVALID"; else if(duplicate) reason="POSITION_AMBIGUOUS"; else {
        const expected=state.expected;
        if(expected.length===0&&observed.length===0) reason="CLEAN";
        else if(expected.length===0) reason="UNEXPECTED_PROVIDER_POSITION";
        else if(observed.length===0) reason="EXPECTED_POSITION_MISSING";
        else {
          reason="CLEAN";
          for(const expectedPosition of expected) {
            const sameSymbol=observed.filter(p=>p.symbol===expectedPosition.symbol);
            if(sameSymbol.length===0){reason="EXPECTED_POSITION_MISSING";break;}
            if(sameSymbol.length!==1){reason="POSITION_AMBIGUOUS";break;}
            if(sameSymbol[0].side!==expectedPosition.side){reason="POSITION_SIDE_MISMATCH";break;}
            // Both contracts deliberately use contract quantity; no tolerance is applied.
            if(sameSymbol[0].contractVolume!==expectedPosition.contractVolume){reason="POSITION_QUANTITY_MISMATCH";break;}
          }
          if(reason==="CLEAN"&&observed.length!==expected.length) reason="UNEXPECTED_PROVIDER_POSITION";
        }
      }
    }
  }
  const recorded=store.record(identity,reason,state.revision,observedAt);
  return Object.freeze({status:recorded.status==="clean"?"clean":"quarantined",reason:recorded.reason as ReconciliationReason,revision:recorded.revision,executed:false});
}
