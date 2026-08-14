import "server-only";

import {
  MEXC_PROVIDER_READBACK_MAX_AGE_MS,
  MEXC_PROVIDER_READBACK_VERSION,
  readAuthoritativeMexcAccountRisk,
  type MexcProviderAccountRiskReadback,
} from "../../mexc-provider-readback";
import type { AuthenticatedExecutionCaller, ExecutionBoundaryRequest } from "../types";
import type { ExecutionAccountIdentity } from "./reconciliation-store";
import { ExecutionOwnershipStoreError, type ExecutionOwnershipState, type ExecutionOwnershipStore } from "./ownership-store";

export class ExecutionOwnershipCeremonyError extends Error {
  constructor(readonly code: "EXECUTION_OWNERSHIP_UNAUTHENTICATED" | "EXECUTION_OWNERSHIP_IDENTITY_MISMATCH" | "EXECUTION_OWNERSHIP_PROOF_INVALID" | "EXECUTION_OWNERSHIP_PROOF_STALE" | "EXECUTION_OWNERSHIP_INVALID" | "EXECUTION_OWNERSHIP_UNAVAILABLE") {
    super("EXECUTION_OWNERSHIP_CEREMONY_FAILURE");
    this.name = "ExecutionOwnershipCeremonyError";
  }
}

type Assertion = ExecutionBoundaryRequest["callerAssertion"];
type Verify = (assertion: Assertion) => AuthenticatedExecutionCaller | null;
type Readback = (identity: ExecutionAccountIdentity) => Promise<MexcProviderAccountRiskReadback>;
const fail = (code: ExecutionOwnershipCeremonyError["code"]): never => { throw new ExecutionOwnershipCeremonyError(code); };

export class ExecutionOwnershipCeremony {
  constructor(
    private readonly store: ExecutionOwnershipStore,
    private readonly verify: Verify,
    private readonly readback: Readback = (identity) => readAuthoritativeMexcAccountRisk(identity),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private authenticate(assertion: Assertion, identity: ExecutionAccountIdentity) {
    let caller: AuthenticatedExecutionCaller | null;
    try { caller = this.verify(assertion); } catch { return fail("EXECUTION_OWNERSHIP_UNAVAILABLE"); }
    if (!caller || caller.callerId !== assertion.callerId) return fail("EXECUTION_OWNERSHIP_UNAUTHENTICATED");
    if (caller.userId !== identity.userId || caller.accountId !== identity.accountId) return fail("EXECUTION_OWNERSHIP_IDENTITY_MISMATCH");
    return Object.freeze({ userId: caller.userId, accountId: caller.accountId });
  }
  private storeCall(action: () => ExecutionOwnershipState) {
    try { return action(); }
    catch (error) {
      if (error instanceof ExecutionOwnershipStoreError) return fail(error.code);
      return fail("EXECUTION_OWNERSHIP_UNAVAILABLE");
    }
  }
  async prove(assertion: Assertion, identity: ExecutionAccountIdentity, expectedRevision: number) {
    const trusted = this.authenticate(assertion, identity);
    let proof: MexcProviderAccountRiskReadback;
    try { proof = await this.readback(trusted); } catch { return fail("EXECUTION_OWNERSHIP_PROOF_INVALID"); }
    if (proof.version !== MEXC_PROVIDER_READBACK_VERSION || proof.provider !== "mexc"
      || proof.userId !== trusted.userId || proof.accountId !== trusted.accountId)
      return fail("EXECUTION_OWNERSHIP_IDENTITY_MISMATCH");
    const observed = Date.parse(proof.observedAt);
    const age = this.now().getTime() - observed;
    if (!Number.isFinite(observed) || new Date(observed).toISOString() !== proof.observedAt || age < 0 || age > MEXC_PROVIDER_READBACK_MAX_AGE_MS)
      return fail("EXECUTION_OWNERSHIP_PROOF_STALE");
    return this.storeCall(() => this.store.recordProof(trusted, proof.observedAt, expectedRevision));
  }
  activate(assertion: Assertion, identity: ExecutionAccountIdentity, expectedRevision: number) {
    const trusted = this.authenticate(assertion, identity);
    const current = this.storeCall(() => this.store.read(trusted));
    const observed = current.proofObservedAt === null ? NaN : Date.parse(current.proofObservedAt);
    const age = this.now().getTime() - observed;
    if (!Number.isFinite(age) || age < 0 || age > MEXC_PROVIDER_READBACK_MAX_AGE_MS) return fail("EXECUTION_OWNERSHIP_PROOF_STALE");
    return this.storeCall(() => this.store.activate(trusted, expectedRevision, this.now()));
  }
  revoke(assertion: Assertion, identity: ExecutionAccountIdentity, expectedRevision: number) {
    const trusted = this.authenticate(assertion, identity);
    return this.storeCall(() => this.store.revoke(trusted, expectedRevision, this.now()));
  }
}
