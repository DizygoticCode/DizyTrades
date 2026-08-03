export type WorkspaceKind = "terminal" | "scanner" | "structure" | "backup";
export type WorkspaceStateKind =
  | "empty"
  | "delayed"
  | "recovering"
  | "offline"
  | "error";
export type WorkspaceRecoveryAction = "retry" | "reload" | "focus-file" | "none";

export type WorkspaceStateObservation = Readonly<{
  statusText?: string;
  alertText?: string;
  emptyText?: string;
  chartRecoveryText?: string;
  domStatusText?: string;
  domMarketText?: string;
}>;

export type WorkspaceStateDescriptor = Readonly<{
  kind: WorkspaceStateKind;
  title: string;
  detail: string;
  preserved: string;
  action: WorkspaceRecoveryAction;
  actionLabel: string | null;
  fingerprint: string;
}>;

const tidy = (value: string | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();
const lower = (value: string | undefined) => tidy(value).toLowerCase();

const preservedByWorkspace: Record<WorkspaceKind, string> = {
  terminal:
    "Saved profile settings, DizyPaper positions and retained review evidence are not changed by a public-feed interruption.",
  scanner:
    "Existing scanner results and your saved watchlist remain available while a refresh is retried.",
  structure:
    "The last completed structure calculation remains visible; failed timeframes are not silently invented.",
  backup:
    "No account data changes until a fresh dry-run passes and RESTORE is explicitly confirmed.",
};

function descriptor(
  workspace: WorkspaceKind,
  kind: WorkspaceStateKind,
  title: string,
  detail: string,
  action: WorkspaceRecoveryAction,
  actionLabel: string | null,
): WorkspaceStateDescriptor {
  return {
    kind,
    title,
    detail,
    preserved: preservedByWorkspace[workspace],
    action,
    actionLabel,
    fingerprint: `${workspace}:${kind}:${title}:${detail}`,
  };
}

export function classifyWorkspaceState(
  workspace: WorkspaceKind,
  observation: WorkspaceStateObservation,
): WorkspaceStateDescriptor | null {
  const status = tidy(observation.statusText);
  const statusLower = lower(observation.statusText);
  const alert = tidy(observation.alertText);
  const alertLower = lower(observation.alertText);
  const empty = tidy(observation.emptyText);
  const emptyLower = lower(observation.emptyText);
  const chartRecovery = tidy(observation.chartRecoveryText);
  const domStatus = lower(observation.domStatusText);
  const domMarket = tidy(observation.domMarketText);
  const domMarketLower = domMarket.toLowerCase();

  if (chartRecovery) {
    return descriptor(
      workspace,
      "error",
      "Chart update interrupted",
      "The current chart could not apply an update cleanly. Reload the chart before relying on the latest visual state.",
      "retry",
      "Reload chart",
    );
  }

  if (alert) {
    if (workspace === "backup") {
      const chooseAnother =
        alertLower.includes("not a supported") ||
        alertLower.includes("could not be read") ||
        alertLower.includes("exceeds the 100 mb");
      return descriptor(
        workspace,
        "error",
        chooseAnother ? "Backup file rejected safely" : "Recovery needs attention",
        alert,
        chooseAnother ? "focus-file" : "retry",
        chooseAnother ? "Choose another backup" : "Retry recovery check",
      );
    }
    return descriptor(
      workspace,
      "error",
      "Workspace action failed",
      alert,
      "retry",
      "Retry",
    );
  }

  if (workspace === "terminal") {
    if (domStatus.includes("offline")) {
      return descriptor(
        workspace,
        "offline",
        "DizyFlow feed offline",
        "Live public depth is unavailable. The ladder must not be treated as current until a fresh envelope is received.",
        "reload",
        "Reload market data",
      );
    }
    if (domStatus.includes("stale") || domStatus.includes("delayed")) {
      return descriptor(
        workspace,
        "delayed",
        "DizyFlow data delayed",
        "The latest depth snapshot is older than the freshness threshold and is explicitly marked stale.",
        "reload",
        "Reload market data",
      );
    }
    if (domStatus.includes("recover") || domStatus.includes("connect")) {
      return descriptor(
        workspace,
        "recovering",
        "DizyFlow reconnecting",
        "The public depth stream is rebuilding its validated book. Wait for LIVE before treating the ladder as current.",
        "reload",
        "Restart connection",
      );
    }
    if (
      domMarketLower.includes("empty book") ||
      domMarketLower.includes("invalid book") ||
      domMarketLower.includes("one-sided book") ||
      domMarketLower.includes("crossed or locked book")
    ) {
      return descriptor(
        workspace,
        "empty",
        "Depth book incomplete",
        domMarket || "A complete two-sided public order book is not currently available.",
        "reload",
        "Reload market data",
      );
    }
  }

  if (workspace === "backup" && statusLower.includes("dry-run found conflicts")) {
    return descriptor(
      workspace,
      "error",
      "Recovery blocked safely",
      "The dry-run found conflicts and changed nothing. Review the listed conflicts or choose a different backup.",
      "focus-file",
      "Choose another backup",
    );
  }

  if (
    statusLower.includes("initialization failed") ||
    statusLower.includes("refresh failed") ||
    statusLower.includes("could not be opened") ||
    statusLower.includes("could not be saved") ||
    statusLower.includes("dry-run failed") ||
    statusLower.includes("restore failed")
  ) {
    return descriptor(
      workspace,
      "error",
      workspace === "backup" ? "Recovery action failed" : "Workspace refresh failed",
      status || "The requested workspace action did not complete.",
      workspace === "backup" ? "retry" : "retry",
      workspace === "scanner"
        ? "Retry scanner"
        : workspace === "structure"
          ? "Retry structure"
          : workspace === "backup"
            ? "Retry recovery check"
            : "Retry",
    );
  }

  const catalogueUnavailable =
    statusLower.includes("market catalogue is unavailable") ||
    statusLower.includes("mexc market catalogue is unavailable");
  const wholeFeedUnavailable =
    statusLower === "feed unavailable" ||
    statusLower.includes("depth stream unavailable") ||
    statusLower.includes("no valid depth book");
  if (catalogueUnavailable || wholeFeedUnavailable) {
    return descriptor(
      workspace,
      "offline",
      catalogueUnavailable ? "Market catalogue unavailable" : "Public feed unavailable",
      status || "The public market-data source is currently unavailable.",
      "retry",
      workspace === "scanner"
        ? "Retry scanner"
        : workspace === "structure"
          ? "Retry structure"
          : "Retry feed",
    );
  }

  if (
    statusLower.includes("retrying") ||
    statusLower.includes("reconnecting") ||
    statusLower.includes("recovering")
  ) {
    return descriptor(
      workspace,
      "recovering",
      "Recovery in progress",
      status,
      "none",
      null,
    );
  }

  if (statusLower.includes("delayed") || statusLower.includes("stale")) {
    return descriptor(
      workspace,
      "delayed",
      "Data is delayed",
      status,
      "retry",
      workspace === "scanner"
        ? "Refresh scanner"
        : workspace === "structure"
          ? "Refresh structure"
          : "Retry feed",
    );
  }

  if (
    emptyLower.includes("no markets match") ||
    emptyLower.includes("no confirmed candles") ||
    statusLower.includes("no market selected")
  ) {
    return descriptor(
      workspace,
      "empty",
      workspace === "scanner" ? "No scanner results" : "No confirmed structure data",
      empty || status || "No data matches the current workspace selection.",
      "retry",
      workspace === "scanner" ? "Refresh scanner" : "Refresh structure",
    );
  }

  return null;
}
