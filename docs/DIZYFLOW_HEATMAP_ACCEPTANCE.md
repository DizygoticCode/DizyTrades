# DizyFlow heatmap acceptance

## Scope

This acceptance closes the focused customer-facing liquidity-heatmap programme. It does not claim private matching-engine visibility, queue position, hidden order identity or predictive intent.

The accepted product boundary is:

- public displayed depth is retained as bounded liquidity observations;
- executed public trades are retained and rendered separately;
- the heatmap remains a bottom chart layer;
- executed-trade bubbles remain a separate top presentation layer;
- live, recovering, Replay and unavailable conditions are labelled rather than silently substituted;
- display aggregation changes presentation only and does not rewrite the captured public feed.

## Delivery evidence

The programme was delivered through four focused slices:

1. PR #206 projected retained liquidity into stable Bookmap-style bands and restored DizyFlow/DOM imbalance evidence.
2. PR #207 added bounded palettes, band and slice dimensions, time aggregation, price grouping and persistent defaults.
3. PR #208 widened public depth capture, added silent-feed recovery and bounded retained server tiles.
4. PR #209 completed liquidity/trade layer ordering, seamless bands and explicit recovering/synchronising presentation.

Each slice carried deterministic and Chromium coverage. PR #212 adds a production-safe browser acceptance to the existing read-only Render rehearsal.

## Deployed acceptance

The production probe:

- waits for the configured Render service and exact `main` commit when run after merge;
- enters through **Open View-Only Terminal**;
- requires DizyFlow to reach `Live`, `Recovering / sync` or `Replay`;
- enables Heatmap and Bubbles independently;
- verifies that chart canvases contain painted pixels;
- confirms the heatmap switch changes the rendered chart;
- applies a bounded alternative palette, time slice, detection range and price grouping, then confirms the renderer changes;
- restores the prior browser preference;
- resizes the viewport and confirms the chart dimensions and toolbar remain responsive.

The report stores only state labels, control booleans, dimensions, sampled-pixel counts and checksums. Raw prices, trades, depth rows, page text, screenshots and storage inventories are excluded.

## Bounded-resource evidence

The heatmap collector and server history remain bounded by implementation contracts introduced before this acceptance. The deployed browser probe does not perform a load test and does not export the raw stream. Render Starter suitability continues to depend on those deterministic ceilings plus ordinary service monitoring.

## Closure rule

The roadmap programme may be marked complete only when:

- the normal lint, deterministic, production-build and full Chromium workflow passes for PR #212;
- the pull-request Render rehearsal passes against the currently deployed service;
- after merge, the `main` Render rehearsal observes the exact merge commit live and its deployed DizyFlow acceptance passes.

Any later regression reopens the affected acceptance criterion; it does not erase the distinction between displayed liquidity and executed volume.
