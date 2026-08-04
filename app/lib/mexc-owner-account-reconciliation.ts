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

export const MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION =
  "mexc-owner-account-reconciliation/1.0.0" as const;

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
      failure: Readonly<{
        reason: "paper-account-unavailable" | "reconciliation-failed";
        message: string;
      }>;
    }>;

type MarkResult = Readonly<{ price: number; source: string }>;

type Dependencies = Readonly<{
  readPaperAccount?: (userId: string) => Promise<ManualAccount>;
  loadPublicMark?: (symbol: string, previous?: number) => Promise<MarkResult>;
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
    marks: Object.freeze([]),
    failure: null,
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
  let paperAccount: ManualAccount;
  try {
    paperAccount = await readPaperAccount(input.userId);
  } catch (error) {
    return Object.freeze({
      policyVersion: MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION,
      status: "unavailable" as const,
      displayEligible: false as const,
      decisionEligible: false as const,
      report: null,
      paperAccount: null,
      marks: Object.freeze([]),
      failure: Object.freeze({
        reason: "paper-account-unavailable" as const,
        message: safeMessage(error, "DizyPaper account could not be loaded."),
      }),
    });
  }

  const marks = await observeMarks(paperAccount, loadPublicMark);
  const markValues = Object.fromEntries(
    marks
      .filter((mark) => mark.status === "fresh" && mark.price !== null)
      .map((mark) => [mark.symbol, mark.price as number]),
  );

  try {
    const report = reconcileMexcAccountWithDizyPaper({
      exchangeState: input.companion.account.state,
      paperAccount,
      marks: markValues,
      ...(input.settlementCurrency === undefined
        ? {}
        : { settlementCurrency: input.settlementCurrency }),
    });
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
      failure: null,
    });
  } catch (error) {
    const fallback = error instanceof MexcDizyPaperReconciliationError
      ? "MEXC and DizyPaper state could not be reconciled safely."
      : "Account reconciliation failed.";
    return Object.freeze({
      policyVersion: MEXC_OWNER_ACCOUNT_RECONCILIATION_POLICY_VERSION,
      status: "unavailable" as const,
      displayEligible: false as const,
      decisionEligible: false as const,
      report: null,
      paperAccount: null,
      marks,
      failure: Object.freeze({
        reason: "reconciliation-failed" as const,
        message: safeMessage(error, fallback),
      }),
    });
  }
}
