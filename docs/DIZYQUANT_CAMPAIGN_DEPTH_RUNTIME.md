# DizyQuant campaign depth runtime

This runtime is the first operational public-depth source for the representative DizyQuant evidence campaign. It is intentionally narrower than the general DizyFlow presentation path and does not itself create campaign observations.

## Source boundary

The runtime subscribes to the existing shared MEXC futures `DepthCollector` on the server. It does not use the DOM depth payload, because the DOM route is intentionally capped for presentation. It does not open a second exchange depth websocket and it does not use rendered chart state.

Only the initial campaign symbols are accepted:

- `BTC_USDT`
- `ETH_USDT`
- `SOL_USDT`

Contract size and reviewed price-step metadata come from the existing MEXC market catalogue. If price-unit metadata is unavailable, the runtime can infer the smallest positive observed depth increment from the current source snapshot.

## Coverage rule

The first campaign study targets the depth-only resilience / absorption candidate family, whose reviewed formulas depend on displayed depth inside 25 basis points of midpoint.

A raw collector snapshot is therefore campaign-coverage-complete only when the deepest visible bid reaches at least `midpoint - 25 bps` and the deepest visible ask reaches at least `midpoint + 25 bps`.

The configured collector level count is never treated as proof of price-band coverage. An incomplete 25-bps book marks the research window gapped and resets continuous qualification.

This 25-bps proof is the eligibility boundary for the first resilience/absorption study. It does **not** certify that 50-bps or 100-bps ladder metrics have complete outer-band coverage. Those wider metrics remain exploratory unless a separate reviewed coverage rule proves their source range.

## Event-time sampling

The shared collector may publish multiple full-book envelopes per second. To keep the research window bounded, the runtime retains only the final proven source snapshot observed within each exchange-time second.

When the next second arrives, the completed second is handed to `DizyQuantLiveEvidenceWindow`. That window reconstructs exact one-second research boundaries using only the latest source state observed at or before the boundary, with its existing one-second maximum as-of age. Future observations never fill past boundaries.

Compact formula publications are evaluated at five-second boundaries. Raw full-book frames remain bounded in server memory; only the versioned Replay-grade research publication crosses the SSE boundary.

## Continuity and recovery

Continuous depth evidence requires the existing collector diagnostics to prove sequence continuity. Any of the following prevent continuity from carrying through the campaign window:

- version-gap advancement or reset;
- explicit `sequenceContinuous: false`;
- exchange-time regression;
- incomplete 25-bps source coverage;
- `RECONNECTING — LAST BOOK RETAINED` recovery state;
- missing or unproven source timestamp;
- incomplete depth snapshot.

Recovery clears the bounded research window rather than treating a retained book as a fresh observation.

## Trade evidence

This runtime does not claim public-trade sequence continuity. The existing MEXC deal websocket has no reviewed sequence/gap-proof contract, so the live evidence builder receives `tradeSequenceContinuous: null`.

Aggressive-flow values may therefore exist as gapped research evidence, but they cannot qualify a continuous-stream campaign cell through this runtime.

## Shock and regime methodology

The runtime does not choose a shock timestamp and does not assign `range`, `directional`, or `volatility-shock` regimes.

`resilience` remains absent until a separately reviewed methodology supplies an explicit shock timestamp. Publications carry `shockSelectionRequired: true` to make that boundary visible.

Likewise, no existing Wyckoff/Markup/Markdown UI phase is relabelled as campaign regime truth.

## Browser boundary

The authenticated route `/api/dizyquant/evidence/stream` emits only compact research publications. The browser keeps the latest publication in an in-memory map for subscribers.

The campaign runtime does not persist raw full books, raw campaign frames, or campaign publications to `localStorage`, `sessionStorage`, IndexedDB, a database, or a new service in this slice.

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

The next campaign slice must separately review and version:

1. shock-selection methodology for resilience/absorption predictors;
2. the three-regime campaign classification (`range`, `directional`, `volatility-shock`);
3. the cadence / deduplication rule for opening recorder samples;
4. the existing +60-second midpoint outcome completion path from the anti-lookahead recorder.

Only after those rules are reviewed can operational publications begin counting toward the 450-qualified-observation first matrix.
