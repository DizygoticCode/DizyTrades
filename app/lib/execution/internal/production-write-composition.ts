import "server-only";

import type { AuthenticatedExecutionCaller, ExecutionBoundaryRequest, ExecutionBoundaryResponse } from "../types";
import {
  MEXC_PROVIDER_READBACK_MAX_AGE_MS,
  readAuthoritativeMexcAccountRisk,
  translateMexcReadback,
  type MexcProviderAccountRiskReadback,
  type MexcProviderPosition,
} from "../../mexc-provider-readback";
import { InternalExecutionBoundary } from "./boundary-service";
import { createProductionExecutionStateStore } from "./state-store";
import { createProductionExecutionAuditStore } from "./audit-store";
import { createProductionExecutionRiskStore, type ExecutionRiskStore } from "./risk-store";
import { executionKillSwitchReason, type ExecutionKillSwitches } from "./kill-switch";
import { createProductionExecutionControlStore } from "./control-store";
import { verifyProductionExecutionCaller } from "./caller-assertion";
import { readProductionExecutionOwnershipBinding, type ExecutionOwnershipBinding } from "./ownership-binding";
import { createProductionExecutionOwnershipStore, type ExecutionOwnershipStore } from "./ownership-store";
import { createProductionOwnershipProofOrchestrator } from "./ownership-ceremony";
import { createProductionExecutionReconciliationStore, type ExecutionReconciliationStore } from "./reconciliation-store";
import { reconcileAuthoritativeMexcReadback } from "./authoritative-reconciliation";
import { EXECUTION_ROLLOUT_MAX_AGE_MS, createProductionExecutionRolloutStore, type ExecutionRolloutStore } from "./rollout-store";
import { authoritativeRiskSnapshotFromDayStart } from "./day-start-equity-authority";
import { createProductionExecutionDayStartEquityStore, type ExecutionDayStartEquityStore } from "./day-start-equity-store";
import {
  ModernMexcReduceOnlyWriter,
  createMexcExecutionFetchTransport,
  type MexcExecutionIntent,
  type MexcLifecycleEvidence,
  type MexcPreTransportContext,
} from "./mexc-execution-writer";
import { SqliteMexcExecutionLifecycleStore } from "./mexc-execution-lifecycle-store";
import type { MexcPreWriteEvidence } from "./mexc-write-authority";
import {
  productionWriteCredentialExecutionIdentity,
  readProductionMexcWriteCredentialLease,
  type ProductionWriteCredentialExecutionIdentity,
} from "./production-write-credential-lease";

export const MEXC_EXECUTION_EGRESS_ALLOWLIST_ATTESTATION =
  "mexc-order-placing-egress-allowlisted/v1" as const;

export class ProductionMexcWriteCompositionError extends Error {
  constructor(readonly kind: "disabled" | "blocked") {
    super(`MEXC_PRODUCTION_WRITE_${kind.toUpperCase()}`);
    this.name = "ProductionMexcWriteCompositionError";
  }
}

type Environment = Readonly<Record<string, string | undefined>>;
type TotpExecutionCaller = AuthenticatedExecutionCaller & Readonly<{ totpAssured: true }>;

/** Test-only sink. It receives a derived candidate, never credentials or network authority. */
export type SyntheticCandidateHandoff = Readonly<{
  accept(intent: MexcExecutionIntent, evidence: MexcPreWriteEvidence): Promise<MexcLifecycleEvidence>;
}>;

export type ProductionMexcWriteDependencies = Readonly<{
  environment: Environment;
  now: () => Date;
  verifyCaller: (assertion: ExecutionBoundaryRequest["callerAssertion"]) => TotpExecutionCaller | null;
  switches: () => ExecutionKillSwitches;
  proveOwnership: (caller: AuthenticatedExecutionCaller) => Promise<unknown>;
  readBinding: () => ExecutionOwnershipBinding | null;
  ownershipStore: ExecutionOwnershipStore;
  reconciliationStore: ExecutionReconciliationStore;
  riskStore: ExecutionRiskStore;
  rolloutStore: ExecutionRolloutStore;
  dayStartEquityStore: ExecutionDayStartEquityStore;
  readback: (identity: Readonly<{ userId: string; accountId: string }>) => Promise<MexcProviderAccountRiskReadback>;
  syntheticCandidateHandoff?: SyntheticCandidateHandoff;
  productionWriter?: ModernMexcReduceOnlyWriter;
  writeCredentialIdentity?: ProductionWriteCredentialExecutionIdentity;
  executionStateStore: ReturnType<typeof createProductionExecutionStateStore>;
  executionAuditStore: ReturnType<typeof createProductionExecutionAuditStore>;
}>;

