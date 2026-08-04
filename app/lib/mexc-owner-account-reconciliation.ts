import "server-only";

import {
  latestPublicRiskPrice,
  readManualAccount,
  type ManualAccount,
} from "./manual-paper";
import {
  MexcDizyPaperReconciliationError,
  reconcileMexcAccountWithDizyPaper,
  type MexcDizyPaperReconciliation,
} from "./mexc-dizypaper-reconciliation";
import type { MexcOwnerAccountCompanionRefreshResult } from "./mexc-owner-account-companion";
import {
  appendOwnerMexcShadowAudit,
  type MexcOwnerShadowAuditEntry,
} from "./mexc-owner-shadow-audit";

export const MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION =
  "mexc-owner-account-reconciliation/1.1.0" as const;

const NO_MARKS: readonly [] = Object.freeze([]);

export type MexcOwnerPaperMarkObservation = Readonly<{
  symbol: string;
  status: "fresh" | "unavailable";
  price: number | null;
  source: string | null;
  message: string | null;
}>;

export type MexcOwnerAccountReconciliationState =
  | Readonly<{
      policyVersion: typeof MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION;
      status: "fresh";
      displayEligible: true;
      decisionEligible: false;
      report: MexcDizyPaperReconciliation;
      paperAccount: Readonly<{
        updatedAt: string;
        cashBalance: number;
        startingBalance: number;
        openPositionCount: number;
      }>;
      marks: readonly MexcOwnerPaperMarkObservation[];
      audit: MexcOwnerShadowAuditEntry;
      failure: null;
    }>
  | Readonly<{
      policyVersion: typeof MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION;
      status: "blocked";
      displayEligible: false;
      decisionEligible: false;
      reason: "account-state-not-fresh";
      report: null;
      paperAccount: null;
      marks: readonly [];
      audit: null;
      failure: null;
    }>
  | Readonly<{
      policyVersion: typeof MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION;
      status: "unavailable";
      displayEligible: false;
      decisionEligible: false;
      report: null;
      paperAccount: null;
      marks: readonly MexcOwnerPaperMarkObservation[];
      audit: null;
      failure: Readonly<{
        reason:
          | "paper-account-unavailable"
          | "reconciliation-failed"
          | "audit-persistence-failed";
        message: string;
      }>;
    }>;

type MarkResult = Readonly<{ price: number; source: string }>;
type AppendAudit = typeof appendOwnerMexcShadowAudit;

type Dependencies = Readonly<{
  readPaperAccount?: (userId: string) => Promise<ManualAccount>;
  loadPublicMark?: (symbol: string, previous?: number) => Promise<MarkResult>;
  appendAudit?: AppendAudit;
}>;

function blocked(): MexcOwnerAccountReconciliationState {
  return Object.freeze({
    policyVersion: MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION,
    status: "blocked" as const,
    displayEligible: false as const,
    decisionEligible: false as const,
    reason: "account-state-not-fresh" as const,
    report: null,
    paperAccount: null,
    marks: NO_MARKS,
    audit: null,
    failure: null,
  });
}

function unavailable(
  reason: Extract<MexcOwnerAccountReconciliationState, { status: "unavailable" }>["failure"]["reason"],
  message: string,
  marks: readonly MexcOwnerPaperMarkObservation[] = NO_MARKS,
): MexcOwnerAccountReconciliationState {
  return Object.freeze({
    policyVersion: MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION,
    status: "unavailable" as const,
    displayEligible: false as const,
    decisionEligible: false as const,
    report: null,
    paperAccount: null,
    marks,
    audit: null,
    failure: Object.freeze({ reason, message }),
  });
}

function safeMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  return message.length > 0 && message.length <= 240 ? message : fallback;
}

async function defaultMarkLoader(symbol: string, previous?: number): Promise<MarkResult> {
  const result = await latestPublicRiskPrice(symbol, previous);
  return Object.freeze({
    price: result.price,
    source: String(result.source),
  });
}

async function observeMarks(
  account: ManualAccount,
  loadPublicMark: NonNullable<Dependencies["loadPublicMark"]>,
) {
  const positions = Object.values(account.positions);
  const bySymbol = new Map<string, number | undefined>();
  for (const position of positions) {
    if (!bySymbol.has(position.symbol)) {
      bySymbol.set(position.symbol, position.lastRiskPrice ?? undefined);
    }
  }
  const observations = await Promise.all(
    [...bySymbol.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([symbol, previous]) => {
        try {
          const result = await loadPublicMark(symbol, previous);
          if (!Number.isFinite(result.price) || result.price <= 0) {
            throw new TypeError("Public mark was not a positive finite price.");
          }
          return Object.freeze({
            symbol,
            status: "fresh" as const,
            price: result.price,
            source: result.source,
            message: null,
          });
        } catch (error) {
          return Object.freeze({
            symbol,
            status: "unavailable" as const,
            price: null,
            source: null,
            message: safeMessage(error, "Current public mark is unavailable."),
          });
        }
      }),
  );
  return Object.freeze(observations);
}

