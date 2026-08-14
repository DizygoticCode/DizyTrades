import "server-only";

import { createProductionExecutionControlStore } from "./control-store";
import { InternalExecutionBoundary } from "./boundary-service";
import { createProductionExecutionStateStore } from "./state-store";
import { createProductionExecutionAuditStore } from "./audit-store";
import { verifyProductionExecutionCaller } from "./caller-assertion";
import { createProductionExecutionRiskStore } from "./risk-store";
import { executionKillSwitchReason } from "./kill-switch";
import { readProductionExecutionOwnershipBinding } from "./ownership-binding";
import { createProductionExecutionOwnershipStore } from "./ownership-store";
import { createProductionOwnershipProofOrchestrator } from "./ownership-ceremony";
import { createProductionExecutionReconciliationStore } from "./reconciliation-store";
import { createProductionReconciliationOrchestrator } from "./production-reconciliation";
import { MEXC_PROVIDER_READBACK_MAX_AGE_MS } from "../../mexc-provider-readback";
import type { ExecutionBoundaryRequest, ExecutionBoundaryResponse } from "../types";

/** Production composition remains server-only and non-executing. */
export type ServerExecutionBoundary = Readonly<{
  preview(request: ExecutionBoundaryRequest): Promise<ExecutionBoundaryResponse>;
}>;

export const createServerExecutionBoundary = (): ServerExecutionBoundary => {
  const controls = createProductionExecutionControlStore();
  const executionStateStore = createProductionExecutionStateStore();
  const executionAuditStore = createProductionExecutionAuditStore();
  const executionRiskStore = createProductionExecutionRiskStore();
  const ownershipStore = createProductionExecutionOwnershipStore();
  const proveOwnership = createProductionOwnershipProofOrchestrator(ownershipStore);
  const reconciliationStore = createProductionExecutionReconciliationStore();
  const reconcile = createProductionReconciliationOrchestrator(reconciliationStore);

  return Object.freeze({
    async preview(request: ExecutionBoundaryRequest) {
      const requestSnapshot = structuredClone(request);
      const stableRequest = Object.freeze({
        ...requestSnapshot,
        callerAssertion: Object.freeze({ ...requestSnapshot.callerAssertion }),
        userId: requestSnapshot.userId,
        accountId: requestSnapshot.accountId,
      });
      const caller = verifyProductionExecutionCaller(stableRequest.callerAssertion);

      if (caller && caller.userId === stableRequest.userId && caller.accountId === stableRequest.accountId) {
        // Never perform even GET-only provider work while a stronger operational
        // brake is already active. Boundary evaluation below remains authoritative.
        let providerReadsAllowed = false;
        try { providerReadsAllowed = executionKillSwitchReason(controls.switches(), caller) === null; }
        catch { providerReadsAllowed = false; }

        if (providerReadsAllowed) {
          try { await proveOwnership(caller); } catch { /* boundary converts durable state to a block */ }
          try {
            const binding = readProductionExecutionOwnershipBinding();
            const ownership = ownershipStore.read(caller);
            const proofAge = ownership.proofObservedAt === null
              ? Number.POSITIVE_INFINITY
              : Date.now() - Date.parse(ownership.proofObservedAt);
            if (
              binding
              && binding.userId === caller.userId
              && binding.accountId === caller.accountId
              && ownership.status === "active"
              && ownership.bindingDigest === binding.bindingDigest
              && Number.isFinite(proofAge)
              && proofAge >= 0
              && proofAge <= MEXC_PROVIDER_READBACK_MAX_AGE_MS
            ) {
              await reconcile(Object.freeze({ userId: caller.userId, accountId: caller.accountId }));
            }
          } catch { /* fail closed in the boundary */ }
        }
      }

      const boundary = new InternalExecutionBoundary({
        authenticateInternalCaller: (assertion) => caller
          && assertion.callerId === stableRequest.callerAssertion.callerId
          && assertion.assertionId === stableRequest.callerAssertion.assertionId
          ? caller
          : null,
        readKillSwitches: () => controls.switches(),
        executionStateStore,
        executionAuditStore,
        executionRiskStore,
        executionOwnershipStore: ownershipStore,
        readOwnershipBinding: () => readProductionExecutionOwnershipBinding(),
        executionReconciliationStore: reconciliationStore,
        environment: process.env,
      });

      return boundary.preview(stableRequest);
    },
  });
};
