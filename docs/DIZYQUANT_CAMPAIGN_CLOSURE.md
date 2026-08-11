# DizyQuant Representative Campaign Closure

This document defines the final review path for the first bounded DizyQuant representative evidence campaign. It does not change the campaign matrix, lower any qualification threshold or enable DizyQuant in DizySignals.

## Boundary

Production Render remains a **collector and compact-export boundary only**. It does not run Replay model fitting, parameter search or campaign closure logic.

The active campaign remains:

- metric: `depth-imbalance-25bps`;
- outcome: `midpoint-response-60s-bps/1.0.0`;
- symbols: `BTC_USDT`, `ETH_USDT`, `SOL_USDT`;
- regimes: `range`, `directional`, `volatility-shock`;
- minimum: 50 qualified representative observations per symbol × regime cell;
- first complete matrix: 450 qualified representative observations across all nine coverage-ready cells;
- maximum submitted campaign samples: 10,000.

Coverage-ready is a prerequisite for review. It is not validation, prediction, signal eligibility or promotion.

## 1. Export the durable production study

An authenticated owner may request:

```text
GET /api/dizyquant/evidence/export
```

The response is a private, no-store JSON attachment. It contains only the compact campaign study material required by the existing Replay laboratory:

- campaign/formula identities;
- campaign status and 3×3 cell summaries;
- qualified/rejected counts and stable rejection totals;
- compact qualified observations containing observation ID, event time, symbol, regime, metric ID, predictor and future outcome;
- explicit research-only and ineligibility flags.

The export deliberately excludes raw order books, raw trades, pending predictor snapshots, recorder provenance payloads, account state, credentials and order instructions.

The export route is GET-only and owner-only. It does not run the Replay laboratory or write back to campaign state.

## 2. Run the closure study outside production

Use the repository's existing Node/tsx toolchain:

```bash
npm run dizyquant:close -- ./dizyquant-representative-v1-study.json ./dizyquant-closure-report.json
```

If the exported 3×3 matrix is not coverage-ready, the command produces an `awaiting-coverage` report, runs **no Replay model fitting**, and exits with status code 2.

A coverage-ready export is revalidated before study execution. Tampered identities, unordered/duplicate observations, inconsistent counts, incorrect cell coverage or changed eligibility flags fail closed.

## 3. Coverage-ready study set

Once all nine cells are coverage-ready, `dizyquant-campaign-closure/1.0.0` runs:

1. one chronological Replay study across every qualified representative observation;
2. one separate Replay study for each of the nine symbol × regime cells;
3. three overall chronological holdout-sensitivity studies at 20%, 30% and 40% held-out fractions;
4. the existing circular-rotation null comparison and expanding-prefix walk-forward checks inside every Replay-lab run;
5. held-out true-positive, true-negative, false-positive and false-negative diagnostics where a fitted lab model exists.

The per-cell studies expose symbol/regime dependence. The holdout variants expose one bounded parameter-sensitivity check. The confusion diagnostics make false-positive and false-negative behaviour explicit rather than hiding it behind aggregate accuracy.

## 4. Closure recommendation

The closure recommendation is intentionally conservative:

- `retain-experimental` — overall, all nine cells and all holdout sensitivities independently return the existing lab's `retain-experimental` decision;
- `reject-current-formula` — overall, all nine cells and all holdout sensitivities independently return `reject-current-formula`;
- `insufficient-evidence` — the overall, any cell or any sensitivity study cannot produce adequate held-out evidence;
- `revise-current-formula` — valid reviewed evidence is mixed across the overall, cell or sensitivity studies.

A mixed result is never rounded up to a retain decision.

`retain-experimental` means only that the hypothesis remains worth researching. It does **not** mean validated, predictive, decision-eligible, signal-eligible, execution-eligible or promotion-eligible.

## 5. Programme closure

The first representative campaign can be marked complete only after all of the following are true:

- the real persisted production export reports all nine cells coverage-ready;
- the closure command has been run against that exact export;
- the resulting overall, per-cell, null, walk-forward, sensitivity and false-positive/false-negative evidence has been reviewed;
- an explicit retain, reject or revise conclusion is recorded for the exact formula versions;
- the result remains isolated from DizySignals and execution.

If the result is retain-experimental or revise-current-formula, any follow-up research is a separate versioned programme. If a future proposal seeks signal influence, it requires a separate promotion PR and independent review. A negative result is a valid completion outcome.
