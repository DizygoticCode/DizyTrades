# DizyQuant campaign depth runtime

This runtime is the operational public-depth source for the representative DizyQuant evidence campaign. It is intentionally narrower than the general DizyFlow presentation path and does not itself create or count campaign observations.

## Source boundary

The runtime subscribes to the existing shared MEXC futures `DepthCollector` on the server. It does not use the DOM depth payload, because the DOM route is intentionally capped for presentation. It does not open a second exchange depth websocket and it does not use rendered chart state.

Only the initial campaign symbols are accepted:

- `BTC_USDT`
- `ETH_USDT`
- `SOL_USDT`

Contract size and reviewed price-step metadata come from the existing MEXC market catalogue. If price-unit metadata is unavailable, the runtime can infer the smallest positive observed depth increment from the current source snapshot.

## Coverage rule

The first depth campaign proves displayed depth through 25 basis points of midpoint. That source boundary is sufficient for the reviewed shock methodology and for the existing 10-bps / 25-bps ladder metrics.

A raw collector snapshot is campaign-coverage-complete only when the deepest visible bid reaches at least `midpoint - 25 bps` and the deepest visible ask reaches at least `midpoint + 25 bps`.

The configured collector level count is never treated as proof of price-band coverage. An incomplete 25-bps book resets continuous qualification.

This 25-bps proof does **not** certify 50-bps or 100-bps ladder metrics, nor does it prove a stable outer boundary for formulas that aggregate the entire displayed collector frame. Those wider or whole-frame metrics remain exploratory unless a separate reviewed coverage rule proves their required source range.

## Event-time sampling

The shared collector may publish multiple full-book envelopes per second. To keep the research window bounded, the runtime retains only the final proven source snapshot observed within each exchange-time second.

When the next second arrives, the completed source book is handed to `DizyQuantLiveEvidenceWindow`. In parallel, the runtime stores a bounded exact-boundary frame for the reviewed 60-second regime methodology. Both paths use only the last book observed before the exact boundary; a future observation never fills a past research boundary.

Compact formula publications are evaluated at five-second boundaries. The five-second publication cadence exists to keep research state current and is **not** the campaign collection cadence. Raw full-book frames remain bounded in server memory; only the versioned compact publication crosses the SSE boundary.

## Continuity and recovery

A labelled campaign publication requires a complete 61-frame, 60-second window of proven continuous depth. Any of the following clears or prevents regime qualification:

- version-gap advancement or reset;
- explicit or unproven sequence continuity;
- exchange-time regression or missing event-time seconds;
- incomplete 25-bps source coverage;
- `RECONNECTING — LAST BOOK RETAINED` recovery state;
- missing or unproven source timestamp;
- incomplete depth snapshot.

Recovery clears the bounded research and regime windows rather than treating a retained book as a fresh observation.

## Regime and shock methodology

The runtime now applies `dizyquant-campaign-regime/1.0.0` only after the exact 60-second predictor window is complete.

The resulting research stratum is one of:

- `range`;
- `directional`;
- `volatility-shock`.

The methodology never uses the later +60-second outcome. `volatility-shock` takes precedence when the reviewed resilience thresholds identify an interior shock. The selected deterministic shock timestamp is then passed back into the existing `DizyQuantLiveEvidenceWindow`, which builds the real resilience Replay snapshot from the same bounded evidence. A shock-labelled publication fails closed if that resilience snapshot cannot be produced as fresh continuous evidence.

The compact publication records the regime formula version, exact regime-window endpoints, direction label, selected shock timestamp when present, and the exact predictor-boundary midpoint needed later by the anti-lookahead recorder.

No Wyckoff/Markup/Markdown UI phase, chart timeframe or strategy label enters this classification.

## Representative matrix versus shock-only hypotheses

PR #214 used `absorption-candidate-flag` as the canonical synthetic campaign fixture. The live formula boundary is stricter: that flag exists only when a qualifying resilience shock is nominated, while the reviewed regime methodology necessarily labels such a window `volatility-shock`.

Therefore an absorption-candidate campaign cannot honestly populate the six `range` and `directional` symbol cells. The runtime must never manufacture those values.

The scientifically clean nine-cell baseline comes from the exact t0 **ladder Replay snapshot**, because the runtime proves the source range used by its 10-bps and 25-bps metrics on every labelled frame. `depth-imbalance-25bps` is the natural first representative metric: it is snapshot-grade, informational and defined solely from visible bid-versus-ask notional inside the proven 25-bps boundary.

The 30-second liquidity-migration snapshot remains useful exploratory evidence but is not declared the representative matrix basis here because its existing formulas aggregate the full displayed frame. Shock windows may additionally contribute the separate resilience Replay snapshot to absorption/exhaustion studies. Campaign evaluation still selects one metric at a time, so formula-family records are never silently combined into one predictor.

## Trade evidence

This runtime does not claim public-trade sequence continuity. The existing MEXC deal websocket has no reviewed sequence/gap-proof contract, so the live evidence builder receives `tradeSequenceContinuous: null`.

Aggressive-flow values may therefore exist as gapped research evidence, but they cannot qualify a continuous-stream campaign cell through this runtime.

## Browser boundary

The authenticated route `/api/dizyquant/evidence/stream` emits only compact research publications. The browser keeps the latest publication in an in-memory map for subscribers.

The campaign runtime does not persist raw full books, raw campaign frames, campaign publications, recorder samples or campaign counts to `localStorage`, `sessionStorage`, IndexedDB, a database, or a new service in this slice.

The existing presentation-only DizyQuant live snapshot storage is separate from this campaign feed.

## Safety boundary

All publications remain:

- `researchOnly: true`
- `decisionEligible: false`
- `signalEligible: false`
- `executionEligible: false`
- `promotionEligible: false`

No DizySignals scoring, Paper account state, Journal state, DizyBrain behaviour state, private MEXC API request, credential use, or live-order route enters this runtime.

## Next boundary

The next campaign slice is the recorder-runner policy. It must separately version and enforce:

1. the 25-bps ladder predictor used for the nine-cell representative campaign, beginning with `depth-imbalance-25bps` unless a reviewed change says otherwise;
2. shock-only resilience sample handling without pretending those predictors exist in non-shock regimes;
3. campaign collection cadence and overlap/deduplication rules so the five-second publication cadence cannot inflate the evidence count;
4. exact +60-second midpoint observation and expiry through the existing anti-lookahead recorder;
5. bounded dataset export/retention before any observation is described as counting toward the 450-qualified-observation first matrix.

Until that runner exists, this runtime publishes labelled research evidence but the campaign count remains zero.
