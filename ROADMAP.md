# DizyTrades Roadmap

DizyTrades is a transparent, deterministic crypto research, simulation and review platform. The enduring mission lives in [VISION.md](VISION.md); technical boundaries live in [ARCHITECTURE.md](ARCHITECTURE.md).

This roadmap reflects the merged product as of August 2026. Items are not promises of dates. They move only after focused implementation, automated validation and review.

## Current product generation — complete

### Platform and research terminal

- [x] public marketing site and real view-only terminal
- [x] account authentication and isolated user profiles
- [x] DizyCharts multi-timeframe terminal
- [x] manual drawing and saved chart workspaces
- [x] unified MEXC Spot/Futures and DizyDEX discovery
- [x] DizySignals confirmed-candle confluence engine
- [x] DizyBrain typed explanation workspace
- [x] DizyFlow Market Depth, DOM, retained liquidity and public trades
- [x] bounded production diagnostics and feed-health states

### Professional workflow

- [x] DizyPaper manual and signal simulations
- [x] isolated/cross margin approximations, leverage and liquidation estimates
- [x] DizyJournal immutable trade reviews, notes, tags and statistics
- [x] deterministic Replay Engine
- [x] retained Historical Replay Memory
- [x] Historical DizyFlow capture and replay
- [x] DizyBrain deterministic historical trade reviews
- [x] DizyBrain Behaviour aggregation
- [x] Guided Historical Trade Review
- [x] continuous replay playback and viewport following

### Discovery and analytics

- [x] saved watchlists and bounded DizyScanner
- [x] DizyStructure sessions, anchored VWAP, swings and timeframe alignment
- [x] DizyPerformance realised PnL, drawdown, expectancy and breakdowns
- [x] DizyAcademy current-product workflow curriculum

### Reliability and operations

- [x] lint, deterministic unit tests and production build CI
- [x] Playwright Chromium smoke coverage
- [x] protected DizyOps diagnostics workspace
- [x] full JSON backup export and Journal CSV
- [x] integrity validation, restore dry-run and additive recovery
- [x] cross-workspace profile and viewer-state hardening
- [x] read-only Render deployment observation and exact-commit health verification
- [x] destructive application recovery rehearsal in isolated temporary data roots

## Completed active programmes

### 1. DizyPaper Fidelity V2

Improve simulation realism without claiming exchange-exact fills.

- [x] official contract metadata boundary per symbol
- [x] quantity and price-step enforcement
- [x] symbol-specific leverage and maintenance-margin limits
- [x] maker versus taker execution assumptions with explicit fee provenance
- [x] funding-payment modelling with explicit data provenance
- [x] depth-sensitive slippage and partial-fill modelling
- [x] reduce-only semantics
- [x] maintenance tiers and bankruptcy-price audit
- [x] clearer isolated versus cross-margin assumptions
- [x] migration-safe history and backup support

Depth-sensitive visible-book execution is complete across entries, manual exits, Reverse, Flatten All and automatic stop/target/liquidation exits, including persistent partial risk exits. Maintenance tiers use snapshotted public contract increment fields with explicit flat fallback, liquidation is separated from bankruptcy price, and isolated collateral is fenced from the shared single-asset USDT cross pool. Cross liquidation is re-audited against all current cross positions and their last known marks. Manual Paper v2/v3 records migrate deterministically to v4, fill economics are hash-preserved with unavailable evidence declared rather than invented, full backup v1 files are integrity-verified before migration to v2, and dry-run/apply fingerprints remain stable.

### 2. Workflow and accessibility polish

Driven by real use rather than speculative redesign.

- [x] saved workspace layouts and presets
- [x] command palette and keyboard reference
- [x] recent markets, reviews and learning shortcuts
- [x] first-run onboarding
- [x] responsive and mobile audit
- [x] focus order, screen-reader and reduced-motion audit
- [x] empty, delayed and recovery state polish

First-run onboarding opens once per user and offers bounded paths into the terminal, DizyAcademy or Manual Paper. Saved layouts retain named account-scoped snapshots of sanitised market, timeframe, chart view, strategy, risk and DizyFlow state. Commands and Recent provide deterministic navigation and continuation without bypassing owner/viewer permissions.

The responsive and accessibility contracts keep protected workspaces contained on phones and tablets, preserve intentionally wide internal scroll regions, provide skip navigation, modal focus containment/restoration, forced-colour handling and reduced motion. Global Commands and Recent controls reserve the live DizyBrain dock width so the sidebar collapse and close controls remain reachable at every desktop resize.

## Active programme

### 3. Read-only exchange connection and shadow mode

No order permission.

- [ ] server-side read-only MEXC credentials
- [ ] balance, position and account-health ingestion
- [ ] exchange-state reconciliation
- [ ] hypothetical order preview beside real account state
- [ ] immutable shadow audit log
- [ ] stale/private-data failure handling
- [ ] explicit proof that no write permission is requested

### 4. Independent audit

- [ ] Codex or independent engineering review
- [x] authentication and storage threat review
- [x] simulator accounting audit
- [x] Replay future-leakage audit
- [ ] backup restore and conflict audit
- [ ] browser accessibility independent review
- [x] deployment observation and application recovery rehearsal