const fail = (kind: ProductionMexcWriteCompositionError["kind"]): never => {
  throw new ProductionMexcWriteCompositionError(kind);
};
const clean = (value: string | undefined) => typeof value === "string" ? value.trim() : "";
const freshUntil = (value: string) => new Date(Date.parse(value) + MEXC_PROVIDER_READBACK_MAX_AGE_MS).toISOString();
const fresh = (value: string | null, now: Date, maximumAgeMs: number) => {
  const observedAt = value === null ? NaN : Date.parse(value);
  const age = now.getTime() - observedAt;
  return Number.isFinite(age) && age >= 0 && age <= maximumAgeMs;
};

function targetPosition(
  readback: MexcProviderAccountRiskReadback,
  response: ExecutionBoundaryResponse,
): MexcProviderPosition & Readonly<{ providerPositionId: string; openType: "isolated" | "cross" }> {
  const preview = response.result.preview;
  if (!preview || preview.orderType !== "limit" || preview.reduceOnly !== true || preview.price === undefined) return fail("blocked");
  const positionSide = preview.side === "long" ? "short" : "long";
  const matches = readback.positions.filter((position) => position.symbol === preview.symbol && position.side === positionSide);
  if (matches.length !== 1) return fail("blocked");
  const position = matches[0];
  const raw = position as MexcProviderPosition & Readonly<{ positionMode?: unknown }>;
  if (
    raw.positionMode !== "one-way" ||
    typeof position.providerPositionId !== "string" ||
    !/^[1-9][0-9]{0,30}$/.test(position.providerPositionId) ||
    (position.openType !== "isolated" && position.openType !== "cross") ||
    !Number.isFinite(position.contractVolume) ||
    position.contractVolume <= 0 ||
    preview.normalizedContractVolume > position.contractVolume
  ) return fail("blocked");
  return position as MexcProviderPosition & Readonly<{ providerPositionId: string; openType: "isolated" | "cross" }>;
}

function authoritativeRequest(
  request: ExecutionBoundaryRequest,
  readback: MexcProviderAccountRiskReadback,
  riskSnapshot: NonNullable<ExecutionBoundaryRequest["prerequisites"]["riskSnapshot"]>,
): ExecutionBoundaryRequest {
  const contracts = request.prerequisites.contracts;
  if (!contracts) return fail("blocked");
  const translated = translateMexcReadback(readback, [...contracts.values()]);
  return Object.freeze({
    ...request,
    prerequisites: Object.freeze({
      ...request.prerequisites,
      accountState: translated.accountState,
      riskSnapshot,
    }),
  });
}

export class ProductionMexcWriteComposition {
  constructor(private readonly dependencies: ProductionMexcWriteDependencies | null) {}

