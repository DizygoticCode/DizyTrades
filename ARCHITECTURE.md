# DizyTrades Architecture

This document describes the current boundaries between public market data, deterministic analysis, microstructure research, simulation, replay, review, analytics, operations and future exchange connectivity.

The enduring mission lives in [VISION.md](VISION.md). Delivery order lives in [ROADMAP.md](ROADMAP.md).

## System overview

```text
Public exchange and discovery providers
                ↓
Transport, validation and normalisation
                ↓
Typed live market state + bounded retained history
        ┌──────────┼──────────┬─────────────┐
        ↓          ↓          ↓             ↓
   DizyCharts   DizyFlow   DizyScanner  DizyStructure
        ↓          ├──────────────→ DizyQuant pure metrics
     DizySignals   │                        ↓
        ↓          │             Replay/statistical laboratory
     DizyBrain     │                        ↓
        ↓          │             retain / reject / promote later
      DizyPaper    │
        ↓          └──────────────→ bounded /research registry
   DizyJournal
        ↓
    DizyReplay ← Historical Replay Memory
        ↓       ← Historical DizyFlow
 Guided Review + Historical DizyBrain Review
        ↓
 Behaviour aggregation + DizyPerformance
```

Authentication, profiles, workspaces, Paper accounts, Journals, retained evidence, backups and audit storage sit beside the public market-data path. They must not be mixed into provider transport.

DizyQuant is a parallel research path, not a shortcut into DizySignals. Its public page exposes definitions and status only; it does not load live values or raw order-book messages.

## Product surfaces

### Public

- marketing site
- view-only terminal launcher
- bounded read-only DizyQuant research registry
- DizyAcademy
- DizyDEX discovery
- sign-in and signup
- loading, recovery and not-found states

### Protected research and workflow

- DizyCharts terminal
- DizySignals
- DizyBrain workspace
- DizyFlow and DOM
- DizyPaper
- DizyScanner
- DizyStructure
- DizyJournal and Guided Review
- DizyPerformance
- DizyOps
- DizyBackup

Viewer sessions may access selected read-only research surfaces but cannot write profile, Paper, Journal, workspace, backup or account data.

## External data boundary

Transport responsibilities:

- REST, WebSocket and SSE connectivity
- official symbol and contract metadata
- candles, ticker prices, depth and public trades
- timeout, retry and recovery handling
- sequence, duplicate and stale protection

Transport code must not contain user-interface assumptions, strategy rules, Paper accounting or research-promotion decisions.

Every external value is validated before entering shared state:

- finite numeric conversion
- market and symbol identity normalisation
- timeframe mapping
- sorting and deduplication
- stale, delayed, fallback and unavailable classification
- bounded collections and retention

## Typed market-state distinctions

The platform must keep these concepts separate:

- closed candles versus a forming candle
- Last price versus Fair/Mark price versus Index price
- selected display source versus authoritative risk source
- setup direction versus historical confirmed signal
- current resting depth versus executed Volume Profile
- current depth versus retained historical liquidity
- public trades versus resting orders
- live state versus replay state
- observed evidence versus trader reflection
- simulation assumptions versus exchange facts
- informational research versus experimental hypotheses versus validated signal evidence

Rendered DOM text must never substitute for typed application state.

## DizyCharts

DizyCharts renders price, structure, indicators and manual drawings.

Visual preferences may change colours, width, label size, visible overlays, display price, panel dimensions and layout. They must not silently change strategy inputs, historical qualification, Paper fills, liquidation marking, retained evidence or research validation status.

Complex chart primitives consume typed render models and bounded stores. High-frequency depth and trade updates must not rerender the whole React terminal.

## DizySignals

DizySignals is a deterministic confirmed-candle engine.

Responsibilities:

- trend, structure, volume and risk context
- stable historical signal markers
- prefix-invariant evidence where tested
- typed qualification and rejection reasons
- strategy and simulation inputs

