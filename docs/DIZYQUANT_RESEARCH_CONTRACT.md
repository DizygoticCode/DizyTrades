# DizyQuant Research Contract

DizyQuant is a versioned public-market microstructure research layer built from DizyTrades depth, trade and retained-liquidity evidence. It is not a prediction engine, participant detector or hidden matching-engine feed.

No DizyQuant metric currently influences DizySignals. Promotion requires representative Replay evidence, statistical review and a separate reviewed code change.

## Current programme status

The original six-slice implementation programme is complete.

| Slice | Status | Delivered boundary |
|---|---|---|
| 1. Research contract | Complete | Stable identities, units, evidence grades, availability states and deterministic Replay records |
| 2. Ladder state | Complete | Spread, visible depth, imbalance, weighted distance and concentration |
| 3. Aggressive flow | Complete | Public aggressor flow, visible-depth pressure and descriptive midpoint response |
| 4. Liquidity migration | Complete | Displayed additions/removals, turnover, persistence, cluster survival and centre migration |
| 5. Resilience and candidates | Complete | Versioned shocks, recovery, replenishment and depth-only experimental candidate flags |
| 6. Replay laboratory | Complete | Held-out evaluation, deterministic null baselines, walk-forward checks and bounded `/research` presentation |

Current registry:

- metric set: `dizyquant-candidates/1.4.0`;
- 67 stable metric identities;
- 65 `informational` metrics;
- two `experimental` metrics: `absorption-candidate-flag` and `exhaustion-candidate-flag`;
- zero `validated` metrics;
- zero signal-eligible metrics;
- every research snapshot remains `decisionEligible: false` and `signalInfluence: forbidden`;
- every lab result remains `promotionEligible: false`.

The implementation programme being complete does **not** mean the hypotheses are proven. The next DizyQuant work is representative evidence collection, Replay studies and explicit retain/reject/promotion decisions—not silent integration into trading logic.

## Evidence grades

### Snapshot grade

Snapshot-grade metrics require one valid public order-book state rather than uninterrupted event history. Current examples include:

- quoted spread;
- visible bid and ask depth within 10, 25, 50 and 100 basis points;
- bid-versus-ask depth imbalance;
- visible-liquidity weighted distance from midpoint;
- near-depth concentration.

Snapshot-grade evidence can be fresh without making a sequence-continuity claim.

### Continuous-stream grade

Continuous-stream metrics infer change through event time. Current examples include:

- public aggressive-flow imbalance;
- displayed additions, removals and turnover;
- liquidity migration and same-price persistence;
- cluster survival;
- shock recovery and replenishment;
- depth-only absorption or exhaustion candidates.

Continuous-stream evidence is classified as gapped unless sequence continuity is explicitly true. A later REST recovery or checkpoint does not repair the missing historical event interval.

## Availability states

- **fresh** — at least one finite metric value exists, live age is inside its boundary and required continuity is proven;
- **stale** — values exist but exceed the live age boundary;
- **gapped** — values exist but required continuity is absent, unknown or broken;
- **unavailable** — no finite metric value exists.

Missing evidence is never converted to zero. Stale, gapped and unavailable research remains decision-ineligible.

Replay serialisation removes evaluation-clock noise. A historical observation does not change identity merely because it is reviewed later and has become stale in wall-clock terms.

## Formula sets

### Ladder state `dizyquant-ladder-state/1.0.0`

The calculator consumes one complete, sorted and validated public book plus reviewed contract size and price step.

Quoted spread uses best bid `b`, best ask `a`, midpoint `m = (a + b) / 2` and price step `t`:

- spread price = `a - b`;
- spread ticks = `(a - b) / t`;
- spread basis points = `(a - b) / m × 10,000`.

Visible quote notional is measured in fixed 10, 25, 50 and 100-basis-point bands. Imbalance is `(bid notional - ask notional) / total visible notional × 100`. Empty two-sided depth keeps imbalance unavailable rather than inventing neutrality.

The formula also records visible-notional weighted absolute distance inside 100 bps and 25-of-100-bps near-depth concentration.

### Aggressive flow `dizyquant-aggressive-flow/1.0.0`

The calculator consumes one exact ten-second half-open event window `[from, to)` of provider-labelled public trades.

It records:

- buy, sell, gross and net aggressive notional;
- buy and sell execution counts;
- notional and trade-count imbalance;
- buy flow versus opening displayed ask depth inside 25 bps;
- sell flow versus opening displayed bid depth inside 25 bps;
- midpoint change, flow-aligned response and response per million quote notional.

A complete zero-trade window is valid zero-activity evidence. Flow-to-depth outputs are pressure ratios, not proof that every trade consumed the opening displayed book. Midpoint response is co-movement, not causality or a continuation forecast.

### Liquidity migration `dizyquant-liquidity-migration/1.0.0`

The calculator consumes a bounded sequence of complete displayed price-level states across one exact thirty-second closed interval.

It records:

