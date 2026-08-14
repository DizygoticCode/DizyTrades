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
import { verifyProductionExecutionCaller } from "./caller-assertion";
import { createProductionExecutionControlStore } from "./control-store";
import { createProductionExecutionStateStore } from "./state-store";
import { createProductionExecutionAuditStore } from "./audit-store";
import { createProductionExecutionRiskStore, type ExecutionRiskStore } from "./risk-store";
import { executionKillSwitchReason, type ExecutionKillSwitches } from "./kill-switch";
import { readProductionExecutionOwnershipBinding, type ExecutionOwnershipBinding } from "./ownership-binding";
import { createProductionExecutionOwnershipStore, type ExecutionOwnershipStore } from "./ownership-store";
import { createProductionOwnershipProofOrchestrator } from "./ownership-ceremony";
import { createProductionExecutionReconciliationStore, type ExecutionReconciliationStore } from "./reconciliation-store";
import { reconcileAuthoritativeMexcReadback } from "./authoritative-reconciliation";
import { createProductionExecutionRolloutStore, EXECUTION_ROLLOUT_MAX_AGE_MS, type ExecutionRolloutStore } from "./rollout-store";
import { authoritativeRiskSnapshotFromDayStart } from "./day-start-equity-authority";
import { createProductionExecutionDayStartEquityStore, type ExecutionDayStartEquityStore } from "./day-start-equity-store";
import {
  ModernMexcReduceOnlyWriter,
  createMexcExecutionFetchTransport,
  mexcWriterEnabled,
  readMexcExecutionCredentials,
  type MexcExecutionIntent,
  type MexcExecutionLifecycleStore,
  type MexcLifecycleEvidence,
} from "./mexc-execution-writer";
import { SqliteMexcExecutionLifecycleStore } from "./mexc-execution-lifecycle-store";
import type { MexcPreWriteEvidence } from "./mexc-write-authority";

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
type Writer = Readonly<{
  execute(
    intent: MexcExecutionIntent,
    credentials: ReturnType<typeof readMexcExecutionCredentials>,
    environment: Environment,
    evidence: MexcPreWriteEvidence,
  ): Promise<MexcLifecycleEvidence>;
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
  writer: Writer;
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

/**
 * Server-only composition for the future operator-controlled writer ceremony.
 * Nothing imports this from a route. The two activation flags are checked before
 * caller consumption, provider reads or credential reads, and the writer repeats
 * the flag/authority checks immediately before signing.
 */
export class ProductionMexcWriteComposition {
  constructor(private readonly dependencies: ProductionMexcWriteDependencies) {}

  async execute(request: ExecutionBoundaryRequest): Promise<MexcLifecycleEvidence> {
    const d = this.dependencies;
    if (!mexcWriterEnabled(d.environment)) return fail("disabled");

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
      environment: d.environment,
      now: d.now,
    });
    const airlock = boundary.preview(requestWithAuthority);
    if (airlock.result.state !== "prepared" || airlock.result.executed !== false || !airlock.result.preview) return fail("blocked");
    const preview = airlock.result.preview;
    const position = targetPosition(readback, airlock);

    // Re-read every mutable authority immediately before credentials are touched.
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

    const credentials = readMexcExecutionCredentials(d.environment);
    if (preview.orderType !== "limit" || preview.price === undefined) return fail("blocked");
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
      writeCredentialGeneration: credentials.generation,
    });
    const evidence: MexcPreWriteEvidence = Object.freeze({
      caller: Object.freeze({ userId: caller.userId, accountId: caller.accountId, totpAssured: true as const }),
      ownership: Object.freeze({ userId: caller.userId, accountId: caller.accountId, bindingGeneration: finalBinding.credentialGeneration, freshUntil: freshUntil(finalOwnership.proofObservedAt!) }),
      reconciliation: Object.freeze({
        userId: caller.userId,
        accountId: caller.accountId,
        revision: finalReconciliation.revision,
        positionId: position.providerPositionId,
        positionSide: position.side,
        positionMode: "one-way" as const,
        marginMode: position.openType,
        positionVolume: position.contractVolume,
        freshUntil: freshUntil(finalReconciliation.observedAt!),
        clean: true as const,
      }),
      risk: Object.freeze({ userId: caller.userId, accountId: caller.accountId, revision: finalRisk.revision, enabled: true as const }),
      rollout: Object.freeze({ userId: caller.userId, accountId: caller.accountId, revision: finalRollout.revision, armed: true as const }),
      switches: finalSwitches,
      airlock: Object.freeze({ userId: caller.userId, accountId: caller.accountId, intentId: airlock.result.intentId, idempotencyKey: airlock.result.idempotencyKey, result: airlock.result }),
      network: Object.freeze({ mexcEgressAllowlisted: true as const }),
    });
    return d.writer.execute(intent, credentials, d.environment, evidence);
  }
}

export function createProductionMexcWriteComposition(
  environment: Environment = process.env,
): ProductionMexcWriteComposition {
  const controls = createProductionExecutionControlStore();
  const ownershipStore = createProductionExecutionOwnershipStore();
  const reconciliationStore = createProductionExecutionReconciliationStore();
  const riskStore = createProductionExecutionRiskStore();
  const rolloutStore = createProductionExecutionRolloutStore();
  const dayStartEquityStore = createProductionExecutionDayStartEquityStore();
  const lifecycleStore: MexcExecutionLifecycleStore = new SqliteMexcExecutionLifecycleStore();
  const writer = new ModernMexcReduceOnlyWriter(createMexcExecutionFetchTransport(), lifecycleStore);
  const proveOwnership = createProductionOwnershipProofOrchestrator(ownershipStore);
  return new ProductionMexcWriteComposition(Object.freeze({
    environment,
    now: () => new Date(),
    verifyCaller: (assertion) => {
      const caller = verifyProductionExecutionCaller(assertion);
      // The assertion store only issues/revalidates from execution-grade TOTP sessions.
      return caller ? Object.freeze({ ...caller, totpAssured: true as const }) : null;
    },
    switches: () => controls.switches(),
    proveOwnership,
    readBinding: () => readProductionExecutionOwnershipBinding(environment),
    ownershipStore,
    reconciliationStore,
    riskStore,
    rolloutStore,
    dayStartEquityStore,
    readback: (identity) => readAuthoritativeMexcAccountRisk(Object.freeze({ ...identity, environment })),
    writer,
    executionStateStore: createProductionExecutionStateStore(),
    executionAuditStore: createProductionExecutionAuditStore(),
  }));
}
