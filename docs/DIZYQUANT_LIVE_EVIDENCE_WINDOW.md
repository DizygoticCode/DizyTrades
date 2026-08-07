# DizyQuant live evidence window

## Purpose

This module is the source-quality bridge between the existing public DizyFlow domain types and the versioned DizyQuant formula layer.

It does **not** start the representative campaign by itself. It prepares bounded Replay-grade predictor evidence without widening raw-data retention and without inventing a market-regime or shock-selection methodology.

## Inputs

The bridge accepts only public market evidence already represented by DizyTrades:

- `BookView` displayed public depth;
- `RawTrade` public executions;
- the reviewed contract size and price step;
- explicit depth continuity/gap metadata;
- explicit public-trade continuity/gap metadata when that can actually be proven.

No account, Paper, Journal, Behaviour, credential, private exchange or execution state is accepted.

## Bounded ephemeral window

Raw source material remains in memory only inside one `DizyQuantLiveEvidenceWindow` instance.

The current boundary is:

- 66 seconds of raw source retention;
- at most 512 depth observations;
- at most the existing aggressive-flow formula trade ceiling;
- clear the entire source window when a depth sequence break or explicit depth gap is observed.

This bridge does not persist raw books, raw public trades or heatmap payloads. Only formula-level Replay snapshots are intended to cross into the evidence recorder introduced by PR #244.

## Exact-window reconstruction

The 10-second, 30-second and 60-second formulas require exact event-window endpoints, while live public depth is not guaranteed to arrive on exact one-second timestamps.

The bridge therefore uses versioned **as-of reconstruction**:

1. research boundaries are exact one-second timestamps;
2. for each boundary, select only the latest valid depth observation whose source timestamp is at or before that boundary;
3. never use an observation from the future to fill an earlier boundary;
4. reject the boundary if the selected depth is more than one second old;
5. retain the observed book state while assigning the exact research boundary to the sampled frame;
6. any missing boundary makes the relevant depth window gapped.

This is a source-resampling rule, not a market-regime rule and not a trading signal.

## Evidence families remain separate

The bridge deliberately emits separate Replay snapshots:

| Snapshot | Evidence | Continuity boundary |
| --- | --- | --- |
| Ladder | current displayed book | snapshot-grade |
| Aggressive flow | public trades + opening/closing depth context | depth continuity **and independent public-trade continuity** |
| Liquidity migration | sampled displayed-depth sequence | depth continuity |
| Resilience | sampled displayed-depth sequence + explicit shock timestamp | depth continuity |

The snapshots are not merged. A healthy depth stream therefore cannot silently upgrade an unproven public-trade stream to continuous-stream-grade campaign evidence.

## Public-trade continuity

Public-trade continuity is an explicit input to `build()`.

If the runtime cannot prove that the public trade stream remained continuous for the requested window, it must pass `null` or a gap state. The aggressive-flow snapshot then remains gapped even if valid trades were observed and even if depth continuity is healthy.

A zero-trade window must never be treated as proven zero activity merely because the depth stream was alive.

## Shock handling

The bridge does not choose a shock.

`eligibleShockTimestamps()` may enumerate interior one-second timestamps that satisfy the already-versioned resilience formula thresholds when the full 60-second depth window is continuous. Enumeration is not selection.

A resilience Replay snapshot is created only when `build()` receives an explicit interior `shockTimestampMs`.

The separate methodology programme must still define how a shock timestamp is selected for campaign sampling. Until then, absorption/exhaustion candidate metrics are absent from normal bridge output.

## Regime handling

The bridge does not label `range`, `directional` or `volatility-shock` regimes.

Those labels belong to the evidence-recorder/campaign boundary and require a separately versioned, reviewed methodology. Existing DizyBrain/Wyckoff `marketPhase` labels are not silently rebranded as campaign regimes.

## Anti-lookahead guarantees

- as-of depth sampling can only look backward;
- aggressive trades use the exact half-open `[from, to)` formula window;
- Replay predictor snapshots end at the predictor boundary;
- no future 60-second outcome enters this module;
- outcome collection remains the responsibility of `evidence-recorder.ts`;
- shock and regime inputs remain explicit methodology inputs rather than inferred post hoc from future price action.

## Safety boundary

All outputs remain research-only:

- `decisionEligible=false`;
- `signalEligible=false`;
- `executionEligible=false`;
- `promotionEligible=false` at the bridge result boundary;
- no DizySignals coupling;
- no live-order route;
- no private MEXC request;
- no persistence backend or new service.

## Integration status

This module is intentionally introduced and reviewed before runtime attachment. The next source-integration PR may feed it from the existing DizyFlow depth/trade producers, but that integration must preserve the separate continuity boundaries documented above.
