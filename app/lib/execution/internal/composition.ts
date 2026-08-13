import "server-only";

import { createProductionExecutionControlStore } from "./control-store";
import { InternalExecutionBoundary } from "./boundary-service";
import { createProductionExecutionStateStore } from "./state-store";
import { createProductionExecutionAuditStore } from "./audit-store";

/**
 * Production composition root. Authentication deliberately denies every call
 * until a separately reviewed server-internal assertion provider is wired.
 */
export const createServerExecutionBoundary = (): InternalExecutionBoundary => {
  const controls = createProductionExecutionControlStore();
  return new InternalExecutionBoundary({
    authenticateInternalCaller: () => null,
    readKillSwitches: () => controls.switches(),
    executionStateStore: createProductionExecutionStateStore(),
    executionAuditStore: createProductionExecutionAuditStore(),
    environment: process.env,
  });
};
