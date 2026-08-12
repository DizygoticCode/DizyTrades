import "server-only";

import { createServerExecutionBoundary } from "./internal/composition";

/**
 * The sole application-facing entry to the non-executing airlock.
 *
 * Construction and dependencies stay in the server-owned composition root so
 * application callers cannot replace authentication, kill switches, the
 * environment, the clock, or the process-local idempotency store.
 */
export const executionBoundary = createServerExecutionBoundary();
