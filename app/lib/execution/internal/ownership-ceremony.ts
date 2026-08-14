import "server-only";

import {
  MEXC_PROVIDER_READBACK_MAX_AGE_MS,
  MEXC_PROVIDER_READBACK_VERSION,
  readAuthoritativeMexcAccountRisk,
  type MexcProviderAccountRiskReadback,
} from "../../mexc-provider-readback";
import type { AuthenticatedExecutionCaller } from "../types";
import { verifyProductionExecutionCaller } from "./caller-assertion";
import {
  createProductionExecutionOwnershipStore,
  type ExecutionOwnershipIdentity,
  type ExecutionOwnershipState,
  type ExecutionOwnershipStore,
} from "./ownership-store";

const identityOf = (
  caller: AuthenticatedExecutionCaller,
): ExecutionOwnershipIdentity =>
  Object.freeze({ userId: caller.userId, accountId: caller.accountId });

const freshObservedAt = (observedAt: unknown, now: Date) => {
  if (typeof observedAt !== "string") return null;
  const observedMs = Date.parse(observedAt);
  const age = now.getTime() - observedMs;
  if (
    !Number.isFinite(observedMs) ||
    age < 0 ||
    age > MEXC_PROVIDER_READBACK_MAX_AGE_MS
  )
    return null;
  return new Date(observedAt).toISOString();
};

export function proveExecutionAccountOwnership(
  store: ExecutionOwnershipStore,
  caller: AuthenticatedExecutionCaller,
  observation: unknown,
  now = new Date(),
): ExecutionOwnershipState {
  if (!observation || typeof observation !== "object")
    return store.read(identityOf(caller));
  const readback = observation as Partial<MexcProviderAccountRiskReadback>;
  const observedAt = freshObservedAt(readback.observedAt, now);
  if (
    readback.version !== MEXC_PROVIDER_READBACK_VERSION ||
    readback.provider !== "mexc" ||
    readback.settlementCurrency !== "USDT" ||
    readback.userId !== caller.userId ||
    readback.accountId !== caller.accountId ||
    observedAt === null ||
    !Array.isArray(readback.positions)
  )
    return store.read(identityOf(caller));

  const identity = identityOf(caller);
  const current = store.read(identity);
  return store.recordProof(identity, observedAt, current.revision);
}

export function activateExecutionAccountOwnership(
  store: ExecutionOwnershipStore,
  caller: AuthenticatedExecutionCaller,
  expectedRevision: number,
  now = new Date(),
): ExecutionOwnershipState {
  const identity = identityOf(caller);
  const current = store.read(identity);
  if (
    current.revision !== expectedRevision ||
    current.status !== "proved" ||
    current.proofObservedAt === null
  ) {
    return current;
  }
  const age = now.getTime() - Date.parse(current.proofObservedAt);
  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age > MEXC_PROVIDER_READBACK_MAX_AGE_MS
  )
    return current;
  return store.activate(identity, now.toISOString(), expectedRevision);
}

export function revokeExecutionAccountOwnership(
  store: ExecutionOwnershipStore,
  caller: AuthenticatedExecutionCaller,
  expectedRevision: number,
  now = new Date(),
): ExecutionOwnershipState {
  return store.revoke(identityOf(caller), now.toISOString(), expectedRevision);
}

type ProductionCeremonyRequest = Readonly<{
  callerAssertion: Readonly<{ callerId: string; assertionId: string }>;
  userId: string;
  accountId: string;
  expectedRevision: number;
}>;

function verifiedCeremonyCaller(request: ProductionCeremonyRequest) {
  const caller = verifyProductionExecutionCaller(request.callerAssertion);
  if (
    !caller ||
    caller.userId !== request.userId ||
    caller.accountId !== request.accountId
  )
    return null;
  return caller;
}

/**
 * Server-only deliberate activation transition. No route imports this function.
 * It consumes a fresh single-use authenticated caller assertion and persists no secret.
 */
export function activateProductionExecutionAccountOwnership(
  request: ProductionCeremonyRequest,
  store: ExecutionOwnershipStore = createProductionExecutionOwnershipStore(),
  now = new Date(),
): ExecutionOwnershipState | null {
  const caller = verifiedCeremonyCaller(request);
  if (!caller) return null;
  return activateExecutionAccountOwnership(
    store,
    caller,
    request.expectedRevision,
    now,
  );
}

/** Server-only explicit sticky revocation; also requires a fresh authenticated assertion. */
export function revokeProductionExecutionAccountOwnership(
  request: ProductionCeremonyRequest,
  store: ExecutionOwnershipStore = createProductionExecutionOwnershipStore(),
  now = new Date(),
): ExecutionOwnershipState | null {
  const caller = verifiedCeremonyCaller(request);
  if (!caller) return null;
  return revokeExecutionAccountOwnership(
    store,
    caller,
    request.expectedRevision,
    now,
  );
}

export type ProductionOwnershipProofOrchestrator = (
  caller: AuthenticatedExecutionCaller,
) => Promise<ExecutionOwnershipState>;

export function createProductionOwnershipProofOrchestrator(
  store: ExecutionOwnershipStore,
  readback: (
    identity: ExecutionOwnershipIdentity,
  ) => Promise<MexcProviderAccountRiskReadback> = (identity) =>
    readAuthoritativeMexcAccountRisk(identity),
  now: () => Date = () => new Date(),
): ProductionOwnershipProofOrchestrator {
  return async (caller) => {
    const identity = identityOf(caller);
    try {
      const observation = await readback(identity);
      return proveExecutionAccountOwnership(store, caller, observation, now());
    } catch {
      return store.read(identity);
    }
  };
}
