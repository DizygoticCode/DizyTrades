# DizyTrades Roadmap

DizyTrades is being built as a transparent, deterministic crypto market-analysis platform that combines charting, confirmed-candle signals, order flow, education and realistic simulation.

This roadmap is directional rather than a promise of dates. Items move only when they are tested, reviewable and safe enough to merge.

## Vision

DizyTrades is a unified trading platform composed of professional modules that share a consistent interface, deterministic reasoning and integrated learning. Each module should feel like part of one coherent product while helping traders understand not only what the market is doing, but why.

## Development Queue

### In Progress

- DizyAcademy refresh
- Product branding consistency

### Next

1. Product Launcher & Unified Navigation
2. Manual Paper Trading v2
3. Market Depth Histogram
4. Replay Engine
5. Replay Controls
6. Watchlists
7. Multi-Workspace
8. Alerts
9. Trading Journal
10. Performance Dashboard
11. Correlation Dashboard
12. Market Scanner
13. Institutional Dashboard
14. Risk Centre

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

## Phase 3 – Unified Product Experience

### Objectives

- Present every DizyTrades product through a consistent, professional interface.
- Make movement between analysis, learning, order flow and paper trading immediate and intuitive.
- Carry deterministic reasoning and relevant learning context across product boundaries.
- Establish shared navigation patterns that can expand without fragmenting the platform.

### Product Suite

- DizyCharts
- DizyBrain
- DizyFlow
- DizyAcademy
- DizyPaper

### Planned Modules

- DizyReplay
- DizyJournal
- Watchlists
- Alerts
- Workspaces

### Product Launcher vision

The future Product Launcher will be the unified navigation experience for the entire DizyTrades platform. It will provide a clear, consistent way to discover modules, move between workflows and return to active market context without treating each product as a separate application.

### Future enhancements

- User-configurable launcher favourites and recent products
- Context-aware transitions between charts, signals, replay, learning and journals
- Shared search and command access across modules
- Role-appropriate layouts and workspace presets
- Cross-module notifications, progress and activity summaries

## Phase 4 — Institutional-style analysis

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

## Phase 5 — Guarded exchange connectivity

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

### Beta 1.0

The intended public beta brings together the unified Product Launcher and navigation, consistent product branding, refreshed DizyAcademy learning, DizyCharts and DizyBrain analysis, DizyFlow market context, Manual Paper Trading v2, market depth, replay and replay controls, watchlists, multi-workspace support, alerts, a trading journal, performance and correlation dashboards, market scanning, institutional analysis and a dedicated Risk Centre. Live execution remains disabled.

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
- Live trading remains disabled until Phase 5 requirements are complete.
