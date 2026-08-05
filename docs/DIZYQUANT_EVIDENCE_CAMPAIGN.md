# DizyQuant representative evidence campaign contract

## Purpose

This contract begins the first ongoing DizyQuant evidence-campaign item: collect representative, continuity-qualified samples across selected symbols and market regimes.

It does not validate a metric, train a production model, create a signal contribution or enable execution. A coverage-ready campaign means only that every declared symbol-and-regime cell contains the configured minimum number of qualified observations.

## Versioned boundary

- schema: `1`
- formula: `dizyquant-evidence-campaign/1.0.0`
- metric registry: the exact current `DIZYQUANT_METRIC_SET_VERSION`
- maximum submitted samples: 10,000
- maximum selected symbols: 12
- maximum selected regimes: 8
- maximum minimum count per matrix cell: 500

The initial bounded matrix is:

- symbols: `BTC_USDT`, `ETH_USDT`, `SOL_USDT`
- regimes: `range`, `directional`, `volatility-shock`
- minimum qualified observations per symbol-and-regime cell: 50

These defaults establish a reviewable starting scope. They do not claim that three symbols, three regimes or 50 observations are sufficient for scientific promotion.

## Qualified evidence

Every submitted observation must identify:

- one stable sample ID;
- one strictly increasing source timestamp;
- one selected symbol;
- one selected explicit regime label;
- one exact metric identity and version;
- one exact outcome version;
- one finite metric predictor;
- one finite outcome;
- the source kinds and coverage carried by a versioned DizyQuant Replay snapshot.

Snapshot-grade metrics may qualify from one valid public snapshot without inventing sequence continuity.

Continuous-stream-grade metrics qualify only when:

- availability is `fresh`;
- `sequenceContinuous` is exactly `true`;
- `hasGaps` is exactly `false`;
- finite coverage start and end timestamps exist;
- the coverage interval has positive duration;
- the metric value is present and finite.

A later checkpoint or REST recovery does not repair a missing historical interval.

## Rejected evidence

The campaign records, rather than silently repairs or coerces, these rejection classes:

- unselected symbol;
- unselected regime;
- evidence-grade mismatch;
- gapped evidence;
- unavailable evidence;
- missing continuous coverage;
- unavailable metric value.

Missing values are never converted to zero. Rejected samples do not enter Replay-lab observations and do not leak a predictor into diagnostics.

Malformed snapshots, duplicate sample IDs, unordered timestamps, non-finite values, registry mismatches, duplicate matrix declarations and oversized campaigns fail closed.

## Coverage result

The deterministic result contains:

- submitted, qualified and rejected counts;
- rejection counts by stable reason;
- one cell for every selected symbol-and-regime combination;
- qualified count, rejected count and time coverage per cell;
- a bounded list of qualified samples;
- a bounded list of rejected sample identities and reasons;
- lab-compatible observations for the existing deterministic Replay laboratory.

The campaign status is:

- `collecting` while at least one matrix cell remains below its declared minimum;
- `coverage-ready` only when every matrix cell reaches that minimum.

Coverage readiness is not hypothesis validation. It does not imply predictive value, statistical significance, robustness or suitability for DizySignals.

## Safety firewall

Every campaign result and every qualified sample remains:

- `decisionEligible: false`;
- `signalEligible: false` where applicable;
- `signalInfluence: forbidden`;
- `executionEligible: false`;
- `promotionEligible: false`.

The campaign module produces no order instruction and imports no DizySignals or execution code.

Any later retain, reject, revise or promotion recommendation must use a separate reviewed study with held-out evidence, null and baseline comparisons, walk-forward checks, sensitivity analysis and false-positive/false-negative review. A negative result remains a valid outcome.

## Resource and privacy boundary

The contract processes already bounded, typed public-market Replay snapshots. It introduces:

- no new Render service;
- no database or persistent disk;
- no browser credential storage;
- no account, Paper, Journal or private exchange input;
- no unbounded raw order-book archive;
- no continuous production parameter search.

Representative campaign execution belongs in deterministic tests, GitHub Actions, local research runs or a separately approved research machine.
