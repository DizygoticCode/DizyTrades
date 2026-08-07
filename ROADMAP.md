# DizyTrades Roadmap

DizyTrades is a transparent, deterministic crypto research, simulation and review platform. The enduring mission lives in [VISION.md](VISION.md); technical boundaries live in [ARCHITECTURE.md](ARCHITECTURE.md).

This roadmap reflects merged `main` as of August 2026. Items are not promises of dates. They move only after focused implementation, deterministic validation and review.

## Current roadmap order

The platform-building phase is largely complete. The active sequence is now deliberately narrower:

1. **Finish the DizyQuant representative evidence campaign.**
2. **Optional evidence-led polish** based on what the campaign and production use actually reveal.
3. **Housekeeping and security update** for supported dependency patches, documentation/security sync and CI recovery.
4. **Guarded execution readiness** only after every execution-security boundary is independently satisfied.

No large feature programme is inserted between these stages merely because the platform can support one.

## Current product generation — complete

### Platform and research terminal

- [x] public marketing site and real view-only terminal
- [x] account authentication and isolated user profiles
- [x] DizyCharts multi-timeframe terminal
- [x] manual drawing and saved chart workspaces
- [x] shared route-aware product navigation across the Dizy family
- [x] unified MEXC Spot/Futures and DizyDEX discovery
- [x] DizySignals confirmed-candle confluence engine
- [x] DizyBrain typed explanation workspace
- [x] DizyFlow Market Depth, DOM, retained liquidity, heatmap and public trades
- [x] DizyQuant versioned microstructure registry, Replay lab and bounded `/research` page
- [x] owner-only read-only DizyAccount Companion
- [x] bounded production diagnostics and explicit feed-health states

### Professional workflow

- [x] DizyPaper manual and signal simulations
- [x] DizyPaper Fidelity V2 execution, funding, margin and liquidation approximations
- [x] typed pending-order lifecycle for futures and spot simulation
- [x] futures limit/TIF/post-only, conditional, trailing, chase and protective-exit simulation
- [x] spot market/limit/TIF simulation with available/reserved accounting
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
- [x] DizyAcademy current-product workflow curriculum with lesson-specific visuals
- [x] DizyQuant snapshot-grade and continuous-stream-grade formula layers
- [x] DizyQuant held-out, null-baseline and walk-forward laboratory
- [x] continuity-qualified representative-evidence campaign contract

### Reliability and operations

- [x] deterministic unit, integration and browser-validation contracts
- [x] Playwright Chromium smoke coverage
- [x] protected DizyOps diagnostics workspace
- [x] full JSON backup export and Journal CSV
- [x] integrity validation, restore dry-run and additive recovery
- [x] cross-workspace profile and viewer-state hardening
- [x] read-only Render deployment observation and exact-commit health verification contracts
- [x] destructive application recovery rehearsal in isolated temporary data roots
- [x] authentication/storage, simulator-accounting, Replay, backup-conflict and browser-accessibility reviews

GitHub Actions workflow definitions remain in the repository, but hosted runs are currently silent. Until that service recovers, focused deterministic checks and the Render production build remain the release gate; no documentation should pretend otherwise.

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

### 2. Workflow, navigation and accessibility polish

- [x] saved workspace layouts and presets
- [x] shared Dizy product navigation with one active destination model
- [x] terminal-specific second toolbar for chart/workspace actions
- [x] terminal-only Commands and Recent quick actions
- [x] command palette and keyboard reference
- [x] recent markets, reviews and learning shortcuts
- [x] first-run onboarding
- [x] responsive and mobile audit
- [x] focus order, screen-reader and reduced-motion audit
- [x] empty, delayed and recovery state polish
- [x] optional, visibly disclosed MEXC referral link without tracking or trading dependency

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

The implementation programme is finished. DizyQuant is not “finished science”: the representative evidence campaign below is the active research programme.

See [docs/DIZYQUANT_RESEARCH_CONTRACT.md](docs/DIZYQUANT_RESEARCH_CONTRACT.md) and the bounded public `/research` page.

### 5. Read-only MEXC Account Companion and shadow reconciliation — complete

No order permission and no browser-held exchange credentials.

- [x] owner-scoped server-side read-only MEXC credential activation
- [x] executable proof that the software requests no write capability
- [x] live balance, position and account-health ingestion
- [x] stale/private-data failure handling on provider reads
- [x] provider risk context
- [x] MEXC ↔ DizyPaper shadow reconciliation
- [x] non-executable hypothetical order preview beside real account state
- [x] immutable persistent shadow audit log
- [x] owner-controlled credential removal and shutdown workflow
- [x] independent review of the complete read-only boundary

