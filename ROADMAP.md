# DizyTrades Roadmap

DizyTrades is a transparent, deterministic crypto research, simulation and review platform. The enduring mission lives in [VISION.md](VISION.md); technical boundaries live in [ARCHITECTURE.md](ARCHITECTURE.md).

This roadmap reflects merged `main` as of August 2026. Items are not promises of dates. They move only after focused implementation, automated validation and review.

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
- [x] DizyQuant versioned microstructure registry, Replay lab and bounded `/research` page
- [x] bounded production diagnostics and feed-health states

### Professional workflow

- [x] DizyPaper manual and signal simulations
- [x] DizyPaper Fidelity V2 execution, funding, margin and liquidation approximations
- [x] DizyJournal immutable trade reviews, notes, tags and statistics
- [x] deterministic Replay Engine
- [x] retained Historical Replay Memory
- [x] Historical DizyFlow capture and replay
- [x] DizyBrain deterministic historical trade reviews
- [x] DizyBrain Behaviour aggregation
- [x] Guided Historical Trade Review
- [x] continuous replay playback and viewport following

### Discovery, research and analytics

- [x] saved watchlists and bounded DizyScanner
- [x] DizyStructure sessions, anchored VWAP, swings and timeframe alignment
- [x] DizyPerformance realised PnL, drawdown, expectancy and breakdowns
- [x] DizyAcademy current-product workflow curriculum
- [x] DizyQuant snapshot-grade and continuous-stream-grade formula layers
- [x] DizyQuant held-out, null-baseline and walk-forward laboratory

### Reliability and operations

- [x] lint, deterministic unit tests and production build CI
- [x] Playwright Chromium smoke coverage
- [x] protected DizyOps diagnostics workspace
- [x] full JSON backup export and Journal CSV
- [x] integrity validation, restore dry-run and additive recovery
- [x] cross-workspace profile and viewer-state hardening
- [x] read-only Render deployment observation and exact-commit health verification
- [x] destructive application recovery rehearsal in isolated temporary data roots
- [x] authentication/storage, simulator-accounting, Replay, backup-conflict and browser-accessibility reviews

## Completed programmes

### 1. DizyPaper Fidelity V2

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

The simulator is more realistic without claiming exchange-exact fills, queue priority or liquidation behaviour.

### 2. Workflow and accessibility polish

- [x] saved workspace layouts and presets
- [x] command palette and keyboard reference
- [x] recent markets, reviews and learning shortcuts
- [x] first-run onboarding
- [x] responsive and mobile audit
- [x] focus order, screen-reader and reduced-motion audit
- [x] empty, delayed and recovery state polish

### 3. Independent correctness and security reviews

- [x] independent engineering review
- [x] authentication and storage threat review
- [x] simulator accounting audit
- [x] Replay future-leakage audit
- [x] backup restore and conflict audit
- [x] browser accessibility independent review
- [x] deployment observation and application recovery rehearsal

Evidence is recorded in:

- [docs/INDEPENDENT_ENGINEERING_REVIEW.md](docs/INDEPENDENT_ENGINEERING_REVIEW.md)
- [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md)
- [docs/SIMULATOR_ACCOUNTING_AUDIT.md](docs/SIMULATOR_ACCOUNTING_AUDIT.md)
- [docs/REPLAY_FUTURE_LEAKAGE_AUDIT.md](docs/REPLAY_FUTURE_LEAKAGE_AUDIT.md)
- [docs/BACKUP_RESTORE_CONFLICT_AUDIT.md](docs/BACKUP_RESTORE_CONFLICT_AUDIT.md)
- [docs/BROWSER_ACCESSIBILITY_INDEPENDENT_REVIEW.md](docs/BROWSER_ACCESSIBILITY_INDEPENDENT_REVIEW.md)

A destructive provider persistent-disk snapshot rollback is intentionally deferred to the guarded-execution security milestone, when isolated infrastructure and cost can be justified.

### 4. DizyQuant research foundation — complete

The six focused implementation slices are complete:

- [x] source-quality contract, stable identities and Replay-safe snapshots
- [x] spread and visible-ladder state
- [x] public aggressive flow and visible-depth pressure
- [x] displayed-liquidity migration, turnover and persistence
- [x] shock resilience, replenishment and experimental candidate events
- [x] deterministic Replay/statistical laboratory and bounded public presentation

Current registry state:

- [x] 67 stable metric identities
- [x] 65 informational metrics
- [x] two experimental depth-only candidate flags
- [x] zero validated metrics
- [x] zero decision-eligible or signal-eligible metrics
- [x] repository firewall against unreviewed DizySignals influence

