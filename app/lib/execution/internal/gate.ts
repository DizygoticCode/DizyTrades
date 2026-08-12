import "server-only";

export type ExecutionCapabilityGate = Readonly<{
  configured: boolean;
  enabled: false;
  reason: "absent" | "disabled" | "malformed" | "adapter-unavailable";
}>;

/**
 * This airlock has no write-capable adapter. Even the sole recognised legacy
 * value cannot enable execution; it reports adapter-unavailable and fails shut.
 */
export function executionCapabilityGate(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ExecutionCapabilityGate {
  const value = environment.LIVE_TRADING_ENABLED;
  if (value === undefined) return Object.freeze({ configured: false, enabled: false, reason: "absent" });
  if (value === "false") return Object.freeze({ configured: true, enabled: false, reason: "disabled" });
  if (value === "true") return Object.freeze({ configured: true, enabled: false, reason: "adapter-unavailable" });
  return Object.freeze({ configured: true, enabled: false, reason: "malformed" });
}
