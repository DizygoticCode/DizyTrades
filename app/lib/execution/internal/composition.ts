import "server-only";

import { createProductionExecutionControlStore } from "./control-store";
import { InternalExecutionBoundary } from "./boundary-service";
import { createProductionExecutionStateStore } from "./state-store";
import { createProductionExecutionAuditStore } from "./audit-store";
import { verifyProductionExecutionCaller } from "./caller-assertion";
import { createProductionExecutionRiskStore } from "./risk-store";
import { createProductionExecutionReconciliationStore } from "./reconciliation-store";
import { createProductionReconciliationOrchestrator } from "./production-reconciliation";
import { createProductionExecutionOwnershipStore } from "./ownership-store";
import type { ExecutionBoundaryRequest, ExecutionBoundaryResponse } from "../types";

/**
 * Production composition root. The assertion verifier remains unreachable from
 * public routes; controls and the non-executing adapter stay authoritative.
 */
export type ServerExecutionBoundary = Readonly<{ preview(request: ExecutionBoundaryRequest): Promise<ExecutionBoundaryResponse> }>;

export const createServerExecutionBoundary = (): ServerExecutionBoundary => {
  const controls = createProductionExecutionControlStore();
  const executionStateStore = createProductionExecutionStateStore();
  const executionAuditStore = createProductionExecutionAuditStore();
  const executionRiskStore = createProductionExecutionRiskStore();
  const reconciliationStore = createProductionExecutionReconciliationStore();
  const ownershipStore = createProductionExecutionOwnershipStore();
  const reconcile = createProductionReconciliationOrchestrator(reconciliationStore);

  return Object.freeze({
    async preview(request: ExecutionBoundaryRequest) {
      // Snapshot the identity-bearing fields before any asynchronous Radar work.
      // The production caller assertion is single-use, so consume it exactly once
      // here and pass that already-authenticated caller into a per-request boundary
      // verifier rather than consuming the same assertion a second time.
      const requestSnapshot = structuredClone(request);
      const stableRequest = Object.freeze({
        ...requestSnapshot,
        callerAssertion: Object.freeze({ ...requestSnapshot.callerAssertion }),
        userId: requestSnapshot.userId,
        accountId: requestSnapshot.accountId,
      });
      const caller = verifyProductionExecutionCaller(stableRequest.callerAssertion);

      if (caller && caller.userId === stableRequest.userId && caller.accountId === stableRequest.accountId) {
        try { await reconcile(Object.freeze({ userId: caller.userId, accountId: caller.accountId })); }
        catch { /* The boundary's durable read converts orchestration failure to a bounded block. */ }
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
        executionReconciliationStore: reconciliationStore,
        environment: process.env,
      });

      return boundary.preview(stableRequest);
    },
  });
};
