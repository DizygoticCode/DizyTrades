import "server-only";

import { createProductionExecutionControlStore } from "./control-store";
import { InternalExecutionBoundary } from "./boundary-service";
import { createProductionExecutionStateStore } from "./state-store";
import { createProductionExecutionAuditStore } from "./audit-store";
import { verifyProductionExecutionCaller } from "./caller-assertion";
import { createProductionExecutionRiskStore } from "./risk-store";
import { createProductionExecutionReconciliationStore } from "./reconciliation-store";
import { createProductionReconciliationOrchestrator } from "./production-reconciliation";
import type { ExecutionBoundaryRequest, ExecutionBoundaryResponse } from "../types";

/**
 * Production composition root. The assertion verifier remains unreachable from
 * public routes; controls and the non-executing adapter stay authoritative.
 */
export type ServerExecutionBoundary = Readonly<{ preview(request: ExecutionBoundaryRequest): Promise<ExecutionBoundaryResponse> }>;

export const createServerExecutionBoundary = (): ServerExecutionBoundary => {
  const controls = createProductionExecutionControlStore();
  const reconciliationStore = createProductionExecutionReconciliationStore();
  const boundary = new InternalExecutionBoundary({
    authenticateInternalCaller: verifyProductionExecutionCaller,
    readKillSwitches: () => controls.switches(),
    executionStateStore: createProductionExecutionStateStore(),
    executionAuditStore: createProductionExecutionAuditStore(),
    executionRiskStore: createProductionExecutionRiskStore(),
    executionReconciliationStore: reconciliationStore,
    environment: process.env,
  });
  const reconcile = createProductionReconciliationOrchestrator(reconciliationStore);
  return Object.freeze({
    async preview(request: ExecutionBoundaryRequest) {
      // The assertion is verified here before its exact trusted pair is allowed to
      // select Radar or reconciliation state; the boundary verifies it again.
      const caller = verifyProductionExecutionCaller(request.callerAssertion);
      if (caller && caller.userId === request.userId && caller.accountId === request.accountId) {
        try { await reconcile(Object.freeze({ userId: caller.userId, accountId: caller.accountId })); }
        catch { /* The boundary's durable read converts orchestration failure to a bounded block. */ }
      }
      return boundary.preview(request);
    },
  });
};
