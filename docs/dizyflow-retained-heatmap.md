# DizyFlow retained liquidity heatmap

The heatmap data path is independent of candle intervals. The browser owns one cache for each
`exchange:symbol`; the candle timeframe is only a projection input. A viewport request includes
35% overscan, follows every history cursor, applies the page seed at the left edge, and aborts an
older request when a new viewport wins. The cache merges sparse exchange-time transitions by
`timestamp:priceTick`, retains at most 40,000 records, and evicts records farthest from the active
window. It never asks the server to materialise the archive in memory.

The live SSE sequence advances the same cache. A discontinuity changes state to
`resynchronising` and reloads the current window. A quiet connection reports `unchanged`, not
stale; disconnect, resynchronisation, and genuine archive gaps have distinct states.

## Renderer

A single bottom-z-order Lightweight Charts primitive remains attached for the lifetime of the
series. It maintains an offscreen canvas keyed by the viewport projection, visible price range,
settings, symbol, and data revision. Paints with an unchanged key composite that retained surface;
projection/settings/history changes rebuild the visible surface. A right-edge data-only revision
is instrumented as an incremental patch. Five-second exchange slices are combined to at least one
pixel when zoomed out, and price aggregation follows visible price-per-pixel. Bubbles are painted
after the retained heatmap, while Lightweight Charts paints candles and labels above the bottom
primitive.

Diagnostics expose archive and loaded ranges, cached pages and records, live sequence/state,
effective time and price bins, visible cell count, and full-rebuild/incremental/reuse counters.

## Performance fixture

The deterministic tests generate six hours of five-second changes, persistent bid and ask walls,
modifications/removals, a real gap, multiple candle projections, and right-edge live changes. A
20,000-record cache workload is used to guard bounded responsive ingestion and navigation reuse.