The credential activation contract is documented in [docs/MEXC_OWNER_READONLY_CREDENTIAL_ACTIVATION.md](docs/MEXC_OWNER_READONLY_CREDENTIAL_ACTIVATION.md). The shutdown runbook is recorded in [docs/MEXC_OWNER_CONNECTION_SHUTDOWN.md](docs/MEXC_OWNER_CONNECTION_SHUTDOWN.md), and the completed boundary review is recorded in [docs/MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW.md](docs/MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW.md).

This programme did not create an order route and did not weaken `LIVE_TRADING_ENABLED=false`.

### 6. Advanced pending-order simulation and DizyAcademy — complete

- [x] shared typed immutable order lifecycle and deterministic replay
- [x] futures LIMIT, GTC, IOC, FOK and post-only simulation
- [x] trigger-market, trigger-limit and trailing-stop simulation
- [x] chase-limit repricing, protection distance and hedge-mode constraints
- [x] position-bound reduce-only TP/SL and limit TP/SL simulation
- [x] cancel, replace, expiry and partial-fill evidence
- [x] spot MARKET, LIMIT, LIMIT_MAKER, IOC and FOK simulation
- [x] separate spot base/quote available and reserved accounting
- [x] exact reservation, price-improvement, cancellation and replacement evidence
- [x] DizyAcademy pending-order and spot-accounting lessons
- [x] lesson-specific Academy diagrams and product screenshots
- [x] owner-only DizyOps removed from the ordinary-user Academy path
- [x] independent accounting, replay and live-routing-boundary audit

Evidence is recorded in [docs/PENDING_ORDER_PROGRAMME_AUDIT.md](docs/PENDING_ORDER_PROGRAMME_AUDIT.md). The programme remains simulation-only.

### 7. Liquidity heatmap presentation and DizyFlow evidence quality — complete for the current beta

The retained evidence engine and customer-facing presentation have now been reviewed together rather than treating data retention as proof of a correct visual.

- [x] retained-history tiles render into the chart through the real DizyFlow store
- [x] live depth transitions bridge from retained history to the current live-candle edge
- [x] live display coverage is kept separate from historical archive coverage
- [x] sequence gaps clear synthetic live continuity instead of painting across missing evidence
- [x] unrelated DOM/trade updates cannot drag an already rendered heatmap edge backwards
- [x] initial/backfill catch-up may fill historical gaps without pretending those samples existed earlier
- [x] heatmap and trade-bubble defaults are restrained so candles remain readable
- [x] explicit live, delayed, stale, gapped and unavailable semantics remain part of the evidence model

Future heatmap changes should now be evidence-led polish or bug fixes, not a standing foundation programme.

## Active programme — DizyQuant representative evidence campaign

### 8. Finish the first bounded campaign

The collection and qualification machinery already exists. The work now is to collect representative evidence and make explicit research decisions.

Initial campaign matrix:

- **Symbols:** BTC_USDT, ETH_USDT and SOL_USDT
- **Regimes:** range, directional and volatility-shock
- **Coverage threshold:** 50 qualified observations per symbol × regime cell
- **First-matrix minimum:** 450 qualified observations before every cell is coverage-ready
- **Submitted-sample ceiling:** 10,000

Required work:

- [ ] collect continuity-qualified samples across all nine cells
- [ ] retain stable rejection reasons for gapped, unavailable, mismatched and out-of-scope evidence
- [ ] run Replay studies for candidate metrics and outcomes
- [ ] compare held-out results with circular-null and walk-forward baselines
- [ ] inspect false positives, false negatives, sensitivity and regime dependence
- [ ] record retain, reject or revise decisions per formula version
- [ ] keep every result decision-ineligible, signal-ineligible and execution-ineligible during research
- [ ] open a separate promotion PR only if representative evidence warrants it

Coverage-ready does **not** mean validated, predictive or promotable. This programme may validly reject every current hypothesis.

## Next — optional evidence-led polish

### 9. Improve only what the evidence or production use justifies

This stage is intentionally conditional. It is not another feature-expansion programme.

Possible work includes:

