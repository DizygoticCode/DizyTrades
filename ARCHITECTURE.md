# DizyTrades Architecture

This document describes the intended boundaries between public market data, chart presentation, deterministic analysis, simulation and future exchange connectivity.

## System overview

```text
Public exchange and discovery providers
                ↓
Transport, validation and normalisation
                ↓
Typed market state and retained history
        ┌───────┼────────┐
        ↓       ↓        ↓
   DizyCharts DizyFlow DizyDEX
        ↓       ↓
     DizySignals
        ↓
     DizyBrain
        ↓
      DizyPaper
```

Authentication, profiles, workspaces and audit storage sit beside this data path and must not be mixed into public market-feed processing.

## Product surfaces

### Public application

- Marketing site
- View-only terminal launcher
- Dizy Learing Center
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

## Data layers

### Exchange transport

Responsibilities:

- REST and WebSocket connectivity
- official symbol and contract metadata
- candles, ticker prices, depth and public trades
- timeout, retry and recovery handling
- sequence and duplicate protection

Transport code must not contain user-interface assumptions or strategy rules.

### Validation and normalisation

Every external value must be validated before entering shared state.

Responsibilities:

- finite numeric conversion
- symbol and market identity normalisation
- timeframe mapping
- sorting and deduplication
- stale and unavailable classification
- explicit fallback metadata

### Typed market state

Shared state should distinguish concepts that may look similar in the interface:

- closed candles versus forming candle
- last trade price versus Fair/Mark price versus Index price
- selected display source versus authoritative risk source
- current setup direction versus historical confirmed signal
- current depth versus historical traded volume

Ambiguous DOM text must not be used as a substitute for typed application state.

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

## DizySignals

DizySignals is a deterministic confirmed-candle engine.

Responsibilities:

- calculate trend, structure, volume and risk context
- produce stable historical signal markers
- preserve prefix invariance and non-repainting behaviour
- expose typed evidence for each setup
- provide strategy and simulation inputs

DizySignals must not scrape rendered chart labels or consume state from the isolated TradingView widget.

## DizyBrain

DizyBrain is an explanation layer, not a separate prediction engine.

It should consume a typed snapshot supplied directly by terminal and strategy state, including:

```ts
type DizyBrainSnapshot = {
  currentDirection: "BUY" | "SELL" | "NEUTRAL";
  bias: string;
  phase: string;
  longScore: number;
  shortScore: number;
  activeThreshold?: number;
  riskContext: string;
  currentSignalConfirmed: boolean;
  missingInputs: string[];
};
```

Historical signal records should use a separate type and a separate interface section.

DizyBrain must not invent thresholds, historical timestamps or unavailable rule events.

## DizyFlow

DizyFlow handles market-microstructure data beneath and beside the candles.

Responsibilities:

- validated order-book snapshots and sequential updates
- grouped DOM bids and asks
- trade bubbles and aggregation
- bounded retained liquidity history
- heatmap tiles and rendering data
- feed health and diagnostic state

Market Depth and Volume Profile are distinct:

- Market Depth represents current resting liquidity.
- Volume Profile represents historical executed volume by price.

## DizyPaper

DizyPaper is isolated from live execution.

Responsibilities:

- manual and signal-driven simulated orders
- margin, notional and quantity sizing
- leverage and fee modelling
- unrealised and realised P&L
- stop, target and liquidation modelling
- impossible-liquidity rejection
- per-user saved simulation state

Fair/Mark price should be the authoritative risk and liquidation source when available. A visual Last/Fair/Index selector must not change the risk source.

## Storage and identity

- Signed HTTP-only sessions
- SQLite-backed accounts where available
- legacy owner/admin fallback
- isolated per-user settings
- saved chart workspaces
- paper snapshots and audit events
- bounded persistent DizyFlow history

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

Encrypted credential storage, loss limits, symbol limits, emergency shutdown and reconciliation are mandatory before execution is enabled.

## Pull-request architecture rule

A feature PR should normally touch only the layers it needs. Changes crossing transport, strategy, simulation and interface boundaries must explain why, add contract tests and document what deliberately remains unchanged.