function auditPayload(
  companion: MexcOwnerAccountCompanionRefreshResult,
  report: MexcDizyPaperReconciliation,
  marks: readonly MexcOwnerPaperMarkObservation[],
) {
  if (companion.account.state.status !== "fresh") {
    throw new TypeError("Fresh account state is required for shadow audit persistence.");
  }
  const snapshot = companion.account.state.snapshot;
  return Object.freeze({
    accountSnapshot: Object.freeze({
      observedAtMs: snapshot.observedAtMs,
      assets: Object.freeze(snapshot.assets.map((asset) => Object.freeze({
        currency: asset.currency,
        equity: asset.equity,
        availableBalance: asset.availableBalance,
        cashBalance: asset.cashBalance,
        positionMargin: asset.positionMargin,
        unrealizedPnl: asset.unrealizedPnl,
        frozenBalance: asset.frozenBalance,
      }))),
      positions: Object.freeze(snapshot.positions.map((position) => Object.freeze({
        symbol: position.symbol,
        side: position.side,
        marginMode: position.marginMode,
        state: position.state,
        holdVolume: position.holdVolume,
        holdAveragePrice: position.holdAveragePrice,
        liquidationPrice: position.liquidationPrice,
        initialMargin: position.initialMargin,
        realisedPnl: position.realisedPnl,
        leverage: position.leverage,
        adlLevel: position.adlLevel,
      }))),
    }),
    reconciliation: Object.freeze({
      calculationMethod: report.calculationMethod,
      settlementCurrency: report.settlementCurrency,
      paperUpdatedAt: report.paperUpdatedAt,
      summary: report.summary,
      account: report.account,
      positions: report.positions,
      warnings: report.warnings,
    }),
    marks: Object.freeze(marks.map((mark) => Object.freeze({
      symbol: mark.symbol,
      status: mark.status,
      price: mark.price,
      source: mark.source,
    }))),
  });
}

export async function reconcileOwnerMexcAccountWithDizyPaper(
  input: Readonly<{
    userId: string;
    companion: MexcOwnerAccountCompanionRefreshResult;
    settlementCurrency?: string;
  }>,
  dependencies: Dependencies = {},
): Promise<MexcOwnerAccountReconciliationState> {
  if (input.companion.account.state.status !== "fresh") return blocked();

  const readPaperAccount = dependencies.readPaperAccount ?? readManualAccount;
  const loadPublicMark = dependencies.loadPublicMark ?? defaultMarkLoader;
  const appendAudit = dependencies.appendAudit ?? appendOwnerMexcShadowAudit;
  let paperAccount: ManualAccount;
  try {
    paperAccount = await readPaperAccount(input.userId);
  } catch (error) {
    return unavailable(
      "paper-account-unavailable",
      safeMessage(error, "DizyPaper account could not be loaded."),
    );
  }

  const marks = await observeMarks(paperAccount, loadPublicMark);
  const markValues = Object.fromEntries(
    marks
      .filter((mark) => mark.status === "fresh" && mark.price !== null)
      .map((mark) => [mark.symbol, mark.price as number]),
  );

  let report: MexcDizyPaperReconciliation;
  try {
    report = reconcileMexcAccountWithDizyPaper({
      exchangeState: input.companion.account.state,
      paperAccount,
      marks: markValues,
      ...(input.settlementCurrency === undefined
        ? {}
        : { settlementCurrency: input.settlementCurrency }),
    });
  } catch (error) {
    const fallback = error instanceof MexcDizyPaperReconciliationError
      ? "MEXC and DizyPaper state could not be reconciled safely."
      : "Account reconciliation failed.";
    return unavailable("reconciliation-failed", safeMessage(error, fallback), marks);
  }

  let audit: MexcOwnerShadowAuditEntry;
  try {
    audit = await appendAudit(input.userId, {
      kind: "account-reconciliation",
      sourcePolicyVersion: MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION,
      payload: auditPayload(input.companion, report, marks),
    });
  } catch (error) {
    return unavailable(
      "audit-persistence-failed",
      safeMessage(error, "Immutable shadow audit persistence failed."),
      marks,
    );
  }

  return Object.freeze({
    policyVersion: MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION,
    status: "fresh" as const,
    displayEligible: true as const,
    decisionEligible: false as const,
    report,
    paperAccount: Object.freeze({
      updatedAt: paperAccount.updatedAt,
      cashBalance: paperAccount.cashBalance,
      startingBalance: paperAccount.startingBalance,
      openPositionCount: Object.keys(paperAccount.positions).length,
    }),
    marks,
    audit,
    failure: null,
  });
}