- [ ] improve DizyQuant campaign/research presentation where it makes results easier to audit
- [ ] remove or de-emphasise metrics that create noise without useful evidence
- [ ] refine Scanner, Structure, Replay, Performance or DizyFlow UX where real use exposes friction
- [ ] improve rendering/performance only where measurement shows a real bottleneck
- [ ] tighten explanations, unavailable states and evidence provenance where users can still misread them
- [ ] add focused visual or deterministic regression coverage for any production issue uncovered

Large institutional-style features remain parked unless this evidence creates a concrete reason to build them.

## Then — housekeeping and security update

### 10. Maintain the stack before execution work

The goal is a supported, well-documented base for the final security milestone, not indiscriminate dependency churn.

- [ ] test and apply supported Next.js/React security and patch updates
- [ ] test Lightweight Charts and other useful minor/patch dependency updates independently
- [ ] restore or diagnose GitHub Actions hosted runs before relying on CI status claims again
- [ ] re-audit README, ROADMAP, SECURITY and deployment documentation against the live platform
- [ ] review package/runtime engine alignment and remove stale configuration
- [ ] run focused dependency/browser regressions before each accepted update
- [ ] keep TypeScript 7 and mismatched Node-major type upgrades separate unless a dedicated migration is justified

No dependency bundle is merged merely because Dependabot opened it.

## Final major programme — guarded execution readiness

### 11. Security architecture before any live order route

The completed DizyAccount read-only companion is a prerequisite and observation layer. It is **not** an execution approval.

Live execution remains disabled until every relevant requirement below is implemented, exercised and independently reviewed:

- [ ] isolated execution service or equivalently isolated execution boundary
- [ ] encrypted live-trading credential custody suitable for write-capable keys
- [ ] MFA and hardened database-backed sessions
- [ ] shared authentication and abuse rate limiting for multi-instance deployment
- [ ] server-side order preview and risk validation
- [ ] idempotent order submission
- [ ] exchange acknowledgement and deterministic reconciliation
- [ ] symbol, leverage, notional and daily-loss limits
- [ ] reduce-only enforcement
- [ ] stale-price and stale-account-state rejection
- [ ] global and per-user kill switches
- [ ] immutable execution audit trail
- [ ] controlled provider persistent-disk snapshot rollback and service-restart rehearsal
- [ ] restricted test-account rollout
- [ ] independent security approval

Only after those gates pass should an explicit decision be made about whether to enable any exchange write capability at all.

## Parked institutional-style analysis

These are ideas, not active roadmap commitments:

- [ ] footprint data model and visualisation where public data genuinely supports it
- [ ] bid/ask delta and cumulative delta
- [ ] correlation and market-regime workspace
- [ ] portfolio concentration and cross-market risk
- [ ] visual strategy builder

They must not imply access to private matching-engine information, Level-4 order identity or hidden institutional intent.

## Product milestones

### Active Beta — achieved

Useful for public charting, market study, deterministic signals, public order-flow observation, bounded microstructure research, realistic simulation, replay, review, analytics, education and recovery while execution remains disabled.

### Operational Research Platform — achieved

DizyPaper Fidelity V2, shared workflow/navigation, DizyQuant’s six-slice foundation, DizyFlow heatmap presentation, deployment/recovery contracts and focused independent reviews are complete.

### Read-only Account Companion — achieved

The owner-only companion can ingest and label private account state, add provider risk context, reconcile it with DizyPaper, calculate non-executable previews, persist tamper-evident shadow evidence and fail closed through an owner-controlled shutdown. It remains strictly separate from guarded live execution.

### Evidence-qualified DizyQuant promotion — conditional

A metric may be considered only after representative held-out studies and a separate promotion review. This milestone may validly reject every current hypothesis.

### Guarded Trading Platform — conditional future

Complete only after credential, risk, reconciliation, shutdown, provider-recovery and audit requirements pass independent review.

## Delivery and cost rules

- One focused concern per pull request.
- Work from current `main`.
- Run focused deterministic checks, the complete test suite where available, production build and relevant Chromium checks before merge.
- Keep display preferences separate from strategy and risk logic.
- Preserve immutable trade, Replay and research evidence.
- Do not infer unavailable exchange, feed or account data.
- Prefer deterministic, explainable behaviour over black-box output.
- Research observations remain informational or experimental until separately validated and promoted.
- Live trading remains disabled until the final security milestone is complete.
- Prefer the existing Render service, GitHub workflows and free tooling.
- Do not create paid services, disks, databases, APIs or subscriptions without explicit owner approval.