The authentication and storage review is recorded in [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md). It hardens fail-closed feature flags, session parsing and fallback behaviour, outage throttling, request-origin boundaries, owner-ID/path isolation and auth-database permissions while documenting accepted beta limitations.

The simulator accounting review is recorded in [docs/SIMULATOR_ACCOUNTING_AUDIT.md](docs/SIMULATOR_ACCOUNTING_AUDIT.md). It adds executable Manual Paper cash, fee, funding and settlement reconciliation; corrects signal-simulator maximum-notional sizing; and keeps open mark-to-market positions out of completed win-rate and profit-factor statistics.

The Replay temporal-boundary review is recorded in [docs/REPLAY_FUTURE_LEAKAGE_AUDIT.md](docs/REPLAY_FUTURE_LEAKAGE_AUDIT.md). It replaces timestamp ceiling jumps with a shared exact-or-prior selector and adds adversarial evidence across interactive Replay, Journal launch, retained closed-candle memory, Historical DizyFlow and DizyBrain historical-review prefixes.

Deployment/recovery evidence now has two completed layers:

1. a read-only GitHub Actions rehearsal that authenticates to Render, resolves the configured DizyTrades service, waits for an expected commit and verifies the simulation-only health contract;
2. a destructive application-level export/dry-run/restore rehearsal in fresh temporary data roots with tamper rejection, owner isolation, stable fingerprints and idempotency.

A destructive provider persistent-disk snapshot rollback is not required for the current simulation beta. It is moved to the guarded-execution security milestone, where isolated infrastructure and any associated cost can be justified before real exchange credentials or funds exist.

## Research programme

DizyQuant remains informational until Replay and statistical validation support promotion.

### Candidate microstructure research

- [ ] liquidity-ladder balance, skew and migration
- [ ] replenishment and withdrawal persistence
- [ ] aggressive-consumption efficiency
- [ ] queue depletion and turnover
- [ ] spread regimes
- [ ] cluster persistence and retreat
- [ ] absorption and exhaustion candidates

### Validation gate

Every candidate must define:

- [ ] typed source data and units
- [ ] deterministic formula and version
- [ ] stale and unavailable behaviour
- [ ] Replay-compatible snapshot
- [ ] representative historical sample
- [ ] false-positive and false-negative analysis
- [ ] regime sensitivity
- [ ] out-of-sample or walk-forward checks where practical
- [ ] informational, experimental or validated status
- [ ] explicit promotion decision before any DizySignals influence

## Institutional-style analysis — later

- [ ] footprint data model and visualisation
- [ ] bid/ask delta and cumulative delta
- [ ] stable customer-facing historical heatmap presentation
- [ ] correlation and market-regime workspace
- [ ] portfolio concentration and cross-market risk
- [ ] visual strategy builder

These features must not imply access to private matching-engine information or hidden institutional intent.

## Guarded live execution — final security milestone only

Live execution remains disabled until all earlier operational, security and reconciliation requirements are independently satisfied.

- [ ] isolated execution service
- [ ] encrypted credential custody
- [ ] MFA and hardened database-backed sessions
- [ ] shared authentication and abuse rate limiting for multi-instance deployment
- [ ] server-side order preview and risk validation
- [ ] idempotent order submission
- [ ] acknowledgement and reconciliation
- [ ] symbol, leverage, notional and daily-loss limits
- [ ] reduce-only enforcement
- [ ] stale-price rejection
- [ ] global and per-user kill switches
- [ ] immutable audit trail
- [ ] controlled provider persistent-disk snapshot rollback and service-restart rehearsal
- [ ] restricted test-account rollout
- [ ] independent security approval

## Product milestones

### Active Beta — achieved

Useful for public charting, market study, deterministic signals, order-flow observation, simulation, replay, review, analytics, education and recovery while execution remains disabled.

### Operational Research Platform — in progress

DizyPaper Fidelity V2, workflow/accessibility, deployment observation, application recovery rehearsal, authentication/storage, simulator-accounting and Replay temporal-boundary reviews are complete. This milestone closes after the remaining independent engineering, backup-conflict and browser-accessibility reviews are stable.

### Read-only Account Companion — future

Complete when private account state can be reconciled safely without any exchange write permission.

### Guarded Trading Platform — conditional future

Complete only after credential, risk, reconciliation, shutdown, provider-recovery and audit requirements pass independent review.

## Delivery and cost rules

- One focused concern per pull request.
- Work from current `main`.
- Run lint, full tests, production build and relevant Chromium checks before merge.
- Keep display preferences separate from strategy and risk logic.
- Preserve immutable trade and replay evidence.
- Do not infer unavailable exchange, feed or account data.
- Prefer deterministic, explainable behaviour over black-box output.
- Research observations remain informational until validated.
- Live trading remains disabled until the final security milestone is complete.
- Prefer the existing Render services, GitHub Actions and free tooling.
- Do not create paid services, disks, databases, APIs or subscriptions without explicit owner approval.
