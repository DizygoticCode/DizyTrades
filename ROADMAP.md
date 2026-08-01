# DizyTrades Roadmap

DizyTrades is being built as a transparent, deterministic crypto market-analysis platform combining charting, confirmed-candle signals, order flow, education and realistic simulation.

This document tracks **what is planned and in what order**. The enduring product mission and research philosophy live in [VISION.md](VISION.md). Technical boundaries live in [ARCHITECTURE.md](ARCHITECTURE.md).

This roadmap is directional rather than a promise of dates. Items move only when they are tested, reviewable and safe enough to merge.

## Development queue

### In progress

- DizyFlow DOM ladder professional-mode deployment review
- Documentation split between Vision, Roadmap and Architecture

### Next

1. Replay Engine foundation
2. Replay controls and deterministic playback
3. Product Launcher and unified navigation
4. Watchlists and favourites
5. Persistent multi-workspace support
6. Alerts foundation
7. DizyJournal
8. Performance analytics
9. Correlation and regime dashboard
10. Market scanner
11. Risk Centre
12. DizyQuant research foundations

## Completed highlights

- Public marketing site and view-only terminal
- Account authentication, isolated profiles and saved workspaces
- DizyCharts multi-timeframe terminal and manual drawing tools
- DizySignals confirmed-candle confluence engine
- Typed DizyBrain snapshot and direct strategy-threshold qualification
- DizyPaper margin, leverage, fee and liquidation simulation
- DizyFlow DOM, retained liquidity, public trade bubbles and diagnostics
- Live Market Depth histogram, imbalance and large-cluster display
- Professional DOM ladder, navigation, queue estimate and recent-trade context
- DizyDEX unified market discovery
- DizyAcademy curriculum, current-product lessons and progress tracking
- Automated lint, test and production-build validation
- Public architecture, principles, release notes and roadmap documentation

## Phase 1 — Platform foundation and stabilisation

- [x] Authentication and account isolation
- [x] Public marketing and viewer mode
- [x] DizyCharts terminal
- [x] DizySignals confirmed-candle analysis
- [x] DizyPaper foundations
- [x] DizyPaper margin, leverage and liquidation simulation
- [x] DizyFlow foundations
- [x] Live Market Depth histogram
- [x] Professional DOM ladder
- [x] DizyDEX discovery
- [x] DizyAcademy and current-product refresh
- [x] DizyBrain v1 and typed snapshot contract
- [x] DizyBrain qualification using the active strategy threshold
- [ ] MEXC Last, Fair and Index price sources with a display selector
- [ ] Accessibility, mobile and terminal-collision audit
- [ ] Stable customer-facing DizyFlow layout
- [ ] Reproducible visual harness for complex chart primitives

## Phase 2 — Replay and professional workflow

- [ ] Replay Engine foundation
- [ ] Deterministic candle-by-candle playback
- [ ] Replay controls, speed and navigation
- [ ] Replay DizySignals evidence
- [ ] Replay DizyBrain snapshots
- [ ] Replay DizyFlow market context where retained data exists
- [ ] Link paper trades to entry and exit replay positions
- [ ] Watchlists and favourites
- [ ] Persistent multi-panel workspaces
- [ ] Multi-chart layouts
- [ ] Browser and server-side alerts foundation

## Phase 3 — Unified product experience

### Product Launcher

- [ ] Shared launcher/sidebar for the DizyTrades product family
- [ ] Consistent icons, module names and navigation patterns
- [ ] Preserve active market and workspace context between modules
- [ ] Recent activity and favourite modules
- [ ] Continue-learning shortcut for DizyAcademy
- [ ] Replay and journal reminders
- [ ] Responsive desktop-first layout
- [ ] Eliminate duplicate navigation systems

### Product suite

Current modules:

- DizyCharts
- DizySignals
- DizyBrain
- DizyFlow
- DizyPaper
- DizyAcademy
- DizyDEX

Planned modules:

- DizyReplay
- DizyJournal
- DizyQuant
- Watchlists
- Alerts
- Workspaces

## Phase 4 — Journal, review and analytics

### DizyJournal

