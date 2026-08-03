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
- Added read-only Render deployment observation that verifies the configured service, expected commit and simulation-only health contract.
- Added a destructive application recovery rehearsal in isolated temporary data roots with tamper rejection, owner isolation and idempotency.
- Deferred destructive provider snapshot rollback until the guarded-execution security milestone rather than creating another paid service for the active beta.

### Authentication and storage hardening

- Completed the active-beta authentication and storage threat review.
- Made public signup and legacy emergency authentication fail closed unless explicitly enabled.
- Preserved login/signup throttling through a bounded in-memory fallback when SQLite is unavailable.
- Bounded signed and opaque session token syntax, size, lifetime and identity fields.
- Prevented normal database users from receiving unusable signed fallback sessions.
- Restricted compatibility GET logout to explicit user-initiated same-origin navigation.
- Hardened request-origin, protocol, host and IP parsing.
- Added low-level account validation and explicit private auth-database permissions.
- Replaced lossy profile and Journal owner-ID rewriting with strict collision-free validation.
- Documented accepted beta limitations and the additional controls required before exchange credentials or order permission.

### Simulator accounting audit

- Added executable reconciliation for native Manual Paper cash, realised P/L, active entry fees, fill notional, fee components, funding and margin settlements.
- Rejects current account and backup economic tampering instead of silently normalising contradictory values.
- Preserves legacy and retention-bounded history honestly when complete reconstruction is unavailable.
- Replaced lossy Manual Paper owner-ID rewriting with strict one-to-one validation.
- Corrected confirmed-signal maximum-notional sizing so notional cannot exceed either the configured ceiling or equity-based leverage capacity.
- Separated completed trades from open mark-to-market positions for win rate and profit factor.
- Added realised versus marked P/L decomposition, including live mark updates.

### Workflow and accessibility

- Added named account-scoped workspace layouts and deterministic built-in presets.
- Added Ctrl/Cmd+K Commands and a verified keyboard reference.
- Added recent market, Journal and Academy continuation shortcuts.
- Added optional first-run onboarding with truthful simulation boundaries.
- Added shared phone/tablet containment, safe-area handling and internal scrolling for dense workspaces.
- Added skip navigation, modal focus containment/restoration, forced-colour support and reduced motion.
- Added consistent empty, delayed, recovering, offline and failed guidance.
- Reserved the live DizyBrain dock width so Commands and Recent no longer cover its collapse or close controls.

### DizyBrain

- Added a full-height docked Analysis Workspace.
- Added typed live evidence, qualification, provenance and rejection reasoning.
- Added Flow, Position, Replay, Journal, Behaviour and Diagnostics modules.
- Added a beginner-first summary without deleting detailed evidence.
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

### DizyPaper Fidelity V2

- Added public symbol-specific contract precision, ticks, volume steps and leverage limits.
- Added public maker/taker fee provenance and funding-payment modelling.
- Added visible-book entries, manual exits, Reverse, Flatten All and automatic risk exits.
- Added honest partial fills and persistent residual risk exits when visible liquidity is insufficient.
- Added reduce-only identity and quantity evidence across every exit path.
- Added position-size-aware maintenance tiers and separate liquidation/bankruptcy evidence.
- Added explicit isolated collateral and single-asset USDT cross-margin accounting.
- Added deterministic v2/v3-to-v4 Manual Paper migration and integrity-verified backup migration.
- Preserved recorded prices, quantities, fees and P/L instead of reconstructing unavailable history.

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

- Remaining independent engineering and correctness audits.
- Replay future-leakage review.
- Backup conflict and independent browser-accessibility review.
- Read-only exchange connection and shadow reconciliation before any execution work.
- DizyQuant research only behind Replay and statistical validation.

Live execution remains disabled. Provider snapshot rollback, MFA, encrypted exchange credentials, immutable execution audit and real-order controls remain final security-milestone work.

## Release-note policy

When a milestone ships:

1. Add a concise user-facing summary here.
2. Avoid claiming incomplete or diagnostic-only work as customer-ready.
3. Link detailed implementation questions to the relevant pull request.
4. Keep security-sensitive future work clearly separated from available beta features.
