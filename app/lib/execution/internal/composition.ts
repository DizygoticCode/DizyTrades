import "server-only";

import { createProductionExecutionControlStore } from "./control-store";
import { InternalExecutionBoundary } from "./boundary-service";
import { createProductionExecutionStateStore } from "./state-store";
import { createProductionExecutionAuditStore } from "./audit-store";
import { verifyProductionExecutionCaller } from "./caller-assertion";
import { createProductionExecutionRiskStore } from "./risk-store";
import { createProductionExecutionReconciliationStore } from "./reconciliation-store";

/**
 * Production composition root. The assertion verifier remains unreachable from
 * public routes; controls and the non-executing adapter stay authoritative.
 */
export const createServerExecutionBoundary = (): InternalExecutionBoundary => {
  const controls = createProductionExecutionControlStore();
  return new InternalExecutionBoundary({
    authenticateInternalCaller: verifyProductionExecutionCaller,
    readKillSwitches: () => controls.switches(),
    executionStateStore: createProductionExecutionStateStore(),
    executionAuditStore: createProductionExecutionAuditStore(),
    executionRiskStore: createProductionExecutionRiskStore(),
    executionReconciliationStore: createProductionExecutionReconciliationStore(),
    environment: process.env,
  });
};