- [ ] Automatic simulated-trade capture
- [ ] DizyBrain explanation snapshot at entry
- [ ] Trader notes, tags and screenshots
- [ ] Rule-compliance review
- [ ] Emotional and process notes
- [ ] Search and filtering
- [ ] Link every eligible trade to Replay

### Performance analytics

- [ ] Win rate and expectancy
- [ ] Average win, loss and R multiple
- [ ] Drawdown and recovery
- [ ] Results by symbol, timeframe and strategy preset
- [ ] Fees and slippage impact
- [ ] Rule-followed versus rule-broken outcomes
- [ ] Exportable review data

### Cross-market context

- [ ] Correlation dashboard
- [ ] Volatility and regime dashboard
- [ ] Market scanner
- [ ] Portfolio and concentration views
- [ ] Risk Centre

## Phase 5 — DizyQuant research foundations

DizyQuant begins as an informational research layer. No metric may influence DizySignals until Replay and statistical validation demonstrate a measurable net improvement. See [VISION.md](VISION.md) for the research framework.

### Liquidity ladder research

- [ ] Ladder balance, skew, symmetry and density
- [ ] Upward and downward liquidity migration
- [ ] Cluster persistence, retreat and reinforcement
- [ ] Liquidity compression and expansion

### Replenishment and consumption

- [ ] Refill rate and consistency
- [ ] Replenishment imbalance
- [ ] Aggressive buy and sell consumption
- [ ] Consumption efficiency
- [ ] Absorption and exhaustion candidates

### Queue and spread behaviour

- [ ] Queue depletion, refill and turnover
- [ ] Spread compression, expansion and stability
- [ ] Acceptance and rejection research
- [ ] Session and volatility regimes

### Validation

- [ ] Replay-compatible typed microstructure snapshots
- [ ] Candidate-metric registry
- [ ] False-positive and false-negative analysis
- [ ] Out-of-sample or walk-forward checks where practical
- [ ] Explicit informational/experimental/validated status
- [ ] Promotion gate before any DizySignals integration

## Phase 6 — Institutional-style analysis

- [ ] Footprint data model
- [ ] Footprint visualisation
- [ ] Bid/ask delta and cumulative delta
- [ ] Liquidity absorption and exhaustion analytics
- [ ] Heatmap renderer isolation and reproducible visual harness
- [ ] Stable Bookmap-style historical heatmap presentation
- [ ] Correlation and market-regime analytics
- [ ] Portfolio and cross-market risk views
- [ ] Visual strategy builder

## Phase 7 — Guarded exchange connectivity

This phase starts only after a separate security milestone and independent review.

- [ ] Exchange abstraction layer
- [ ] Encrypted credential storage
- [ ] Read-only account connectivity
- [ ] Balances, positions and account health
- [ ] Order preview and validation
- [ ] Server-side risk engine
- [ ] MEXC guarded execution
- [ ] Idempotent routing and exchange reconciliation
- [ ] Loss limits, symbol limits and emergency kill switch
- [ ] Complete immutable audit log
- [ ] Multi-exchange support
- [ ] Mobile companion experience

## Milestones

### Active Beta

The platform is useful for public charting, market study, deterministic signals, simulation and education while live execution remains disabled.

### Professional Trading Terminal

Complete when price sources, Replay, watchlists, workspaces, alerts, journal and core analytics are stable.

### Research and Review Platform

Complete when Replay can validate typed DizyQuant observations and connect them to DizySignals, DizyBrain, DizyPaper and DizyJournal without hidden weighting.

### Institutional Analysis Workspace

Complete when footprint, delta, liquidity, correlation and portfolio-risk tools are reliable, replayable and clearly explained.

### Guarded Trading Platform

Complete only after security, risk, reconciliation, credential and audit requirements for live connectivity are independently satisfied.

## Delivery rules

- One focused concern per pull request.
- Work from current `main`.
- Run lint, tests and production build before merge.
- Keep display preferences separate from trading logic.
- Do not infer unavailable exchange, strategy or risk data.
- Prefer deterministic and explainable behaviour over black-box output.
- Research observations remain informational until validated.
- Live trading remains disabled until Phase 7 requirements are complete.
