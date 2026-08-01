# DizyTrades Release Notes

This is a living high-level history of user-facing milestones. Pull requests remain the detailed technical record.

## Current active beta

### DizyBrain

- Added the DizyBrain transparent signal-reasoning drawer.
- Added terminal top-bar access and a floating launcher.
- Added current confluence, bias, phase, risk context and setup progression.
- Removed stale historical BUY/SELL text from the current setup view.
- Removed invented fixed confluence thresholds.
- Added regression coverage separating current setup direction from historical signal context.

### DizyFlow

- Added grouped depth-of-market bids and asks.
- Added trade bubbles and public MEXC transaction processing.
- Added bounded in-memory and persistent liquidity history.
- Added heatmap render diagnostics, retained invalidation and effective display-bin geometry.
- Added feed-health, delayed, offline and recovery states.
- Heatmap data and diagnostics exist, but stable customer-facing rendering remains active work.

### DizyCharts and drawing tools

- Expanded native timeframe support and market discovery.
- Added support/resistance, VWAP, Volume Profile, Fibonacci, structure labels and regression channels.
- Added editable manual drawings, extension modes, object history and safer hit testing.
- Added display indicators including moving averages, Bollinger Bands, RSI, MACD and ATR.
- Improved price countdown, rollover stability, label lanes and profile-safe plotting.

### DizySignals

- Added confirmed-candle deterministic analysis.
- Added historical signal scanning beyond short recent windows.
- Added stable signal timestamps, deduplication and five-part detail records.
- Added Pine-parity reporting without fabricated returns.
- Added paper simulation fingerprints that ignore harmless live UI changes.

### DizyPaper

- Added manual and signal-driven simulation.
- Added fixed-margin, fixed-notional and equity-percentage sizing.
- Added leverage-aware notional calculations, fees and mark-to-market presentation.
- Added saved snapshots, per-user isolation and impossible-liquidity rejection.

### DizyDEX and market browser

- Added unified MEXC spot and perpetual discovery.
- Added on-chain pool discovery through public providers.
- Added quote filters, source-aware searches, favourites and graceful provider degradation.

### DizyAcademy

- Added beginner, intermediate and advanced lesson groups.
- Added DizySignals, DizyFlow, DOM, heatmap, order-flow and institutional concepts.
- Added search, browser-local progress and responsive course navigation.
- Added original SVG lesson diagrams and subsequent visual corrections.

### Product and platform

- Added public marketing pages and branded product navigation.
- Added view-only terminal sessions.
- Added account storage, isolated profiles and saved workspaces.
- Added production loading, recovery, not-found, sign-in and signup states.
- Rewrote the repository README around the product.
- Added automated lint, test and production-build gates.

## In progress

- MEXC Last, Fair and Index price sources
- Manual Paper Simulator v2 with exchange-style leverage and liquidation
- Market Depth histogram beside the price scale
- DizyBrain typed state contract
- DizyAcademy product refresh

## Release-note policy

When a milestone ships:

1. Add a concise user-facing summary here.
2. Avoid claiming incomplete or diagnostic-only work as customer-ready.
3. Link detailed implementation questions to the relevant pull request.
4. Keep security-sensitive future work clearly separated from available beta features.
