export const FIRST_RUN_ONBOARDING_VERSION = 1;
export const FIRST_RUN_ONBOARDING_COMPLETE = "complete";

export type FirstRunOnboardingPath = {
  id: "explore" | "learn" | "paper";
  eyebrow: string;
  title: string;
  description: string;
  action: string;
};

export const FIRST_RUN_ONBOARDING_PATHS: readonly FirstRunOnboardingPath[] = [
  {
    id: "explore",
    eyebrow: "Observe",
    title: "Explore markets",
    description:
      "Stay in the terminal, choose a market and timeframe, then use DizyBrain and DizyFlow to understand what the chart is showing.",
    action: "Continue to terminal",
  },
  {
    id: "learn",
    eyebrow: "Learn",
    title: "Follow DizyAcademy",
    description:
      "Start with the guided curriculum and learn the exact charting, signal, order-flow, simulation and review workflow used by DizyTrades.",
    action: "Open DizyAcademy",
  },
  {
    id: "paper",
    eyebrow: "Practise",
    title: "Try DizyPaper",
    description:
      "Open the Manual Paper panel and practise sizing, leverage, stops, targets and review using simulated funds only.",
    action: "Open Manual Paper",
  },
] as const;

export function firstRunOnboardingStorageKey(userId: string) {
  const identity = userId.trim() || "unknown";
  return `dizytrades:first-run-onboarding:v${FIRST_RUN_ONBOARDING_VERSION}:${encodeURIComponent(identity)}`;
}

export function hasCompletedFirstRunOnboarding(
  storage: Pick<Storage, "getItem">,
  userId: string,
) {
  return (
    storage.getItem(firstRunOnboardingStorageKey(userId)) ===
    FIRST_RUN_ONBOARDING_COMPLETE
  );
}

export function completeFirstRunOnboarding(
  storage: Pick<Storage, "setItem">,
  userId: string,
) {
  storage.setItem(
    firstRunOnboardingStorageKey(userId),
    FIRST_RUN_ONBOARDING_COMPLETE,
  );
}
