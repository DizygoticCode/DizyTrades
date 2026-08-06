# Pending-order programme independent audit

Date: 2026-08-06

Scope: issue #137, delivered through focused PRs #224–#230. This review covers the shared lifecycle, futures limit and conditional execution, chase-limit behaviour, position-bound protective exits, spot reservations/accounting, Replay evidence and DizyAcademy material. Its cross-programme conclusions are enforced permanently by `tests/pending-order-programme-audit.test.mjs`, not only recorded in prose.

## Conclusion

The programme is suitable for deterministic simulation and education. It does not create a live order route, does not request private MEXC data and does not claim exchange queue priority. Order and account outcomes are derived from supplied snapshots or explicit simulated fill observations and are reproducible from immutable evidence.

## Evidence matrix

| Requirement | Implementation | Permanent evidence |
| --- | --- | --- |
| Typed immutable lifecycle | `app/lib/pending-order-lifecycle.ts` | `tests/pending-order-lifecycle.test.mjs` |
| Futures LIMIT, GTC, IOC, FOK and post-only | `app/lib/futures-limit-order-simulation.ts` | `tests/futures-limit-order-simulation.test.mjs` |
| Trigger-market, trigger-limit and trailing stop | `app/lib/futures-conditional-order-simulation.ts` | `tests/futures-conditional-order-simulation.test.mjs` |
| Chase-limit and protection distance | `app/lib/futures-chase-limit-simulation.ts` | `tests/futures-chase-limit-simulation.test.mjs` |
| TP/SL, limit TP/SL and reduce-only binding | `app/lib/manual-paper.ts`, `app/lib/manual-paper-reduce-only.ts`, `app/lib/futures-protective-exit-simulation.ts` | `tests/manual-paper-reduce-only.test.mjs`, `tests/futures-protective-exit-simulation.test.mjs` |
| Spot MARKET, LIMIT, LIMIT_MAKER, IOC and FOK | `app/lib/spot-order-simulation.ts` | `tests/spot-order-simulation.test.mjs` |
| Spot available/reserved accounting | `app/lib/spot-order-simulation.ts` | `tests/spot-order-simulation.test.mjs` |
| Guided education and practical exercises | `app/school/pending-order-academy.ts` | `tests/pending-order-academy.test.mjs` |
| Cross-programme safety boundary | all modules above | `tests/pending-order-programme-audit.test.mjs` |

## Lifecycle and Replay findings

- Every order begins with a submitted event and accepts only strictly increasing event sequences.
- Duplicate event identifiers, stale book sequences and backwards observation times fail closed.
- Terminal orders cannot consume later events or observations.
- Cancel-and-replace preserves the original order and links the replacement instead of rewriting history.
- Generated order events replay to an equivalent immutable state.
- Conditional, chase and protective observations replay in the same order and produce equivalent final state.

## Futures findings

- LIMIT eligibility uses supplied visible order-book levels and instrument precision.
- IOC cancels only its unfilled remainder; FOK either fills completely or cancels without a partial fill.
- Post-only rejects a marketable order rather than silently taking liquidity.
- Trigger activation is distinct from execution. A trigger-limit order may remain working after activation.
- Trailing stops preserve activation, favourable extreme and callback evidence.
- Chase-limit repricing follows the same-side quote within the configured absolute protection distance. A snapshot alone does not prove queue position or a maker fill.
- Protective exits bind to an expected trade identity, side, symbol and market. They are always reduce-only, use the opposite closing side, cap oversized requested quantity and fail closed if their outstanding remainder could reverse a changed position.
- Take-profit and stop-loss directions are position-aware: long TP and short SL trigger above; long SL and short TP trigger below.
- Protective market exits consume supplied visible depth as taker simulation. Protective limit exits may fill at activation or remain working and later receive maker evidence.

## Spot accounting findings

- Buy orders reserve quote; sell orders reserve base.
- Partial buy fills spend actual execution cost and return price improvement immediately.
- GTC retains only the outstanding reservation.
- IOC, FOK, manual cancellation and replacement release the exact unused reservation.
- Completed fills survive cancellation and replacement.
- Replaying immutable account events reconstructs the same available and reserved balances.
- Insufficient funds and invalid precision reject before mutating balances.

## Manual Paper compatibility

Existing Manual Paper positions retain automatic stop-loss, take-profit and liquidation evaluation. Triggered risk exits remain position-bound reduce-only closes with immutable trigger provenance. The protective-exit simulator adds the previously missing explicit pending-order representation for market and limit TP/SL without replacing the established Manual Paper risk engine.

## Security and product boundary

The pending-order simulation modules are pure reducers. They do not read credentials, inspect environment secrets, call MEXC private endpoints or submit exchange orders. They accept supplied public/simulated observations and return immutable evidence. Live execution remains separately locked behind the future guarded-execution milestone.

## Honest limitations

- Visible public depth cannot reveal hidden liquidity or exact exchange queue priority.
- Maker/taker classification describes simulated execution evidence, not an exchange acknowledgement.
- Chase-limit fills require explicit simulated maker-fill evidence; quote movement alone is not treated as a fill.
- Fees and exchange-specific behaviour remain bounded by supplied rules and simulation assumptions.
- This programme does not connect pending-order reducers to a private MEXC account or live execution route.

## Release decision

Retain and close issue #137 once lint, the complete deterministic suite, the production build and Chromium all pass on the exact final PR head. Any later live-execution integration requires a separate security programme and independent review.
