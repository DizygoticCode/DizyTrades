import "server-only";

import { defaultExecutionKillSwitches } from "./kill-switch";
import { InternalExecutionBoundary } from "./boundary-service";

/**
 * Production composition root. Authentication deliberately denies every call
 * until a separately reviewed server-internal assertion provider is wired.
 */
export const createServerExecutionBoundary = (): InternalExecutionBoundary =>
  new InternalExecutionBoundary({
    authenticateInternalCaller: () => null,
    readKillSwitches: defaultExecutionKillSwitches,
    environment: process.env,
  });
