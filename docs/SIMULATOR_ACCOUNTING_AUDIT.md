# Simulator Accounting Audit

Status: completed for the active simulation-only beta in August 2026.

This review covers DizyPaper Manual Paper accounting and the confirmed-signal historical simulator. It does not claim exchange-exact fills, margin, liquidation or queue priority, and it does not approve live execution.

## Manual Paper accounting model

Manual Paper treats `cashBalance` as the account cash ledger. Position margin is reserved inside that ledger rather than removed from cash. Entry fees are removed from cash immediately but remain attached to an open position until that position is reduced or closed.

For native v4 accounts, the authoritative state bridge is:

```text
cash balance
= starting balance
+ cumulative realised P/L
- entry fees still attached to open positions
```

Funding cash movements enter both `cashBalance` and cumulative `realisedPnl` when applied. A completed fill reports trade-level net P/L including attributed funding, but the account ledger does not add that funding twice.

## Executable reconciliation

`manual-paper-accounting-reconciliation-v1` verifies:

- the native cash-state bridge;
- fill notional against price and quantity;
- entry and exit fee identities;
- trading-fee plus liquidation-penalty composition where evidence exists;
- margin-settlement cash before, applied delta and cash after;
- requested close cash movement against gross P/L and fee;
- close realised P/L against applied settlement, allocated entry fee and funding;
- gross P/L against the reduce-only target side;
- funding notional and capped-payment direction/magnitude;
- cumulative fees, funding and realised P/L when complete native history remains retained;
- lower-bound safety when history has reached its bounded retention window.

The reconciliation runs when current Manual Paper records are normalised and when backups are validated. A current account or backup whose economic state no longer reconciles is rejected rather than silently repaired.

## Legacy preservation boundary

Manual Paper v2/v3 records did not retain every field needed to reconstruct a complete modern cash ledger. Their recorded values remain preserved under the existing migration policy. The audit validates retained fill/payment evidence but reports the unavailable aggregate bridge as a limitation instead of inventing historical economics.

## Storage isolation finding

The runtime Manual Paper store previously removed unsupported owner-ID characters. That could alias two unsafe internal identifiers to the same filename. Manual Paper now uses the shared strict one-to-one owner-ID validator and rejects unsafe identifiers. The per-user operation queue uses the same validated key and removes completed queue entries.

## Confirmed-signal simulator findings

### Maximum notional was not actually enforced

The former sizing formula divided maximum notional by leverage and treated the result as stop-risk cash. Those units are different, so the resulting position could exceed the user’s configured maximum notional.

The corrected sizing method is `risk-stop-notional-leverage-cap-v1`:

```text
configured risk cash = equity × risk percentage
notional capacity = min(configured maximum notional, equity × maximum leverage)
risk cash allowed by notional = notional capacity × stop distance ÷ entry price
applied risk cash = min(configured risk cash, risk cash allowed by notional)
quantity = applied risk cash ÷ stop distance
```

Every simulated trade now retains applied risk cash, notional, initial margin, sizing method and the binding cap source. The resulting notional cannot exceed either the configured maximum or equity-based leverage capacity.

### Open mark-to-market positions polluted completed statistics

The final open `MARK` trade remains in the trade list so live mark-to-market equity can update without changing confirmed-candle history. It no longer contributes to completed wins, win rate or profit factor.

The summary now separates:

- total simulated entries;
- completed trades;
- open marked trades;
- realised P/L;
- marked/unrealised P/L.

`endingEquity` remains mark-to-market and is reconciled as:

```text
ending equity = initial equity + realised P/L + marked P/L
```

## Accepted approximation boundaries

- Manual Paper uses public visible depth, not matching-engine queue priority.
- Fees and liquidation penalties are modelled assessments. Loss settlement may be capped by the simulator’s isolated/cross collateral rules.
- Funding uses documented public rates with an observed Fair/Last price proxy where the historical settlement price is unavailable.
- Cross margin is a single-asset USDT shared-pool approximation using last known marks.
- Retained fill and funding histories are bounded; exact aggregate reconstruction is not claimed after a retention limit is reached.
- The confirmed-signal simulator does not currently model execution fees, funding or depth fills. It is a deterministic strategy comparison tool, not an exchange-account replica.
- Live execution remains disabled.

## Automated evidence

Tests cover:

- maximum-notional and leverage-cap sizing;
- exclusion of open `MARK` trades from completed statistics;
- mark-to-market equity decomposition;
- Manual Paper opening, partial close, final close, funding and Reverse lifecycle reconciliation;
- top-level cash, fee and realised-P/L tamper rejection through backup validation;
- strict Manual Paper owner-ID rejection;
- all existing margin, funding, depth, reduce-only, migration and recovery suites.
