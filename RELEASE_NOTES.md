# DizyTrades Release Notes

This is a living high-level history of user-facing milestones. Pull requests remain the detailed technical record.

## Current active beta — August 2026

### Connected professional workflow

- Added DizyJournal with immutable Trade Reviews, notes, tags, archive, statistics and safe editing.
- Added Historical Replay Memory around eligible completed DizyPaper trades.
- Added deterministic DizyBrain historical trade reviews.
- Added DizyBrain Behaviour aggregation across valid reviewed samples.
- Added compact Historical DizyFlow capture around eligible completed trades.
- Added Guided Historical Trade Review with Context, Entry, Management, Exit and Reflection stages.
- Added continuous DizyReplay playback from 0.25× through 10×.
- Added Replay viewport following that preserves zoom and keeps the revealed candle in frame.

### Discovery and market structure

- Added DizyScanner with saved watchlists, bounded concurrency and top-volume fallback.
- Reused the authoritative DizySignals engine across scanner rows.
- Added setup direction, evidence split, phase, signal age, sorting and direct chart handoff.
- Added DizyStructure with UTC sessions, exact opening ranges, previous-day/week levels and anchored VWAP.
- Added confirmed HH/LH and HL/LL swings, nearby level clusters and available-feed-only timeframe alignment.

### Performance and review

- Added DizyPerformance using immutable completed Journal Trade Reviews.
- Added realised PnL, peak-to-trough drawdown, expectancy, profit factor and payoff ratio.
- Added streak, holding-time, fee-coverage and R-distribution views.
- Added deterministic symbol, timeframe, direction and close-reason breakdowns.
- Kept process-quality Journal statistics and Behaviour observations separate from outcome metrics.

### Operations and recovery

- Added Playwright Chromium smoke tests for authentication, viewer boundaries and roadmap navigation.
- Added a protected DizyOps workspace for bounded build, runtime, storage and audit health.
- Added owner-scoped full JSON backup export and Journal CSV export.
- Added integrity hashing, local parsing, server dry-run validation and explicit restore confirmation.
- Added conflict-aware additive recovery without silently replacing current records or open Manual Paper state.

### DizyBrain

- Added a full-height docked Analysis Workspace.
- Added typed live evidence, qualification, provenance and rejection reasoning.
- Added Flow, Position, Replay, Journal, Behaviour and Diagnostics modules.
- Kept DizyBrain deterministic and non-predictive.

### DizyFlow

- Added current Market Depth histogram and imbalance display.
- Added a professional grouped and virtualised DOM ladder.
- Added recent-trade flashes, cluster highlights and optional visible queue estimates.
- Added bounded retained liquidity history and viewport tile delivery.
- Added DizyFlow Intelligence snapshots and Historical DizyFlow retention.
- Added explicit live, delayed, stale, unavailable and recovery states.

### DizyCharts and DizySignals

- Expanded native timeframe and unified market discovery.
- Added support/resistance, VWAP, Volume Profile, Fibonacci, structure labels and regression channels.
- Added editable manual drawings, extension modes and safer chart layout lanes.
- Added deterministic confirmed-candle DizySignals evidence and historical scanning.
- Added Replay-safe prefix reconstruction and viewport following.

### DizyPaper

- Added manual and signal-driven simulation.
- Added fixed-margin, fixed-notional, equity-percentage and risk-percentage sizing.
- Added isolated/cross-margin approximations, leverage, fees, slippage and estimated liquidation.
- Added Fair/Mark-first risk pricing, partial closes, reversal and flatten actions.
- Added completed-trade capture into Journal, Replay and retained evidence workflows.

### DizyAcademy

- Added beginner, intermediate, Advanced Order Flow and Professional Practice groups.
- Added original SVG diagrams and browser-local progress.
- Added current-workflow lessons for Scanner, Structure, Replay, Historical DizyFlow, Guided Review, Performance, Behaviour, DizyOps and Backup/Recovery.

### Product and platform

- Added public marketing and real view-only terminal access.
- Added account storage, isolated profiles and saved workspaces.
- Added DizyDEX public on-chain discovery.
- Added stale-tab-safe market-only workspace handoffs.
- Added automated lint, deterministic tests, production build and Chromium browser gates.

## Active programme

- DizyPaper Fidelity V2: contract precision, funding, maker/taker assumptions, partial fills and deeper margin realism.
- Workflow, responsive and accessibility polish driven by real use.
- Read-only exchange connection and shadow reconciliation before any execution work.
- Independent correctness, storage and security audit.

Live execution remains disabled.

## Release-note policy

When a milestone ships:

1. Add a concise user-facing summary here.
2. Avoid claiming incomplete or diagnostic-only work as customer-ready.
3. Link detailed implementation questions to the relevant pull request.
4. Keep security-sensitive future work clearly separated from available beta features.