The implementation programme is finished. DizyQuant is not “finished science”: representative evidence campaigns and explicit retain/reject/promotion decisions remain ongoing research work.

See [docs/DIZYQUANT_RESEARCH_CONTRACT.md](docs/DIZYQUANT_RESEARCH_CONTRACT.md) and the bounded public `/research` page.

## Active programme

### 5. Read-only MEXC Account Companion and shadow reconciliation

No order permission and no browser-held exchange credentials.

- [x] owner-scoped server-side read-only MEXC credential activation
- [x] executable proof that the software requests no write capability
- [ ] live balance, position and account-health ingestion
- [ ] stale/private-data failure handling on real provider reads
- [ ] exchange-state reconciliation
- [ ] hypothetical order preview beside real account state
- [ ] immutable persistent shadow audit log
- [ ] owner-controlled credential removal and shutdown workflow
- [ ] independent review of the complete read-only boundary

The credential activation contract is documented in [docs/MEXC_OWNER_READONLY_CREDENTIAL_ACTIVATION.md](docs/MEXC_OWNER_READONLY_CREDENTIAL_ACTIVATION.md). Operator read-only attestation and the GET-only software proof are distinct from provider-side permission introspection.

This programme must not create an order route or weaken `LIVE_TRADING_ENABLED=false`.

## Next focused programme

### 6. Liquidity heatmap presentation and DizyFlow evidence quality

The retained evidence engine and migration metrics exist. The customer-facing heatmap must now be reviewed as a visual product rather than assumed correct because data is retained.

- [ ] compare the current heatmap with retained liquidity evidence end to end
- [ ] replace or repair unstable rendering and timeframe behaviour
- [ ] make live, delayed, stale, gapped and unavailable states unmistakable
- [ ] verify viewport, aggregation and price-bucket behaviour
- [ ] keep raw stream volume bounded on Render Starter
- [ ] add representative browser visual/regression coverage
- [ ] preserve the distinction between displayed liquidity and executed volume

## Ongoing DizyQuant evidence campaigns

These are research operations, not another foundation rewrite.

- [ ] collect representative, continuity-qualified samples across selected symbols and regimes
- [ ] run Replay studies for candidate metrics and outcomes
- [ ] compare null, baseline and walk-forward performance
- [ ] analyse false positives, false negatives and sensitivity
- [ ] record retain, reject or revise decisions per formula version
- [ ] propose a separate promotion PR only if evidence warrants it

No metric enters DizySignals merely because the infrastructure exists or a single historical sample looks impressive.

## Institutional-style analysis — later

- [ ] footprint data model and visualisation where public data genuinely supports it
- [ ] bid/ask delta and cumulative delta
- [ ] correlation and market-regime workspace
- [ ] portfolio concentration and cross-market risk
- [ ] visual strategy builder

These features must not imply access to private matching-engine information, Level-4 order identity or hidden institutional intent.

## Guarded live execution — final security milestone only

Live execution remains disabled until every earlier operational, security and reconciliation requirement is independently satisfied.

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

Useful for public charting, market study, deterministic signals, public order-flow observation, bounded microstructure research, simulation, replay, review, analytics, education and recovery while execution remains disabled.

### Operational Research Platform — achieved

DizyPaper Fidelity V2, workflow/accessibility, DizyQuant’s six-slice foundation, deployment observation, application recovery rehearsal and focused independent reviews are complete. Runtime, production-boundary and repository assumptions are executable CI contracts.

### Read-only Account Companion — in progress

The owner credential boundary and GET-only proof are complete. The milestone completes when live private account state can be ingested, labelled for freshness and reconciled safely without any exchange write permission.

### Evidence-qualified DizyQuant promotion — conditional

A metric may be considered only after representative held-out studies and a separate promotion review. This milestone may validly reject every current hypothesis.

### Guarded Trading Platform — conditional future

Complete only after credential, risk, reconciliation, shutdown, provider-recovery and audit requirements pass independent review.

## Delivery and cost rules

- One focused concern per pull request.
- Work from current `main`.
- Run lint, full tests, production build and relevant Chromium checks before merge.
- Keep display preferences separate from strategy and risk logic.
- Preserve immutable trade, Replay and research evidence.
- Do not infer unavailable exchange, feed or account data.
- Prefer deterministic, explainable behaviour over black-box output.
- Research observations remain informational or experimental until separately validated and promoted.
- Live trading remains disabled until the final security milestone is complete.
- Prefer the existing Render service, GitHub Actions and free tooling.
- Do not create paid services, disks, databases, APIs or subscriptions without explicit owner approval.
