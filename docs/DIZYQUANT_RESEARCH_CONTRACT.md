# DizyQuant Research Contract

DizyQuant is a versioned market-microstructure research layer built from DizyTrades public depth, trade and retained-liquidity evidence. It is not a prediction engine and does not influence DizySignals unless a later metric passes Replay and statistical validation and is promoted through a separately reviewed change.

## Current foundation

The first foundation provides:

- one immutable candidate-metric registry;
- explicit units, evidence requirements and promotion status;
- fresh, stale, gapped and unavailable classifications;
- separate snapshot-grade and continuous-stream-grade evidence;
- deterministic Replay serialisation;
- a repository contract proving that no production consumer currently imports DizyQuant;
- `decisionEligible: false`, `signalEligible: false` and `signalInfluence: forbidden` on every current output.

No metric formula, user interface, alert, Paper input, Scanner input or signal contribution is added by this foundation.

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

## Candidate metric set v1

The registry reserves stable identities for the first programme:

1. quoted spread in basis points;
2. visible-depth imbalance within 25 basis points;
3. ten-second aggressive-flow imbalance;
4. displayed liquidity added over thirty seconds;
5. displayed liquidity removed over thirty seconds;
6. visible-liquidity centre shift;
7. liquidity recovery time after a defined shock.

All candidates begin as **informational**. Their definitions reserve identity, unit and evidence grade only; calculations arrive in focused later pull requests.

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

1. research schema and source-quality contract — this foundation;
2. spread and ladder-state metrics;
3. aggressive-flow and consumption metrics;
4. liquidity migration and persistence;
5. resilience, replenishment and candidate-event studies;
6. Replay/statistical laboratory and bounded research presentation.

DizyQuant remains isolated from DizySignals throughout this programme unless an explicit later promotion passes independent review.
