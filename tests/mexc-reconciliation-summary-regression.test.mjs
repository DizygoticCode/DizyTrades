import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMexcAccountSnapshot,
} from "../app/lib/mexc-account-state-availability.ts";
import {
  buildMexcAccountStateSnapshot,
} from "../app/lib/mexc-account-state.ts";
import {
  reconcileMexcAccountWithDizyPaper,
} from "../app/lib/mexc-dizypaper-reconciliation.ts";
import {
  newManualAccount,
} from "../app/lib/manual-paper.ts";

function zeroPositionExchange() {
  const assets = [{
    currency: "USDT",
    positionMargin: 100,
    frozenBalance: 0,
    availableBalance: 10_000,
    cashBalance: 10_000,
    equity: 10_000,
    unrealized: 0.1,
    bonus: 0,
  }];
  const positions = [];
  const snapshot = buildMexcAccountStateSnapshot({
    assets,
    positions,
    reads: [
      {
        endpoint: "all-assets",
        permission: "trade-read",
        requestTimeMs: 999_990,
        receivedAtMs: 999_999,
        data: assets,
      },
      {
        endpoint: "open-positions",
        permission: "trade-read",
        requestTimeMs: 999_991,
        receivedAtMs: 1_000_000,
        data: positions,
      },
    ],
  });
  return evaluateMexcAccountSnapshot(snapshot, {
    nowMs: 1_000_100,
    maxAgeMs: 10_000,
  });
}

test("account summary remains independent from the zero-position summary", () => {
  const paperAccount = newManualAccount();
  paperAccount.updatedAt = new Date(1_000_000).toISOString();

  const result = reconcileMexcAccountWithDizyPaper({
    exchangeState: zeroPositionExchange(),
    paperAccount,
    marks: {},
  });

  assert.deepEqual(result.accountSummary, {
    aligned: 2,
    different: 2,
    incomparable: 0,
  });
  assert.deepEqual(result.summary, {
    aligned: 0,
    different: 0,
    incomparable: 0,
    exchangeOnly: 0,
    paperOnly: 0,
    ambiguousExchange: 0,
  });
});
