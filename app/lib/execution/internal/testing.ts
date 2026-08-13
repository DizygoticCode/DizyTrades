import "server-only";

import {
  InternalExecutionBoundary,
  type ExecutionBoundaryDependencies,
} from "./boundary-service";
import { createInMemoryExecutionStateStoreForTests } from "./state-store";
import { createInMemoryExecutionAuditStoreForTests } from "./audit-store";
import { SqliteExecutionRiskStore } from "./risk-store";

export type TestExecutionBoundaryDependencies =
  Omit<ExecutionBoundaryDependencies, "executionStateStore" | "executionAuditStore" | "executionRiskStore">
  & Readonly<{
    executionStateStore?: ExecutionBoundaryDependencies["executionStateStore"];
    executionAuditStore?: ExecutionBoundaryDependencies["executionAuditStore"];
    executionRiskStore?: ExecutionBoundaryDependencies["executionRiskStore"];
  }>;

/**
 * Test-only dependency-injection seam; production application imports are forbidden.
 * The default test store is SQLite in-memory, never the production process-local Map.
 */
export const createTestExecutionBoundary = (
  dependencies: TestExecutionBoundaryDependencies,
): InternalExecutionBoundary => new InternalExecutionBoundary({
  ...dependencies,
  executionStateStore: dependencies.executionStateStore ?? createInMemoryExecutionStateStoreForTests(),
  executionAuditStore: dependencies.executionAuditStore ?? createInMemoryExecutionAuditStoreForTests(),
  executionRiskStore: dependencies.executionRiskStore ?? new SqliteExecutionRiskStore(":memory:"),
});
