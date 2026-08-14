import "server-only";

import { readAuthoritativeMexcAccountRisk, type MexcProviderAccountRiskReadback } from "../../mexc-provider-readback";
import { reconcileAuthoritativeMexcReadback } from "./authoritative-reconciliation";
import type { ExecutionAccountIdentity, ExecutionReconciliationStore } from "./reconciliation-store";

export type ProductionReconciliationOrchestrator = (identity: ExecutionAccountIdentity) => Promise<void>;

/**
 * Server-only Radar -> execution-owned expectation -> reconciliation chain.
 * Because this airlock has no executing adapter and rejects every provider outcome
 * with executed:false, its durable owned-position expectation is conservatively empty.
 * Provider positions are observations only and are never adopted as expected truth.
 */
export function createProductionReconciliationOrchestrator(
  store: ExecutionReconciliationStore,
  readback: (identity: ExecutionAccountIdentity) => Promise<MexcProviderAccountRiskReadback>
    = (identity) => readAuthoritativeMexcAccountRisk(identity),
  now: () => Date = () => new Date(),
): ProductionReconciliationOrchestrator {
  return async (identity) => {
    const current = store.read(identity);
    store.setExpected(identity, Object.freeze([]), current.revision);
    try {
      const observation = await readback(Object.freeze({ userId: identity.userId, accountId: identity.accountId }));
      reconcileAuthoritativeMexcReadback(store, identity, observation, now());
    } catch {
      // A Radar failure is persisted as an account-local quarantine; no credential
      // or provider error detail crosses this bounded execution seam.
      reconcileAuthoritativeMexcReadback(store, identity, Object.freeze({}), now());
    }
  };
}