  async execute(request: ExecutionBoundaryRequest): Promise<MexcLifecycleEvidence> {
    const d = this.dependencies;
    if (!d) return fail("disabled");
    if (clean(d.environment.MEXC_WRITE_PROVIDER_ENABLED) !== "true") return fail("disabled");

    const snapshot = structuredClone(request);
    const stableRequest = Object.freeze({
      ...snapshot,
      callerAssertion: Object.freeze({ ...snapshot.callerAssertion }),
      userId: snapshot.userId,
      accountId: snapshot.accountId,
    });
    const caller = d.verifyCaller(stableRequest.callerAssertion);
    if (!caller || caller.userId !== stableRequest.userId || caller.accountId !== stableRequest.accountId) return fail("blocked");

    const firstSwitches = d.switches();
    if (executionKillSwitchReason(firstSwitches, caller) !== null) return fail("blocked");

    try { await d.proveOwnership(caller); } catch { return fail("blocked"); }
    const now = d.now();
    const binding = d.readBinding();
    if (!binding || binding.userId !== caller.userId || binding.accountId !== caller.accountId) return fail("blocked");
    const ownership = d.ownershipStore.read(caller);
    if (
      ownership.status !== "active" ||
      ownership.bindingDigest !== binding.bindingDigest ||
      !fresh(ownership.proofObservedAt, now, MEXC_PROVIDER_READBACK_MAX_AGE_MS)
    ) return fail("blocked");

    const risk = d.riskStore.read(caller.userId, caller.accountId);
    const rollout = d.rolloutStore.read(caller);
    if (
      !risk || !risk.enabled || !fresh(risk.updatedAt, now, EXECUTION_ROLLOUT_MAX_AGE_MS) || Date.parse(risk.reviewAt) < now.getTime() ||
      rollout.status !== "armed" || !rollout.policy || rollout.bindingDigest !== binding.bindingDigest ||
      rollout.riskRevision !== risk.revision || !fresh(rollout.updatedAt, now, EXECUTION_ROLLOUT_MAX_AGE_MS)
    ) return fail("blocked");

    const beforeReconciliation = d.reconciliationStore.read(caller);
    if (
      beforeReconciliation.status !== "clean" ||
      beforeReconciliation.reason !== "CLEAN" ||
      beforeReconciliation.expected.length < 1 ||
      !fresh(beforeReconciliation.observedAt, now, MEXC_PROVIDER_READBACK_MAX_AGE_MS)
    ) return fail("blocked");

    let readback: MexcProviderAccountRiskReadback;
    try { readback = await d.readback(Object.freeze({ userId: caller.userId, accountId: caller.accountId })); }
    catch { return fail("blocked"); }
    const reconciled = reconcileAuthoritativeMexcReadback(d.reconciliationStore, caller, readback, d.now());
    if (reconciled.status !== "clean" || reconciled.reason !== "CLEAN") return fail("blocked");
    const reconciliation = d.reconciliationStore.read(caller);

    const riskSnapshot = authoritativeRiskSnapshotFromDayStart(
      d.dayStartEquityStore,
      Object.freeze({ identity: caller, binding, reconciliation, readback }),
      d.now(),
    );
    if (!riskSnapshot) return fail("blocked");

    const requestWithAuthority = authoritativeRequest(stableRequest, readback, riskSnapshot);
    const boundary = new InternalExecutionBoundary({
      authenticateInternalCaller: (assertion) =>
        assertion.callerId === stableRequest.callerAssertion.callerId &&
        assertion.assertionId === stableRequest.callerAssertion.assertionId ? caller : null,
      readKillSwitches: d.switches,
      executionStateStore: d.executionStateStore,
      executionAuditStore: d.executionAuditStore,
      executionRiskStore: d.riskStore,
      executionOwnershipStore: d.ownershipStore,
      readOwnershipBinding: d.readBinding,
      executionReconciliationStore: d.reconciliationStore,
      executionRolloutStore: d.rolloutStore,
      environment: Object.freeze({ ...d.environment, LIVE_TRADING_ENABLED: "false" }),
      now: d.now,
    });
    const airlock = boundary.preview(requestWithAuthority);
    if (airlock.result.state !== "prepared" || airlock.result.executed !== false || !airlock.result.preview) return fail("blocked");
    const preview = airlock.result.preview;
    const position = targetPosition(readback, airlock);

    const finalNow = d.now();
    const finalSwitches = d.switches();
    if (executionKillSwitchReason(finalSwitches, caller) !== null) return fail("blocked");
    const finalBinding = d.readBinding();
    const finalOwnership = d.ownershipStore.read(caller);
    const finalReconciliation = d.reconciliationStore.read(caller);
    const finalRisk = d.riskStore.read(caller.userId, caller.accountId);
    const finalRollout = d.rolloutStore.read(caller);
    if (
      !finalBinding || finalBinding.bindingDigest !== binding.bindingDigest ||
      finalOwnership.status !== "active" || finalOwnership.bindingDigest !== finalBinding.bindingDigest || !fresh(finalOwnership.proofObservedAt, finalNow, MEXC_PROVIDER_READBACK_MAX_AGE_MS) ||
      finalReconciliation.status !== "clean" || finalReconciliation.reason !== "CLEAN" || finalReconciliation.revision !== reconciliation.revision || !fresh(finalReconciliation.observedAt, finalNow, MEXC_PROVIDER_READBACK_MAX_AGE_MS) ||
      !finalRisk || !finalRisk.enabled || finalRisk.revision !== risk.revision || Date.parse(finalRisk.reviewAt) < finalNow.getTime() ||
      finalRollout.status !== "armed" || !finalRollout.policy || finalRollout.revision !== rollout.revision || finalRollout.bindingDigest !== finalBinding.bindingDigest || finalRollout.riskRevision !== finalRisk.revision || !fresh(finalRollout.updatedAt, finalNow, EXECUTION_ROLLOUT_MAX_AGE_MS) ||
      clean(d.environment.MEXC_EXECUTION_EGRESS_ALLOWLIST_ATTESTATION) !== MEXC_EXECUTION_EGRESS_ALLOWLIST_ATTESTATION
    ) return fail("blocked");

    if (preview.orderType !== "limit" || preview.price === undefined) return fail("blocked");
    const productionIdentity = d.productionWriter ? d.writeCredentialIdentity : undefined;
    if (d.productionWriter && (!productionIdentity || productionIdentity.userId !== caller.userId || productionIdentity.accountId !== caller.accountId)) return fail("blocked");
    const writeCredentialGeneration = productionIdentity?.writeCredentialGeneration ?? "synthetic-candidate-only";

    const intent: MexcExecutionIntent = Object.freeze({
      userId: caller.userId,
      accountId: caller.accountId,
      intentId: airlock.result.intentId,
      idempotencyKey: airlock.result.idempotencyKey,
      symbol: preview.symbol,
      side: preview.side,
      orderType: "limit",
      positionMode: "one-way",
      positionId: position.providerPositionId,
      marginMode: position.openType,
      positionVolume: position.contractVolume,
      volume: preview.normalizedContractVolume,
      price: preview.price,
      referencePrice: preview.referencePrice,
      estimatedNotional: preview.estimatedNotional,
      leverage: preview.leverage,
      reduceOnly: true,
      bindingGeneration: finalBinding.credentialGeneration,
      rolloutRevision: finalRollout.revision,
      riskRevision: finalRisk.revision,
      reconciliationRevision: finalReconciliation.revision,
      writeCredentialGeneration,
    });

    const evidenceFrom = (
      switches: ExecutionKillSwitches,
      currentBinding: ExecutionOwnershipBinding,
      currentOwnership: typeof finalOwnership,
      currentReconciliation: typeof finalReconciliation,
      currentRisk: NonNullable<typeof finalRisk>,
      currentRollout: typeof finalRollout,
    ): MexcPreWriteEvidence => Object.freeze({
      caller: Object.freeze({ userId: caller.userId, accountId: caller.accountId, totpAssured: true as const }),
      ownership: Object.freeze({ userId: caller.userId, accountId: caller.accountId, bindingGeneration: currentBinding.credentialGeneration, freshUntil: freshUntil(currentOwnership.proofObservedAt!) }),
      reconciliation: Object.freeze({
        userId: caller.userId,
        accountId: caller.accountId,
        revision: currentReconciliation.revision,
        positionId: position.providerPositionId,
        positionSide: position.side,
        positionMode: "one-way" as const,
        marginMode: position.openType,
        positionVolume: position.contractVolume,
        freshUntil: freshUntil(currentReconciliation.observedAt!),
        clean: true as const,
      }),
      risk: Object.freeze({ userId: caller.userId, accountId: caller.accountId, revision: currentRisk.revision, enabled: true as const }),
      rollout: Object.freeze({ userId: caller.userId, accountId: caller.accountId, revision: currentRollout.revision, bindingGeneration: currentBinding.credentialGeneration, riskRevision: currentRisk.revision, armed: true as const }),
      switches,
      airlock: Object.freeze({ userId: caller.userId, accountId: caller.accountId, intentId: airlock.result.intentId, idempotencyKey: airlock.result.idempotencyKey, result: airlock.result }),
      network: Object.freeze({ mexcEgressAllowlisted: true as const, writeCredentialGeneration }),
    });

    const evidence = evidenceFrom(finalSwitches, finalBinding, finalOwnership, finalReconciliation, finalRisk, finalRollout);
    if (!d.productionWriter) {
      if (!d.syntheticCandidateHandoff) return fail("disabled");
      return d.syntheticCandidateHandoff.accept(intent, evidence);
    }

    const contextProvider = (): MexcPreTransportContext => {
      const slotNow = d.now();
      const slotSwitches = d.switches();
      const slotBinding = d.readBinding();
      const slotOwnership = d.ownershipStore.read(caller);
      const slotReconciliation = d.reconciliationStore.read(caller);
      const slotRisk = d.riskStore.read(caller.userId, caller.accountId);
      const slotRollout = d.rolloutStore.read(caller);
      if (
        !productionIdentity ||
        executionKillSwitchReason(slotSwitches, caller) !== null ||
        !slotBinding || slotBinding.bindingDigest !== binding.bindingDigest || slotBinding.credentialGeneration !== intent.bindingGeneration ||
        slotOwnership.status !== "active" || slotOwnership.bindingDigest !== slotBinding.bindingDigest || !fresh(slotOwnership.proofObservedAt, slotNow, MEXC_PROVIDER_READBACK_MAX_AGE_MS) ||
        slotReconciliation.status !== "clean" || slotReconciliation.reason !== "CLEAN" || slotReconciliation.revision !== intent.reconciliationRevision || !fresh(slotReconciliation.observedAt, slotNow, MEXC_PROVIDER_READBACK_MAX_AGE_MS) ||
        !slotRisk || !slotRisk.enabled || slotRisk.revision !== intent.riskRevision || !fresh(slotRisk.updatedAt, slotNow, EXECUTION_ROLLOUT_MAX_AGE_MS) || Date.parse(slotRisk.reviewAt) < slotNow.getTime() ||
        slotRollout.status !== "armed" || !slotRollout.policy || slotRollout.revision !== intent.rolloutRevision || slotRollout.bindingDigest !== slotBinding.bindingDigest || slotRollout.riskRevision !== slotRisk.revision || !fresh(slotRollout.updatedAt, slotNow, EXECUTION_ROLLOUT_MAX_AGE_MS) ||
        clean(d.environment.MEXC_EXECUTION_EGRESS_ALLOWLIST_ATTESTATION) !== MEXC_EXECUTION_EGRESS_ALLOWLIST_ATTESTATION
      ) return fail("blocked");

      const slotEvidence = evidenceFrom(slotSwitches, slotBinding, slotOwnership, slotReconciliation, slotRisk, slotRollout);
      const credentials = readProductionMexcWriteCredentialLease(productionIdentity, slotNow);
      return Object.freeze({ credentials, environment: d.environment, evidence: slotEvidence });
    };

    return d.productionWriter.execute(intent, contextProvider);
  }
}