DizySignals must not scrape rendered labels, consume TradingView widget state, treat current order-book imbalance as prediction or accept DizyQuant metrics without representative validation and a separately reviewed promotion change.

The repository contract keeps every current DizyQuant metric `signalEligible: false`, every research snapshot `decisionEligible: false`, and signal influence `forbidden`.

## DizyBrain

DizyBrain is an explanation and review layer.

Live snapshots include current direction, bias, phase, separate long/short scores, active confluence, configured threshold, confirmed-signal provenance, risk context, checklist state and typed explanation metadata.

Historical review uses retained immutable evidence and a separate deterministic model. Behaviour aggregates completed historical reviews; it does not rerun trades, load Replay candle arrays or predict future performance.

## DizyFlow

DizyFlow owns public microstructure state beneath the candles:

- validated order-book snapshots and sequential updates
- current Market Depth histogram
- grouped virtualised DOM
- recent public trades and flashes
- educational visible queue estimates
- bounded retained liquidity history
- heatmap tiles and render data
- feed health and diagnostics
- typed DizyFlow Intelligence snapshots

Visible queue is approximate because hidden liquidity, venue priority, amendments, cancellations and latency are unavailable. A diagnostic proving retained data exists does not automatically prove every customer-facing visual rendered correctly.

## DizyQuant

DizyQuant is a versioned market-microstructure research boundary built from public depth, public trades and retained-liquidity evidence.

Current implementation:

1. immutable metric registry and evidence-quality contract;
2. snapshot-grade spread and visible-ladder measurements;
3. continuous-stream aggressive-flow and visible-depth-pressure measurements;
4. displayed-liquidity turnover, persistence and migration;
5. shock resilience, replenishment and two explicitly experimental depth-only candidate flags;
6. deterministic Replay/statistical laboratory plus a bounded read-only presentation model.

The registry currently contains 67 stable metric identities: 65 informational and two experimental. None are validated, decision-eligible or signal-eligible.

Evidence states are explicit:

- **fresh** — usable observation age with required continuity proven;
- **stale** — values exist but exceed the live age boundary;
- **gapped** — values exist but required continuity is absent or broken;
- **unavailable** — no finite metric value exists.

The Replay lab uses an ordered training prefix and held-out suffix, deterministic circular-rotation null comparisons and bounded expanding-prefix walk-forward checks. It may recommend retaining an experimental formula, rejecting its current form or recording insufficient evidence. Every result is emitted with `promotionEligible: false`; promotion requires a separate reviewed change.

The public `/research` route consumes only the frozen presentation model. It displays metric identities, units, evidence grades, status, completed slices and safeguards. It exposes no live research values, raw depth, trade streams, account data or signal inputs.

Detailed formula and promotion rules live in [docs/DIZYQUANT_RESEARCH_CONTRACT.md](docs/DIZYQUANT_RESEARCH_CONTRACT.md).

## DizyScanner

DizyScanner reuses the existing market catalogue, confirmed-candle API and DizySignals settings.

Boundaries:

- bounded market universe and request concurrency
- same signal engine as the terminal
- no duplicate qualification model
- no probability-of-profit output
- market-only profile patches so stale tabs cannot overwrite unrelated settings
- viewer watchlists remain session-local

## DizyStructure

DizyStructure is descriptive closed-candle context.

It may derive:

- UTC day/week sessions
- exact opening ranges
- exact preceding daily/weekly levels
- anchored VWAP
- right-wing-confirmed swing pivots
- HH/LH and HL/LL state
- nearby level clusters
- available-feed-only timeframe alignment

Missing boundary candles, incomplete periods and unavailable feeds must remain unavailable. Structure labels do not identify institutional intent.

## DizyPaper

DizyPaper is isolated from live execution. Fidelity V2 is complete and remains an approximation rather than an exchange matching-engine claim.

Responsibilities:

