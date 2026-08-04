import "server-only";

import {
  MexcAccountStateError,
  type MexcAccountStateSnapshot,
} from "./mexc-account-state";
import {
  classifyMexcAccountFailure,
  type MexcAccountAvailabilityState,
  type MexcAccountFailure,
} from "./mexc-account-state-availability";
import {
  MexcAccountRiskContextError,
  buildMexcAccountRiskContext,
  type MexcAccountRiskContextSnapshot,
} from "./mexc-account-risk-context";
import { requestMexcPrivateRead } from "./mexc-private-readonly";
import { requireMexcReadOnlyCredentials } from "./mexc-readonly-credential-activation";
import {
  refreshOwnerMexcAccountSnapshot,
  type MexcOwnerAccountSnapshotRefreshResult,
} from "./mexc-owner-account-snapshot";

export const MEXC_OWNER_ACCOUNT_COMPANION_POLICY_VERSION =
  "mexc-owner-account-companion/1.0.0" as const;

export type MexcOwnerRiskContextState =
  | Readonly<{
      status: "fresh";
      displayEligible: true;
      informationalOnly: true;
      snapshot: MexcAccountRiskContextSnapshot;
      failure: null;
    }>
  | Readonly<{
      status: "not-applicable";
      displayEligible: true;
      informationalOnly: true;
      reason: "no-open-positions";
      snapshot: null;
      failure: null;
    }>
  | Readonly<{
      status: "blocked";
      displayEligible: false;
      informationalOnly: true;
      reason: "account-state-not-fresh";
      snapshot: null;
      failure: null;
    }>
  | Readonly<{
      status: "unavailable";
      displayEligible: false;
      informationalOnly: true;
      snapshot: null;
      failure: MexcAccountFailure;
    }>;

export type MexcOwnerAccountCompanionRefreshResult = Readonly<{
  policyVersion: typeof MEXC_OWNER_ACCOUNT_COMPANION_POLICY_VERSION;
  accountScope: "owner";
  account: MexcOwnerAccountSnapshotRefreshResult;
  risk: MexcOwnerRiskContextState;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

type RefreshInput = Readonly<{
  previousAccount?: MexcAccountAvailabilityState | null;
  environment?: Environment;
  maxAccountAgeMs?: number;
  receiveWindowSeconds?: number;
  timeoutMs?: number;
}>;

type RefreshDependencies = Readonly<{
  fetch?: typeof fetch;
  now?: () => number;
}>;

function output(
  account: MexcOwnerAccountSnapshotRefreshResult,
  risk: MexcOwnerRiskContextState,
): MexcOwnerAccountCompanionRefreshResult {
  return Object.freeze({
    policyVersion: MEXC_OWNER_ACCOUNT_COMPANION_POLICY_VERSION,
    accountScope: "owner" as const,
    account,
    risk,
  });
}

function freshAccountSnapshot(
  state: MexcAccountAvailabilityState,
): MexcAccountStateSnapshot | null {
  return state.status === "fresh" ? state.snapshot : null;
}

function schemaFailure(error: MexcAccountRiskContextError) {
  return new MexcAccountStateError("invalid-read-result", error.message);
}

export async function refreshOwnerMexcAccountCompanion(
  input: RefreshInput = {},
  dependencies: RefreshDependencies = {},
): Promise<MexcOwnerAccountCompanionRefreshResult> {
  const environment = input.environment ?? process.env;
  const now = dependencies.now ?? Date.now;
  const account = await refreshOwnerMexcAccountSnapshot(
    {
      previous: input.previousAccount ?? null,
      environment,
      maxAgeMs: input.maxAccountAgeMs,
      receiveWindowSeconds: input.receiveWindowSeconds,
      timeoutMs: input.timeoutMs,
    },
    dependencies,
  );
  const snapshot = freshAccountSnapshot(account.state);
  if (!snapshot) {
    return output(
      account,
      Object.freeze({
        status: "blocked" as const,
        displayEligible: false as const,
        informationalOnly: true as const,
        reason: "account-state-not-fresh" as const,
        snapshot: null,
        failure: null,
      }),
    );
  }
  if (snapshot.positions.length === 0) {
    return output(
      account,
      Object.freeze({
        status: "not-applicable" as const,
        displayEligible: true as const,
        informationalOnly: true as const,
        reason: "no-open-positions" as const,
        snapshot: null,
        failure: null,
      }),
    );
  }

  try {
    const credentials = requireMexcReadOnlyCredentials(environment);
    const read = await requestMexcPrivateRead(
      {
        endpoint: "risk-limits",
        credentials,
        receiveWindowSeconds: input.receiveWindowSeconds,
        timeoutMs: input.timeoutMs,
      },
      dependencies,
    );
    const riskSnapshot = buildMexcAccountRiskContext({
      accountSnapshot: snapshot,
      read,
    });
    return output(
      account,
      Object.freeze({
        status: "fresh" as const,
        displayEligible: true as const,
        informationalOnly: true as const,
        snapshot: riskSnapshot,
        failure: null,
      }),
    );
  } catch (error) {
    const classified =
      error instanceof MexcAccountRiskContextError
        ? schemaFailure(error)
        : error;
    return output(
      account,
      Object.freeze({
        status: "unavailable" as const,
        displayEligible: false as const,
        informationalOnly: true as const,
        snapshot: null,
        failure: classifyMexcAccountFailure(classified, now()),
      }),
    );
  }
}
