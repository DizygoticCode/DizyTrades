import "server-only";

import {
  InternalExecutionBoundary,
  type ExecutionBoundaryDependencies,
} from "./boundary-service";
import { createInMemoryExecutionStateStoreForTests } from "./state-store";

export type TestExecutionBoundaryDependencies =
  Omit<ExecutionBoundaryDependencies, "executionStateStore">
  & Readonly<{ executionStateStore?: ExecutionBoundaryDependencies["executionStateStore"] }>;

/**
 * Test-only dependency-injection seam; production application imports are forbidden.
 * The default test store is SQLite in-memory, never the production process-local Map.
 */
export const createTestExecutionBoundary = (
  dependencies: TestExecutionBoundaryDependencies,
): InternalExecutionBoundary => new InternalExecutionBoundary({
  ...dependencies,
  executionStateStore: dependencies.executionStateStore ?? createInMemoryExecutionStateStoreForTests(),
});