- manual and signal-driven simulated orders
- margin, notional and quantity sizing
- isolated and cross-margin approximations
- leverage, fee, funding and slippage modelling
- depth-sensitive entries and exits with honest partial fills
- unrealised and realised P&L
- stop, target, maintenance-tier, liquidation and bankruptcy modelling
- reduce-only, reverse and flatten behaviour
- per-user account and fill history

Fair/Mark is the preferred risk source when available. A chart display selector must not alter the simulator's authoritative risk source. Existing fills and backups remain migration-safe.

## DizyJournal

Journal entries retain immutable or versioned references rather than current mutable settings.

Trade Review references may include:

- trade lifecycle and outcome
- strategy/settings provenance
- Replay memory
- Historical DizyFlow summary/reference
- Historical DizyBrain review
- trader notes, tags, quality, discipline and mood

Guided Review inserts one bounded marked block into existing notes while preserving free-form text and refusing stale/unsaved overwrite.

## DizyReplay

Replay is a separate deterministic application state.

```text
Live transport state ───────→ Live terminal

Retained/derivable history ─→ Replay clock ─→ Replay projections
```

The replay clock controls the revealed closed-candle prefix. Signals and Brain explanations rebuild from that prefix. Playback, stepping and viewport following must not mutate live feed state or current Paper positions.

Historical DizyFlow may select only prior-or-exact retained samples within a strict age boundary. It must never interpolate, select a future sample or substitute current live flow.

DizyQuant study observations must likewise preserve exact time, symbol, metric identity, coverage and evidence status. Held-out outcomes must never alter a training-prefix model.

## DizyPerformance

DizyPerformance reads immutable completed Journal Trade Reviews.

It may calculate realised PnL, drawdown, expectancy, profit factor, payoff ratio, streaks, holding time, fees coverage, R distribution and deterministic breakdowns.

It must not fabricate account equity or percentages where starting balance is unknown. Missing fees/R remain missing and lower coverage.

## DizyOps

DizyOps exposes bounded owner-only operational metadata:

- deployed build/runtime identity
- storage and retained-evidence status
- aggregate audit health
- application and provider health distinctions

It must not expose credentials, private user payloads or unbounded logs.

## DizyBackup

Backup export is owner-scoped and excludes authentication records, session tokens and secrets.

Restore requirements:

- strict schema and ownership validation
- bounded request size
- integrity hashing
- dry-run before application
- expected-hash match
- explicit confirmation
- conflict reporting
- additive recovery
- no silent replacement of existing/open Manual Paper state
- audit events for export, dry-run, apply and rejection

## Storage and identity

- signed HTTP-only sessions
- SQLite-backed public accounts where available
- legacy owner/admin fallback
- isolated per-user profile settings
- saved chart workspaces
- Paper state and fills
- Journal files
- Replay memories
- Historical DizyFlow memories
- Historical DizyBrain reviews
- bounded audit records
- owner-scoped backups

Writes are atomic where file-backed and serialised where concurrent mutation could corrupt state. Persistent disk supports one service instance; horizontal scaling requires shared managed storage.

## Live-execution boundary

The current repository contains no enabled live-order path. `LIVE_TRADING_ENABLED=false` remains required.

Future connectivity begins read-only. Any write path requires a separate execution architecture:

```text
User intent
   ↓
Order preview and validation
   ↓
Server-side account and risk limits
   ↓
Idempotent exchange adapter
   ↓
Acknowledgement and reconciliation
   ↓
Immutable audit record
```

Encrypted credentials, MFA, loss limits, symbol/notional/leverage limits, reduce-only enforcement, stale-price rejection, emergency shutdown and independent security review are mandatory before execution.

## Pull-request rule

A feature PR should normally touch only the layers it needs. Changes crossing transport, strategy, simulation, replay, storage and interface boundaries must explain why, add contract tests and document what deliberately remains unchanged.
