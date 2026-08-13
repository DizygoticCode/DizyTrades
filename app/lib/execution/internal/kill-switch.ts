import "server-only";

import type { ExecutionBlockCode } from "../types";

export type ExecutionKillSwitches = Readonly<{
  armed: boolean;
  globalDisabled: boolean;
  disabledUserIds: ReadonlySet<string>;
  disabledAccountKeys: ReadonlySet<string>;
  providerStateFresh: boolean;
  maintenance: boolean;
  emergencyStop: boolean;
}>;

/** Collision-free, user-scoped identity for an execution account. */
export const executionAccountKey = (identity: Readonly<{ userId: string; accountId: string }>): string =>
  JSON.stringify([identity.userId, identity.accountId]);

export function executionKillSwitchReason(
  switches: ExecutionKillSwitches,
  identity: Readonly<{ userId: string; accountId: string }>,
): ExecutionBlockCode | null {
  if (switches.emergencyStop) return "EMERGENCY_STOP";
  if (switches.maintenance) return "MAINTENANCE_STOP";
  if (switches.globalDisabled) return "GLOBAL_EXECUTION_DISABLED";
  if (switches.disabledUserIds.has(identity.userId)) return "USER_EXECUTION_DISABLED";
  if (switches.disabledAccountKeys.has(executionAccountKey(identity))) return "ACCOUNT_EXECUTION_DISABLED";
  if (!switches.armed) return "EXECUTION_DISARMED";
  if (!switches.providerStateFresh) return "PROVIDER_STATE_STALE";
  return null;
}

export function defaultExecutionKillSwitches(): ExecutionKillSwitches {
  return Object.freeze({
    armed: false,
    globalDisabled: true as const,
    disabledUserIds: new Set<string>(),
    disabledAccountKeys: new Set<string>(),
    providerStateFresh: false,
    maintenance: false,
    emergencyStop: false,
  });
}
