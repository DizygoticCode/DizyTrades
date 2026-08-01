# DizyTrades Roadmap

DizyTrades is being built as a transparent, deterministic crypto market-analysis platform that combines charting, confirmed-candle signals, order flow, education and realistic simulation.

This roadmap is directional rather than a promise of dates. Items move only when they are tested, reviewable and safe enough to merge.

## Completed highlights

- Public marketing site and view-only terminal
- Account authentication, isolated profiles and saved workspaces
- DizyCharts multi-timeframe terminal and manual drawing tools
- DizySignals confirmed-candle confluence engine
- DizyPaper manual and signal-driven simulation
- DizyFlow DOM, liquidity-history and trade-bubble foundations
- DizyDEX unified market discovery
- DizyAcademy curriculum and progress tracking
- DizyBrain transparent signal-reasoning panel
- Automated lint, test and production-build validation

## Current delivery pipeline

1. MEXC Last, Fair and Index price sources with a display selector
2. Manual Paper Simulator leverage, margin, liquidation and fair-price marking
3. Market Depth histogram beside the price scale
4. DizyAcademy refresh for the current product
5. Typed DizyBrain data contract and direct strategy-threshold integration

## Phase 1 — Complete and stabilise the platform

- [x] Authentication and account isolation
- [x] Public marketing and viewer mode
- [x] DizyCharts terminal
- [x] DizySignals confirmed-candle analysis
- [x] DizyPaper foundations
- [x] DizyFlow foundations
- [x] DizyDEX discovery
- [x] DizyAcademy
- [x] DizyBrain v1
- [ ] MEXC Last, Fair and Index price sources
- [ ] Manual Paper Simulator v2
- [ ] Market Depth histogram
- [ ] Typed DizyBrain state contract
- [ ] DizyBrain qualification using the active strategy threshold
- [ ] DizyAcademy product refresh
- [ ] Accessibility, mobile and terminal-collision audit
- [ ] Stable customer-facing DizyFlow layout

## Phase 2 — Professional trader tools

- [ ] Trade Replay foundation
- [ ] Replay controls and DizyBrain integration
- [ ] Watchlists and favourites workspace
- [ ] Persistent multi-panel workspaces
- [ ] Multi-chart layouts
- [ ] Server-side and browser alerts foundation
- [ ] Performance analytics
- [ ] Trade journal and review workflow
- [ ] Exportable DizyBrain analysis
- [ ] Public roadmap and release presentation

## Phase 3 — Institutional-style analysis

- [ ] Footprint data model
- [ ] Footprint visualisation
- [ ] Bid/ask delta and cumulative delta
- [ ] DOM ladder improvements
- [ ] Liquidity absorption and exhaustion analytics
- [ ] Correlation and market-regime dashboard
- [ ] Portfolio and cross-market risk views
- [ ] Heatmap renderer isolation and reproducible visual harness
- [ ] Stable Bookmap-style heatmap presentation
- [ ] Visual strategy builder

## Phase 4 — Guarded exchange connectivity

This phase starts only after a separate security milestone.

- [ ] Exchange abstraction layer
- [ ] Encrypted credential storage
- [ ] Read-only account connectivity
- [ ] Balances, positions and account health
- [ ] Order preview and validation
- [ ] Server-side risk engine
- [ ] MEXC guarded execution
- [ ] Idempotent routing and exchange reconciliation
- [ ] Loss limits, symbol limits and emergency kill switch
- [ ] Complete audit log
- [ ] Multi-exchange support
- [ ] Mobile companion experience

## Milestones

### Active Beta

The platform is useful for public charting, market study, deterministic signals, simulation and education, while live execution remains disabled.

### Professional Trading Terminal

Complete when price sources, Paper v2, market depth, replay, watchlists, workspaces, alerts and analytics are stable.

### Institutional Analysis Workspace

Complete when footprint, delta, liquidity, correlation and portfolio-risk tools are reliable and clearly explained.

### Guarded Trading Platform

Complete only after the security, risk, reconciliation and audit requirements for live connectivity are independently satisfied.

## Delivery rules

- One focused feature per pull request.
- Work from current `main`.
- Run lint, tests and production build before merge.
- Keep display preferences separate from trading logic.
- Do not infer unavailable exchange, strategy or risk data.
- Prefer deterministic and explainable behaviour over black-box output.
- Live trading remains disabled until Phase 4 requirements are complete.
