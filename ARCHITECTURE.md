# DizyTrades Architecture

This document describes **how DizyTrades is structured** and the intended boundaries between public market data, chart presentation, deterministic analysis, simulation, replay, research and future exchange connectivity.

The enduring mission and research philosophy live in [VISION.md](VISION.md). Delivery order lives in [ROADMAP.md](ROADMAP.md).

## System overview

```text
Public exchange and discovery providers
                ↓
Transport, validation and normalisation
                ↓
Typed live market state + bounded retained history
        ┌──────────┼──────────┐
        ↓          ↓          ↓
   DizyCharts   DizyFlow   DizyDEX
        ↓          ↓
     DizySignals   │
        ↓          │
     DizyBrain  ←──┘
        ↓
      DizyPaper
        ↓
   DizyJournal
        ↓
    DizyReplay
        ↓
 DizyQuant research
```

Authentication, profiles, workspaces, paper accounts, journals and audit storage sit beside this market-data path. They must not be mixed into public feed processing.

## Product surfaces

### Public application

- Marketing site
- View-only terminal launcher
- DizyAcademy
- Market discovery
- Sign-in and signup
- Loading, recovery and not-found states

### Protected terminal

- DizyCharts
- DizySignals
- DizyFlow
- DizyPaper
- DizyBrain
- Market browser
- Settings, appearance and saved workspaces

### Planned protected modules

- DizyReplay
- DizyJournal
- DizyQuant research views
- Unified Product Launcher
- Watchlists, alerts and analytics

## Data layers

### Exchange transport

Responsibilities:

- REST, WebSocket and SSE connectivity
- official symbol and contract metadata
- candles, ticker prices, depth and public trades
- timeout, retry and recovery handling
- sequence and duplicate protection

Transport code must not contain user-interface assumptions, strategy rules or paper-trading calculations.

### Validation and normalisation

Every external value must be validated before entering shared state.

Responsibilities:

- finite numeric conversion
- symbol and market identity normalisation
- timeframe mapping
- sorting and deduplication
- stale and unavailable classification
- explicit fallback metadata
- bounded collection and retention limits

### Typed market state

Shared state must distinguish concepts that may look similar in the interface:

- closed candles versus a forming candle
- Last price versus Fair/Mark price versus Index price
- selected display source versus authoritative risk source
- current setup direction versus historical confirmed signal
- current resting depth versus retained liquidity history
- current resting depth versus historical executed Volume Profile
- public trades versus resting orders
- live state versus replay state
- informational research observations versus validated signal evidence

Rendered DOM text must never substitute for typed application state.

## Chart and visualisation boundaries

DizyCharts renders price, structure, indicators and manual drawings.

Visual preferences may change:

- colours
- line width
- label size
- visible overlays
- display price source
- layout and panel dimensions

They must not silently change:

- strategy inputs
- confirmed-candle history
- signal qualification
- paper fills
- liquidation marking
- risk limits
- research validation status

Complex chart primitives should consume typed render models and bounded stores. High-frequency depth or trade updates should not force the whole React terminal to rerender.

## DizySignals

DizySignals is a deterministic confirmed-candle engine.

Responsibilities:

- calculate trend, structure, volume and risk context
- produce stable historical signal markers
- preserve confirmed-candle and prefix-invariance behaviour where tested
- expose typed evidence for each setup
- provide strategy and simulation inputs

DizySignals must not:

- scrape rendered chart labels
- consume state from the isolated TradingView widget
- treat current order-book imbalance as a prediction
- accept a DizyQuant metric before validation and an explicit promotion decision

## DizyBrain

DizyBrain is an explanation layer, not a separate prediction engine.

It consumes the typed `DizyBrainSnapshot` supplied directly by terminal and strategy state. The snapshot includes current direction, bias, phase, long and short scores, active confluence, configured qualification threshold, latest-closed-candle signal provenance, risk context, checklist state and explanation metadata.

Historical signal records use a separate type and interface section.

DizyBrain must not invent:

- thresholds
- historical timestamps
- unavailable rule events
- probability claims
- microstructure narratives unsupported by typed measurements

Future DizyQuant context should enter DizyBrain through a separate typed microstructure snapshot with explicit informational, experimental or validated status.

## DizyFlow

