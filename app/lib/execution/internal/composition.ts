import "server-only";

import { createProductionExecutionControlStore } from "./control-store";
import { InternalExecutionBoundary } from "./boundary-service";
import { createProductionExecutionStateStore } from "./state-store";
import { createProductionExecutionAuditStore } from "./audit-store";
import { verifyProductionExecutionCaller } from "./caller-assertion";

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
    environment: process.env,
  });
};
