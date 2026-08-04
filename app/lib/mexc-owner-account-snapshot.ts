import "server-only";

import {
  createMexcAccountNotConfiguredState,
  transitionMexcAccountAvailability,
  type MexcAccountAvailabilityState,
} from "./mexc-account-state-availability";
import {
  ingestMexcAccountState,
  type MexcAccountStateReadRequest,
  type MexcAccountStateReadResult,
} from "./mexc-account-state";
import {
  requestMexcPrivateRead,
  type MexcPrivateReadResult,
} from "./mexc-private-readonly";
import {
  readOwnerMexcConnectionControl,
  scrubMexcPrivateEnvironmentForLocalSeal,
  type MexcOwnerConnectionControlReport,
} from "./mexc-owner-connection-control";
import {
  buildMexcReadOnlyCredentialActivationReport,
  requireMexcReadOnlyCredentials,
  type MexcReadOnlyCredentialActivationReport,
} from "./mexc-readonly-credential-activation";

export const MEXC_OWNER_ACCOUNT_SNAPSHOT_POLICY_VERSION =
  "mexc-owner-account-snapshot/1.1.0" as const;
export const MEXC_OWNER_ACCOUNT_SNAPSHOT_MAX_AGE_MS = 15_000;
export const MEXC_OWNER_ACCOUNT_RECEIVE_WINDOW_SECONDS = 10;

export type MexcOwnerAccountSnapshotRefreshResult = Readonly<{
  policyVersion: typeof MEXC_OWNER_ACCOUNT_SNAPSHOT_POLICY_VERSION;
  accountScope: "owner";
  connectionControl: MexcOwnerConnectionControlReport;
  activation: MexcReadOnlyCredentialActivationReport;
  state: MexcAccountAvailabilityState;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

type RefreshInput = Readonly<{
  previous?: MexcAccountAvailabilityState | null;
  environment?: Environment;
  maxAgeMs?: number;
  receiveWindowSeconds?: number;
  timeoutMs?: number;
}>;

type RefreshDependencies = Readonly<{
  fetch?: typeof fetch;
  now?: () => number;
  readConnectionControl?: typeof readOwnerMexcConnectionControl;
}>;

function accountReadResult(
  requested: MexcAccountStateReadRequest,
  result: MexcPrivateReadResult,
): MexcAccountStateReadResult {
  if (
    result.endpoint !== requested.endpoint ||
    result.permission !== "trade-read"
  ) {
    throw new TypeError("MEXC account read provenance did not match the requested endpoint.");
  }
  return Object.freeze({
    endpoint: requested.endpoint,
    permission: "trade-read" as const,
    requestTimeMs: result.requestTimeMs,
    receivedAtMs: result.receivedAtMs,
    data: result.data,
  });
}

function result(
  connectionControl: MexcOwnerConnectionControlReport,
  activation: MexcReadOnlyCredentialActivationReport,
  state: MexcAccountAvailabilityState,
): MexcOwnerAccountSnapshotRefreshResult {
  return Object.freeze({
    policyVersion: MEXC_OWNER_ACCOUNT_SNAPSHOT_POLICY_VERSION,
    accountScope: "owner" as const,
    connectionControl,
    activation,
    state,
  });
}

export async function refreshOwnerMexcAccountSnapshot(
  input: RefreshInput = {},
  dependencies: RefreshDependencies = {},
): Promise<MexcOwnerAccountSnapshotRefreshResult> {
  const environment = input.environment ?? process.env;
  const now = dependencies.now ?? Date.now;
  const connectionControl = await (
    dependencies.readConnectionControl ?? readOwnerMexcConnectionControl
  )(environment);
  const evaluatedAtMs = now();

  if (connectionControl.localPrivateReadsBlocked) {
    const activation = buildMexcReadOnlyCredentialActivationReport(
      scrubMexcPrivateEnvironmentForLocalSeal(environment),
    );
    return result(
      connectionControl,
      activation,
      createMexcAccountNotConfiguredState(evaluatedAtMs),
    );
  }

  const activation = buildMexcReadOnlyCredentialActivationReport(environment);
  if (!activation.readyForPrivateReads) {
    return result(
      connectionControl,
      activation,
      createMexcAccountNotConfiguredState(evaluatedAtMs),
    );
  }

  const credentials = requireMexcReadOnlyCredentials(environment);
  const receiveWindowSeconds =
    input.receiveWindowSeconds ?? MEXC_OWNER_ACCOUNT_RECEIVE_WINDOW_SECONDS;
  const timeoutMs = input.timeoutMs;

  try {
    const snapshot = await ingestMexcAccountState(
      async (request): Promise<MexcAccountStateReadResult> => {
        const privateResult = await requestMexcPrivateRead(
          {
            endpoint: request.endpoint,
            credentials,
            receiveWindowSeconds,
            timeoutMs,
          },
          {
            fetch: dependencies.fetch,
            now,
          },
        );
        return accountReadResult(request, privateResult);
      },
    );

    return result(
      connectionControl,
      activation,
      transitionMexcAccountAvailability({
        previous: input.previous ?? null,
        outcome: Object.freeze({ ok: true as const, snapshot }),
        policy: Object.freeze({
          nowMs: now(),
          maxAgeMs: input.maxAgeMs ?? MEXC_OWNER_ACCOUNT_SNAPSHOT_MAX_AGE_MS,
        }),
      }),
    );
  } catch (error) {
    return result(
      connectionControl,
      activation,
      transitionMexcAccountAvailability({
        previous: input.previous ?? null,
        outcome: Object.freeze({ ok: false as const, error }),
        policy: Object.freeze({
          nowMs: now(),
          maxAgeMs: input.maxAgeMs ?? MEXC_OWNER_ACCOUNT_SNAPSHOT_MAX_AGE_MS,
        }),
      }),
    );
  }
}