DizyFlow handles market-microstructure data beneath and beside the candles.

Responsibilities:

- validated order-book snapshots and sequential updates
- current Market Depth histogram and imbalance
- grouped and virtualised DOM bids and asks
- recent public-trade context
- estimated visible queue-ahead education
- bounded retained liquidity history
- heatmap tiles and rendering data
- feed health and diagnostic state

Market Depth and Volume Profile are distinct:

- **Market Depth** represents current resting liquidity.
- **Volume Profile** represents historical executed volume by price.

Visible queue is approximate. Hidden orders, exchange priority, amendments, cancellations and latency are unavailable without private matching-engine information.

A diagnostic showing retained heatmap data does not prove that a customer-facing historical heatmap rendered correctly.

## DizyPaper

DizyPaper is isolated from live execution.

Responsibilities:

- manual and signal-driven simulated orders
- margin, notional and quantity sizing
- isolated and cross-margin approximations
- leverage, fee and slippage modelling
- unrealised and realised P&L
- stop, target and estimated-liquidation modelling
- per-user account and trade-history state

Fair/Mark price should be the authoritative risk and liquidation source when available. A visual Last/Fair/Index selector must not change the risk source.

Paper calculations should remain typed, deterministic pure functions rather than being embedded in React presentation code.

## DizyReplay

DizyReplay is the future deterministic playback and validation boundary.

Replay should reconstruct recorded or derivable state at a controlled timestamp without contaminating the live terminal.

Planned responsibilities:

- candle-by-candle playback
- confirmed DizySignals evidence at each step
- historical DizyBrain snapshots
- paper-trade lifecycle events
- DizyFlow context where bounded historical data exists
- DizyQuant observations and validation outcomes
- deterministic play, pause, seek and speed controls

Replay state must be separate from live state:

```text
Live transport state ───────→ Live terminal

Recorded replay dataset ───→ Replay clock ───→ Replay projections
```

A replay clock must not mutate the current live feed, current user paper position or live market-health state.

## DizyJournal

DizyJournal is the future review boundary around completed simulated trades.

A journal entry should reference immutable or versioned records rather than whatever the current strategy settings happen to be.

Planned references include:

- trade lifecycle and outcome
- entry-time DizyBrain snapshot
- strategy/settings version
- paper-account assumptions
- replay location
- trader notes, tags and rule-compliance review

## DizyQuant research boundary

DizyQuant measures observable market microstructure. It is not a secret market-maker detector and is not automatically a signal engine.

The intended flow is:

```text
Typed DizyFlow observations
            ↓
Pure measurable metrics
            ↓
Versioned DizyQuant snapshot
            ↓
Replay and statistical validation
            ↓
Informational / Experimental / Validated status
            ↓
Explicit promotion decision
            ↓
Optional DizySignals evidence
```

Candidate metrics include liquidity-ladder skew and migration, replenishment, consumption efficiency, queue turnover, spread regimes and cluster persistence.

Each metric must define:

- required source data
- units and sampling window
- unavailable and stale behaviour
- deterministic formula
- version
- retention requirements
- validation status
- known limitations

No metric may alter DizySignals qualification merely because it looks convincing in the live terminal.

## Storage and identity

- Signed HTTP-only sessions
- SQLite-backed accounts where available
- legacy owner/admin fallback
- isolated per-user settings
- saved chart workspaces
- paper snapshots and audit events
- bounded persistent DizyFlow history
- future versioned journal and replay records

Viewer sessions remain restricted and cannot write protected user state.

## Safety boundary

The current repository must contain no active live-order path. `LIVE_TRADING_ENABLED=false` remains a deployment requirement.

Future live connectivity requires a separate architecture:

```text
User intent
   ↓
Order preview and validation
   ↓
Server-side risk engine
   ↓
Idempotent exchange adapter
   ↓
Exchange acknowledgement and reconciliation
   ↓
Immutable audit record
```

Encrypted credential storage, loss limits, symbol limits, emergency shutdown, reconciliation and independent security review are mandatory before execution is enabled.

## Pull-request architecture rule

A feature PR should normally touch only the layers it needs. Changes crossing transport, strategy, simulation, replay, research and interface boundaries must explain why, add contract tests and document what deliberately remains unchanged.
