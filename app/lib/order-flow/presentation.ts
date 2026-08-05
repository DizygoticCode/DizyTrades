import type { FlowStatus } from "./types.ts";

const WARMING_STATUSES = new Set<FlowStatus>([
  "Connecting",
  "Subscribing",
  "LoadingSnapshot",
  "Bridging",
]);

const RECOVERY_STATUSES = new Set<FlowStatus>([
  "Delayed",
  "Stale",
  "Recovering",
  "Offline",
]);

export type FlowPresentation = {
  statusLabel: string;
  metricLabel: string;
  recovering: boolean;
};

/**
 * Keeps transport recovery explicit instead of presenting a temporary
 * confidence percentage as though the market analysis itself collapsed.
 */
export function flowPresentation({
  enabled,
  status,
  confidence,
  hasValidBook,
  lastValidUpdate,
}: {
  enabled: boolean;
  status: FlowStatus;
  confidence: number | null;
  hasValidBook: boolean;
  lastValidUpdate: number | null;
}): FlowPresentation {
  if (!enabled)
    return { statusLabel: "Off", metricLabel: "—", recovering: false };

  if (status === "Live")
    return {
      statusLabel: "Live",
      metricLabel: confidence === null ? "WARM" : `${Math.round(confidence)}%`,
      recovering: false,
    };

  if (WARMING_STATUSES.has(status))
    return { statusLabel: status, metricLabel: "WARM", recovering: false };

  if (
    RECOVERY_STATUSES.has(status) &&
    hasValidBook &&
    lastValidUpdate !== null
  )
    return {
      statusLabel: "Recovering",
      metricLabel: "SYNC",
      recovering: true,
    };

  return {
    statusLabel: status,
    metricLabel: status === "Error" ? "ERROR" : "WAIT",
    recovering: false,
  };
}