- bid, ask and combined displayed additions and removals;
- path turnover and turnover versus opening displayed depth;
- bid, ask and combined same-price persistence;
- upper-quartile opening-cluster survival under a versioned 50% retention rule;
- signed liquidity-centre shift;
- absolute, bid-side and ask-side distance shifts;
- 25-of-100-bps near-depth concentration shift.

Same-price persistence does not prove that the same underlying orders survived. Public aggregated depth cannot distinguish continuous survival from cancellation and replacement at the same price.

### Resilience `dizyquant-resilience/1.0.0`

The calculator consumes one exact sixty-second interval with exact opening, nominated shock and closing states.

Versioned shock rules currently include:

- spread widening of at least 50%;
- nearby bid-depth loss of at least 40%;
- nearby ask-depth loss of at least 40%.

Recovery currently means:

- spread returns within 110% of opening spread;
- affected nearby depth returns to at least 90% of opening depth;
- combined recovery time exists only when every shocked component recovers.

Post-shock replenishment is separated into:

- same-side, same-price replenishment;
- recovered nearby depth appearing at different prices.

Continuation, reversal and no-movement flags are produced only when the shock has one unique depth-vulnerability direction.

The two experimental labels are deliberately conservative depth-only rules:

- **absorption candidate** — substantial, mostly same-price replenishment without versioned directional continuation;
- **exhaustion candidate** — weak replenishment with versioned directional continuation.

They are not proof of absorption, exhaustion, spoofing, institutional intent or future price direction.

## Replay and statistical laboratory

The lab formula is `dizyquant-replay-lab/1.0.0`.

It accepts at most 10,000 strictly ordered, unique, finite observations for one metric identity. Invalid, duplicated, unordered, mixed-metric or oversized datasets fail closed.

The lab:

1. splits evidence chronologically into a training prefix and held-out suffix;
2. learns threshold, direction and majority baseline from training evidence only;
3. evaluates held-out accuracy, baseline lift, balanced accuracy, correlation and grouped outcome effect;
4. compares held-out correlation with deterministic circular-rotation null baselines;
5. performs bounded expanding-prefix walk-forward checks;
6. records one of `retain-experimental`, `reject-current-formula`, `insufficient-evidence` or `invalid-input`.

Held-out outcomes cannot alter the trained threshold or direction. Small valid samples report insufficient evidence instead of invented statistics.

The circular-rotation comparison is a deterministic descriptive null baseline, not a universal statistical-significance test. A lab result cannot promote a metric automatically.

## Bounded public presentation

The public `/research` route consumes one frozen presentation model containing:

- registry identities and labels;
- units;
- evidence grades;
- promotion status;
- six-slice programme status;
- safety safeguards.

It deliberately exposes:

- no live DizyQuant metric values;
- no raw order-book messages;
- no public trade stream;
- no account, Paper, Scanner or signal data;
- no research-to-signal route.

The repository firewall permits this bounded presentation consumer and rejects other production imports of DizyQuant.

## Input and arithmetic boundaries

Formula layers fail unavailable or invalid for applicable cases including:

- malformed runtime arrays or records;
- unsafe, fractional, missing or unordered timestamps;
- missing exact window endpoints;
- duplicate trade identities or price ticks;
- locked, crossed or wrong-side prices;
- invalid midpoint, price step, contract size, quantity or notional;
- excessive frame, level, trade or observation counts;
- non-finite aggregate or derived arithmetic.

Calculators do not reorder, repair or mutate provider evidence.

## Provider limitations

MEXC public Futures depth is aggregated by price level. DizyTrades does not receive public individual-order identity, trader identity, true queue position, hidden liquidity or matching-engine intent.

Public aggressor-side labels follow provider semantics. They do not reveal private intent, participant identity, hidden executions or an exact order path through the matching engine.

DizyQuant may describe public displayed-depth movement, turnover, persistence, replenishment and public aggressive trading. It must not claim to identify spoofing, institutions, individual participants or actual queue priority.

## Production resource boundary

The current Render service remains a bounded collection and presentation service:

- no additional paid service, database or worker;
- no unbounded full-book archive;
- no production parameter search or model fitting;
- no continuous collection across a large symbol universe;
- compact retained evidence and metric snapshots only;
- heavier representative studies run in GitHub Actions, locally or on a separately approved research machine.

The existing low-memory DizyFlow limits remain authoritative.

## Promotion gate

A candidate can be considered for promotion only after a separate study records:

- exact metric and formula version;
- typed source data, units and coverage;
- stale, gapped and unavailable behaviour;
- representative symbols and regimes;
- deterministic Replay evidence;
- prefix-invariance and future-leakage checks;
- null or baseline comparisons;
- false-positive and false-negative analysis;
- out-of-sample or walk-forward checks where practical;
- parameter and regime sensitivity;
- an explicit retain, reject or promotion recommendation;
- independent review of any proposed signal contribution.

A negative result is a valid research outcome. Until a separate promotion PR passes that gate, all current DizyQuant metrics remain isolated from DizySignals.
