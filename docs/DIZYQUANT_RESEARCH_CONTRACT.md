# DizyQuant Research Contract

DizyQuant is a versioned market-microstructure research layer built from DizyTrades public depth, trade and retained-liquidity evidence. It is not a prediction engine and does not influence DizySignals unless a later metric passes Replay and statistical validation and is promoted through a separately reviewed change.

## Current foundation

The research boundary provides:

- one immutable candidate-metric registry;
- explicit units, evidence requirements and promotion status;
- fresh, stale, gapped and unavailable classifications;
- separate snapshot-grade and continuous-stream-grade evidence;
- deterministic Replay serialisation;
- a repository contract proving that no production consumer currently imports DizyQuant;
- `decisionEligible: false`, `signalEligible: false` and `signalInfluence: forbidden` on every current output.

The second slice adds pure snapshot-grade spread and ladder-state formulas. The third slice adds pure continuous-stream-grade aggressive-flow and flow-response formulas. There is still no user interface, alert, Paper input, Scanner input or signal contribution.

## Evidence grades

### Snapshot grade

Suitable for measurements that need one valid public book observation rather than uninterrupted event history, including:

- quoted spread;
- visible depth within a defined price or basis-point range;
- broad bid-versus-ask depth imbalance;
- visible-depth concentration.

Snapshot-grade evidence can be fresh without claiming continuous sequence coverage.

### Continuous-stream grade

Required for measurements that infer changes through event time, including:

- aggressive-flow imbalance;
- displayed liquidity additions and removals;
- liquidity migration;
- replenishment and withdrawal persistence;
- consumption efficiency;
- resilience and recovery time;
- absorption or exhaustion candidates.

Continuous-stream evidence is classified as gapped unless sequence continuity is explicitly true. A retained last-known book, REST recovery or later checkpoint does not repair the missing event interval for research purposes.

## Availability

- **fresh** — at least one metric value exists, the observation is inside its age boundary, and any required stream continuity is proven;
- **stale** — values exist but the source observation has exceeded its age boundary;
- **gapped** — values exist but the source interval has an explicit gap or required sequence continuity is not proven;
- **unavailable** — no finite metric value exists.

Stale, gapped and unavailable research remains decision-ineligible. Missing evidence is never converted to zero.

## Ladder-state formula set 1.0.0

The pure ladder calculator consumes one already validated and sorted public `BookView`, public contract size and public price step. It never reorders, repairs or mutates provider state.

A book is unavailable when:

- either side is missing;
- a level contains a non-finite or negative value;
- prices are duplicated or not strictly sorted;
- the best bid is locked with or above the best ask;
- contract size or price step is unavailable;
- derived midpoint, spread, notional or weighting arithmetic is non-finite.

### Quoted spread

Given best bid `b`, best ask `a`, midpoint `m = (a + b) / 2` and public price step `t`:

- spread price = `a - b`;
- spread ticks = `(a - b) / t`;
- spread basis points = `(a - b) / m × 10,000`.

### Visible depth bands

Fixed bands are measured at 10, 25, 50 and 100 basis points from midpoint.

For each band `x`:

- bid depth includes bid levels with `price >= m × (1 - x / 10,000)`;
- ask depth includes ask levels with `price <= m × (1 + x / 10,000)`;
- level quote notional = `price × contract quantity × contract size`;
- depth imbalance percent = `(bid notional - ask notional) / (bid notional + ask notional) × 100`.

When both sides contain zero visible notional in a band, imbalance remains unavailable rather than becoming zero. One-sided visible depth may legitimately produce positive or negative one hundred percent.

### Weighted distance and concentration

Inside one hundred basis points:

- depth-weighted distance is the visible-notional-weighted absolute distance from midpoint in basis points;
- near-depth concentration is total visible notional inside twenty-five basis points divided by total visible notional inside one hundred basis points.

When no visible depth exists inside one hundred basis points, both measurements remain unavailable. A valid wide-spread book may still publish spread metrics while nearby-depth metrics remain unavailable.

## Aggressive-flow formula set 1.0.0

The aggressive-flow calculator consumes one exact ten-second half-open event window `[from, to)`. Public trades must be event-time ordered, remain inside the window and have unique normalised trade identities. The calculator accepts at most 100,000 public trades in one window.

A complete zero-trade window is valid evidence of zero observed public activity. It is not converted to unavailable. A partial or unproven stream may retain descriptive totals, but the research envelope classifies the result as gapped.

### Public aggressor flow

