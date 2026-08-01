<div align="center">

# DizyTrades

### Everything Dizy™

**A transparent crypto market-analysis workspace for charting, order flow, confirmed-candle signals, education and paper trading.**

[Open DizyTrades](https://dizytrades.onrender.com) · [View-only terminal](https://dizytrades.onrender.com/explore) · [DizyAcademy](https://dizytrades.onrender.com/school) · [Report an issue](https://github.com/DizygoticCode/DizyTrades/issues)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js)
![Status](https://img.shields.io/badge/status-active%20beta-7c6cff)
![Live trading](https://img.shields.io/badge/live%20trading-disabled-ff5c70)

</div>

> **Not financial advice. Not signal selling. Not black-box AI.**
>
> DizyTrades is built around transparent market analysis, probability, education, simulation and disciplined risk management. Live exchange execution is disabled.

## Why DizyTrades?

Most platforms tell traders **what** happened. DizyTrades is being built to explain **why** a market condition exists, why a signal qualified, why another setup was rejected and how several independent pieces of evidence combine into a decision.

The project began as a charting and strategy simulator. It has grown into a connected product family covering price structure, order flow, market discovery, paper trading and education.

## The Dizy ecosystem

### DizyCharts

The main multi-timeframe terminal, built with TradingView Lightweight Charts and original DizyTrades tooling.

- MEXC spot and perpetual-market discovery
- closed-candle OHLCV history with public real-time updates
- support and resistance, VWAP, moving averages and Volume Profile
- Fibonacci, Elliott-lite, Wyckoff-lite, triangles and regression channels
- manual trendlines, rays, horizontals, verticals, channels, rectangles, notes and measurements
- SMA, EMA, Bollinger Bands, RSI, MACD and ATR display indicators
- isolated saved workspaces per user, market and timeframe

### DizySignals

A confirmed-candle confluence engine rather than an unexplained stream of BUY and SELL labels.

- non-repainting confirmed-candle analysis
- entries modelled on the following bar
- trend, structure, volume and risk context
- historical signal scanning and paper simulation
- ATR stops, TP1, break-even and TP2 modelling
- detailed signal evidence and deterministic test coverage

### DizyFlow

The market-microstructure workspace beneath the candles.

- depth of market with grouped bids and asks
- liquidity heatmap history
- trade bubbles and large-activity views
- public MEXC depth and transaction feeds
- bounded in-memory and persistent liquidity history
- feed-health, delayed and offline states
- simulation-safe order-book modelling

### DizyDEX

A unified market browser for centralised and on-chain discovery.

- MEXC spot and perpetual catalogues
- Solana, BNB Chain and other pool discovery through public providers
- source-aware search, quote filters and favourites
- liquidity-based pool selection
- graceful provider degradation and cached results

### DizyPaper

Practice and review without risking real funds.

- manual and signal-driven paper trading
- fixed margin, fixed notional and equity-percentage sizing
- leverage-aware futures simulation
- fees, mark-to-market P&L and impossible-liquidity rejection
- saved paper snapshots and per-user isolation

### DizyAcademy

DizyAcademy teaches the platform and the market concepts behind it.

- beginner trading foundations
- chart structure, VWAP, Volume Profile, Fibonacci, Elliott and Wyckoff
- DizySignals, DizyFlow, heatmap and DOM concepts
- order flow, delta, absorption and auction-market theory
- institutional execution, correlation, expectancy and drawdown
- psychology, journaling and “Why DizySignals said NO”
- browser-local progress, search and responsive course navigation

## Product philosophy

DizyTrades follows a few simple principles:

1. **One indicator rarely proves anything.**
2. **Independent evidence is stronger than duplicated evidence.**
3. **Closed-candle confirmation is more honest than intrabar hindsight.**
4. **No signal is better than a poor signal.**
5. **Risk and invalidation matter as much as entry logic.**
6. **Users should be able to understand why the system acted—or refused to act.**

## Current status

### Available now

- [x] Public marketing site and branded product navigation
- [x] View-only terminal sessions
- [x] User accounts with isolated settings and workspaces
- [x] DizyCharts terminal and manual drawing tools
- [x] DizySignals confirmed-candle analysis
- [x] DizyPaper manual and signal simulations
- [x] DizyFlow DOM, heatmap and trade-bubble foundations
- [x] DizyDEX unified market discovery
- [x] DizyAcademy beginner through professional curriculum
- [x] Branded loading, recovery and not-found states
- [x] Automated lint, test and production-build checks

### In active development

- [ ] richer DizyFlow panel composition and saved layouts
- [ ] deeper footprint, delta and order-flow visualisation
- [ ] signal explanation panel: “Why this qualified”
- [ ] rejected-setup analysis: “Why DizySignals said NO”
- [ ] correlation and regime workspace
- [ ] historical replay mode
- [ ] visual strategy builder
- [ ] broader public exchange coverage

### Later, after a separate security milestone

- [ ] optional exchange connectivity
- [ ] encrypted credential custody
- [ ] MFA and hardened database-backed sessions
- [ ] idempotent order routing and exchange reconciliation
- [ ] loss limits, symbol limits and emergency kill switches

Live trading is deliberately **not** part of the current beta.

## Architecture

```text
Public site
├── Landing page
├── View-only session launcher
├── DizyAcademy
└── DizyDEX discovery

Authentication and storage
├── Signed HTTP-only sessions
├── SQLite account storage
├── Legacy owner/admin fallback
├── Per-user profile settings
├── Chart workspaces
└── Paper snapshots and audit events

Protected terminal
├── DizyCharts
├── DizySignals
├── DizyFlow
├── DizyPaper
├── Market browser
└── Settings and appearance

Public data providers
├── MEXC REST candles and market metadata
├── MEXC WebSocket klines, depth and transactions
├── On-chain discovery providers
└── Isolated TradingView Advanced Chart widget
```

TradingView widget data is isolated from DizySignals and paper simulations. The application does not execute Pine Script and does not consume TradingView widget state as strategy input.

## Safety boundaries

Viewer sessions are signed, expire after two hours and use browser `sessionStorage` for local market preferences. They cannot write profiles, paper snapshots, chart workspaces, audit events or user files.

The repository contains:

- no exchange API-key form
- no private exchange endpoint
- no order-placement route
- no live-execution capability

`LIVE_TRADING_ENABLED=false` is a required deployment boundary and the health endpoint reports live trading as disabled.

## Local development

### Requirements

- Node.js 22.13 or newer
- npm

### Setup

```bash
npm ci
cp .env.example .env.local
npm run hash-password -- "choose a long local password"
npm run dev
```

Open `http://localhost:3000`.

Place generated `salt:hash` values in the matching password-hash environment variables and set `SESSION_SECRET` to at least 32 random characters.

Temporary plaintext test passwords can only be enabled explicitly with `ALLOW_TEST_PLAINTEXT_PASSWORDS=true`. That mode is blocked whenever `LIVE_TRADING_ENABLED=true`. Never commit credentials or reuse real passwords.

## Validation

```bash
npm run lint
npm test
npm run build
```

GitHub Actions runs the same checks on pushes and pull requests. The automated suite covers authentication, route boundaries, chart geometry, drawing tools, signal determinism, paper sizing, market discovery, DizyFlow depth processing, heatmap history and public navigation.

## Deployment

The production-style beta is deployed on Render using the included configuration and a persistent disk for account and workspace data.

Important deployment characteristics:

- one Node web service
- persistent storage mounted under `/var/data`
- automatic deploys from `main`
- `/api/health` monitoring
- generated session secret
- live execution disabled

A persistent disk supports one attached service instance. Managed database storage is required before horizontal scaling or separate workers.

## Pattern limitations

**Elliott-lite** uses alternating confirmed pivots and conservative directional progression. **Wyckoff-lite** uses closed-candle range and breakout evidence to annotate an ordered candidate structure.

They are visual heuristics, not guaranteed textbook analysis. Neither contributes to DizySignals confluence or paper-test decisions. Provisional stages retain a `?`, and the forming live candle cannot confirm a stage.

## Contributing

Issues and focused pull requests are welcome.

1. Fork the repository.
2. Create a branch for one clear change.
3. Run lint, tests and the production build.
4. Explain the user-facing effect and any safety implications.
5. Open a pull request against `main`.

Please avoid combining unrelated UI, data-feed and trading-logic changes in one PR.

## Attribution

Chart rendering uses [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) with visible attribution. The separate TradingView Advanced Chart is used as an isolated official widget.

The manual drawing implementation, strategy engine, DizyFlow processing, simulations, academy content and application interface are original DizyTrades work.

## Disclaimer

DizyTrades provides market research, education and simulation tools. Cryptocurrency markets are volatile, simulated performance does not guarantee future results and every trading decision remains the responsibility of the user.

---

<div align="center">

**DizyTrades · Everything Dizy™**

Understand the market. Understand the signal. Understand the decision.

</div>
