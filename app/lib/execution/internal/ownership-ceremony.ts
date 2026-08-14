import "server-only";

import { readAuthoritativeMexcAccountRisk } from "../../mexc-provider-readback";
import type { ExecutionBoundaryRequest } from "../types";
import { verifyProductionExecutionCaller } from "./caller-assertion";
import { createProductionExecutionOwnershipStore, proveExecutionOwnership } from "./ownership-store";

type CeremonyRequest = Readonly<{
  callerAssertion: ExecutionBoundaryRequest["callerAssertion"];
  userId: string; accountId: string; expectedRevision: number;
}>;

/**
 * Private composition for an operator-controlled ceremony. It is intentionally
 * not imported by a route: every transition consumes an authenticated,
 * exact-account, single-use caller assertion.
 */
export function createProductionExecutionOwnershipCeremony() {
  const store=createProductionExecutionOwnershipStore();
  const authenticate=(request:CeremonyRequest)=>{
    const caller=verifyProductionExecutionCaller(request.callerAssertion);
    if(!caller||caller.userId!==request.userId||caller.accountId!==request.accountId) throw new Error("EXECUTION_OWNERSHIP_AUTHENTICATION_FAILED");
    return caller;
  };
  return Object.freeze({
    async prove(request:CeremonyRequest) {
      const caller=authenticate(request);
      return proveExecutionOwnership(store,caller,()=>readAuthoritativeMexcAccountRisk(caller),request.expectedRevision);
    },
    activate(request:CeremonyRequest) { const caller=authenticate(request); return store.activate(caller,request.expectedRevision); },
    revoke(request:CeremonyRequest) { const caller=authenticate(request); return store.revoke(caller,request.expectedRevision); },
  });
}