Provider-labelled public trades are aggregated into:

- buy-aggressor notional;
- sell-aggressor notional;
- gross aggressive notional;
- net aggressive notional, defined as buy minus sell;
- aggressive-flow imbalance, defined as net divided by gross;
- buy and sell execution counts;
- trade-count imbalance, defined as buy count minus sell count divided by total count.

When gross notional or total trade count is zero, the related imbalance remains unavailable rather than becoming a fabricated neutral value.

### Flow versus opening displayed depth

When opening visible 25-bps depth is available:

- buy-flow pressure = buy-aggressor notional divided by opening displayed ask notional inside 25 bps;
- sell-flow pressure = sell-aggressor notional divided by opening displayed bid notional inside 25 bps.

These are descriptive pressure ratios. They do not claim that every public trade consumed the displayed opening book, because depth can replenish, retreat or trade away from the opening ladder.

### Midpoint response and flow efficiency

When opening and closing midpoint are available:

- midpoint change = `(closing midpoint - opening midpoint) / opening midpoint × 10,000`;
- flow-aligned response signs midpoint change by net aggressive flow so positive values represent movement aligned with the observed net flow;
- flow efficiency = flow-aligned response divided by gross aggressive notional in millions of quote currency.

These measurements describe observed co-movement. They do not establish causality, predict continuation or qualify a trading signal.

### Aggressive-flow unavailable boundaries

The calculator fails unavailable for:

- non-integer or unsafe event timestamps;
- a window other than exactly ten seconds;
- trades outside the half-open window;
- out-of-order trades;
- missing or duplicate normalised trade identities;
- invalid price, quantity, notional or aggressor side;
- invalid midpoint or opening-depth context;
- aggregate or derived numeric overflow.

## Candidate metric set v1.2

The registry contains stable identities for:

- spread price, ticks and basis points;
- bid depth, ask depth and imbalance at 10, 25, 50 and 100 basis points;
- depth-weighted distance inside 100 basis points;
- near-depth concentration from 25 versus 100 basis points;
- ten-second buy, sell, gross and net public aggressor notional;
- ten-second notional and trade-count imbalance;
- buy and sell flow versus opening opposite-side 25-bps displayed depth;
- ten-second midpoint change, flow-aligned response and response per million quote;
- later displayed-liquidity additions and removals;
- later liquidity-centre shift;
- later liquidity recovery time.

All metrics remain **informational** and signal-ineligible.

## Replay and validation

A Replay snapshot preserves source time, symbol, coverage, evidence grade, continuity state, values, limitations and research status. Evaluation time, current age and configured freshness threshold are excluded so the same historical evidence serialises identically when reviewed later.

Each later metric must provide:

- a deterministic formula and version;
- source units and normalisation rules;
- synthetic edge-case tests;
- prefix-invariance and future-leakage tests;
- stale, gap and unavailable behaviour;
- representative historical samples;
- null or baseline comparisons;
- false-positive and false-negative analysis;
- regime and symbol sensitivity;
- a recorded promotion, retention or rejection decision.

A negative result is a valid research outcome.

## Provider limitations

MEXC public Futures depth is aggregated by price level. DizyTrades does not receive public individual-order identity, trader identity, true queue position, hidden liquidity or matching-engine intent.

Public aggressor-side labels follow provider semantics and can describe observed public market flow. They do not reveal private intent, participant identity, hidden executions or the exact order path through the matching engine.

DizyQuant may describe displayed-depth movement, turnover, persistence and public aggressive trading. It must not claim to identify spoofing, institutional intent, individual participants or actual queue priority.

## Production resource boundary

The production Render service remains a bounded collection and presentation service:

- no additional paid service, database or worker;
- no unbounded full-book archive;
- no production parameter search or model fitting;
- no continuous collection across a large symbol universe;
- incremental rolling calculations only;
- compact candidate-event or metric snapshots only;
- heavier statistical validation runs locally, in GitHub Actions, or on a separately approved research machine.

The existing low-memory DizyFlow limits remain authoritative.

## Planned focused slices

1. research schema and source-quality contract — complete;
2. spread and ladder-state metrics — complete as a pure formula layer;
3. aggressive-flow and consumption metrics — implemented as a pure formula layer;
4. liquidity migration and persistence;
5. resilience, replenishment and candidate-event studies;
6. Replay/statistical laboratory and bounded research presentation.

DizyQuant remains isolated from DizySignals throughout this programme unless an explicit later promotion passes independent review.
