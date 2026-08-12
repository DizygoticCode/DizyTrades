import "server-only";

import type { ExecutionBlockCode } from "../types";

export type ExecutionKillSwitches = Readonly<{
  globalDisabled: boolean;
  disabledUserIds: ReadonlySet<string>;
  disabledAccountIds: ReadonlySet<string>;
  providerStateFresh: boolean;
  maintenance: boolean;
  emergencyStop: boolean;
}>;

export function executionKillSwitchReason(
  switches: ExecutionKillSwitches,
  identity: Readonly<{ userId: string; accountId: string }>,
): ExecutionBlockCode | null {
  if (switches.emergencyStop) return "EMERGENCY_STOP";
  if (switches.maintenance) return "MAINTENANCE_STOP";
  if (switches.globalDisabled) return "GLOBAL_EXECUTION_DISABLED";
  if (switches.disabledUserIds.has(identity.userId)) return "USER_EXECUTION_DISABLED";
  if (switches.disabledAccountIds.has(identity.accountId)) return "ACCOUNT_EXECUTION_DISABLED";
  if (!switches.providerStateFresh) return "PROVIDER_STATE_STALE";
  return null;
}

export function defaultExecutionKillSwitches(): ExecutionKillSwitches {
  return Object.freeze({
    globalDisabled: true as const,
    disabledUserIds: new Set<string>(),
    disabledAccountIds: new Set<string>(),
    providerStateFresh: false,
    maintenance: false,
    emergencyStop: false,
  });
}
