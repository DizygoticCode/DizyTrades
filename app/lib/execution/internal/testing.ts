import "server-only";

import {
  InternalExecutionBoundary,
  type ExecutionBoundaryDependencies,
} from "./boundary-service";

/** Test-only dependency-injection seam; production application imports are forbidden. */
export const createTestExecutionBoundary = (
  dependencies: ExecutionBoundaryDependencies,
): InternalExecutionBoundary => new InternalExecutionBoundary(dependencies);