export function createProductionMexcWriteComposition(
  environment: Environment = process.env,
): ProductionMexcWriteComposition {
  if (environment !== process.env) return new ProductionMexcWriteComposition(null);
  const writeCredentialIdentity = productionWriteCredentialExecutionIdentity(environment);
  if (!writeCredentialIdentity) return new ProductionMexcWriteComposition(null);

  const controls = createProductionExecutionControlStore();
  const ownershipStore = createProductionExecutionOwnershipStore();
  const reconciliationStore = createProductionExecutionReconciliationStore();
  const riskStore = createProductionExecutionRiskStore();
  const rolloutStore = createProductionExecutionRolloutStore();
  const dayStartEquityStore = createProductionExecutionDayStartEquityStore();
  const executionStateStore = createProductionExecutionStateStore();
  const executionAuditStore = createProductionExecutionAuditStore();
  const proveOwnership = createProductionOwnershipProofOrchestrator(ownershipStore);
  const lifecycleStore = new SqliteMexcExecutionLifecycleStore();
  const productionWriter = new ModernMexcReduceOnlyWriter(createMexcExecutionFetchTransport(), lifecycleStore);

  const dependencies: ProductionMexcWriteDependencies = {
    environment,
    now: () => new Date(),
    verifyCaller: verifyProductionExecutionCaller,
    switches: () => controls.switches(),
    proveOwnership,
    readBinding: () => readProductionExecutionOwnershipBinding(),
    ownershipStore,
    reconciliationStore,
    riskStore,
    rolloutStore,
    dayStartEquityStore,
    readback: (identity) => readAuthoritativeMexcAccountRisk(identity),
    productionWriter,
    writeCredentialIdentity,
    executionStateStore,
    executionAuditStore,
  };
  return new ProductionMexcWriteComposition(Object.freeze(dependencies));
}
