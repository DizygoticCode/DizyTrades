# DizyQuant campaign recorder runner

This document defines the first process-owned collection runner for the bounded DizyQuant representative evidence campaign.

The runner turns the already reviewed live depth publication, regime methodology and anti-lookahead recorder into durable research observations. It does not promote a metric, alter DizySignals, create an execution route or relax any existing evidence boundary.

## Process ownership

Campaign collection belongs to the Node server process, not to a browser tab.

The root `instrumentation.ts` starts the existing DizyFlow archive collectors first and then starts one process-wide DizyQuant campaign recorder service. The browser route `/api/dizyquant/evidence/stream` is now a read-only subscriber to the process publication hub. Opening, closing or multiplying browser tabs cannot create additional campaign runtimes, additional collector references or additional samples.

The compact publication hub is stored on the current runtime's `globalThis` so separately bundled server modules share one process state. Browser code receives its own browser-global copy and remains only a presentation subscriber.

The current runner assumes the repository's existing single-instance file-storage architecture. Horizontal application scaling must not be enabled for this campaign without a separately reviewed cross-process lease and shared durable storage contract.

## Collector budget and terminal priority

Low-memory DizyFlow defaults to two depth collectors. The existing background archive reserves up to `MAX_COLLECTORS - 1` collectors and defaults to `BTC_USDT`, deliberately preserving one slot for the actively viewed market.

The campaign does not raise that limit and does not permanently reserve the remaining slot.

Instead it uses an opportunistic lease:

1. every five seconds the campaign attempts to acquire the current residency symbol;
2. it attaches its process-owned research subscription when capacity exists;
3. it immediately releases the collector registry reference again;
4. the collector may continue during the existing idle grace period;
5. normal terminal traffic remains free to prune that zero-reference campaign collector through the existing registry capacity path;
6. if the terminal occupies the slot, the campaign waits and retries later.

If campaign collection is interrupted, its 60-second evidence runtime loses continuity and fails closed. A missed target is skipped rather than reconstructed from future data.

The background DizyFlow archive keeps its existing startup and capacity contract. The campaign receives no privileged collector capacity.

## Deterministic residency schedule

Version `dizyquant-campaign-recorder-runner/1.0.0` uses a fixed wall-clock schedule independent of market state and later outcomes:

- residency length: **180 seconds**;
- symbols: `BTC_USDT`, `ETH_USDT`, `SOL_USDT` in fixed round-robin order;
- one representative predictor target per residency at **+110 seconds**;
- same-symbol targets are therefore separated by **nine minutes**;
- the remaining 70 seconds of residency leave room for the +60-second future outcome and its bounded five-second observation lag.

A five-second live publication cadence is still only a publication cadence. Only the exact target boundary can open the representative sample for that residency.

This avoids counting overlapping five-second publications as independent evidence and prevents regime- or outcome-dependent cherry-picking of predictor times.

## Representative predictor

The first nine-cell campaign is:

- campaign ID: `depth-imbalance-25bps-representative-v1`;
- metric: `depth-imbalance-25bps`;
- symbols: BTC, ETH and SOL USDT perpetuals;
- regimes: range, directional and volatility-shock;
- threshold: 50 qualified representative observations per symbol × regime cell.

A representative sample opens only when the exact target publication contains a fresh snapshot-grade ladder Replay snapshot whose source time exactly matches the publication's real as-of exchange source time and whose `depth-imbalance-25bps` value is finite.

The predictor is therefore bounded to the ±25-bps source range already proven by the campaign runtime.

## Shock-only evidence

A target publication labelled `volatility-shock` may additionally open one separate shock research record from its fresh continuous resilience Replay snapshot.

This record does not double-count the representative matrix. Campaign evaluation selects `depth-imbalance-25bps`, so resilience/absorption/exhaustion records do not enter the nine-cell representative qualified count unless a separate metric-specific study explicitly selects them.

Range or directional windows never manufacture an absorption or exhaustion predictor.

## Predictor and outcome clocks

Two predictor clocks are intentionally preserved:

- representative ladder record: predictor time is the actual as-of exchange `sourceTimeMs`, which may precede the exact target boundary by at most one second;
- shock resilience record: predictor time is the exact 60-second resilience window boundary.

The recorder's existing `midpoint-response-60s-bps/1.0.0` outcome remains unchanged:

- outcome due at predictor time +60,000 ms;
- observations before that horizon cannot complete a sample;
- the first valid same-symbol midpoint at or after the horizon may complete it;
- observations later than +65,000 ms expire the sample instead of silently stretching the outcome horizon.

The runner uses actual public depth source timestamps for outcome observations. It never substitutes wall-clock time, a candle close or a later Replay frame.

## Durable methodology provenance

The older generic evidence recorder stores the sample regime but predates the reviewed campaign regime formula. The runner therefore persists one explicit provenance record for every pending or completed sample.

That provenance includes:

- deterministic sample ID and sample kind;
- symbol and residency slot;
- exact residency start, target and end;
- campaign publication runtime version;
- exact regime formula version;
- regime label;
- publication boundary time;
- publication source time;
- predictor source time;
- selected shock timestamp when applicable.

Stored state fails validation if any pending or completed sample lacks matching provenance, if the versions do not match the reviewed contracts, or if the clocks do not match the deterministic residency and Replay snapshot.

## Persistence

Campaign collection requires an explicit durable `DATA_DIR`. Unlike ordinary development storage, this dataset has no `.data` fallback: if `DATA_DIR` is absent, the service enters `storage-failed` and collects nothing.

Runner state is stored below that boundary at:

`dizyquant/campaign/representative-v1.json`

The deployment is responsible for mapping `DATA_DIR` to storage that survives process replacement and deploys. The current repository storage architecture supports one service instance; an ephemeral filesystem is not acceptable evidence storage for this campaign.

The store:

- serialises writes;
- validates the full runner state before accepting it;
- enforces a bounded file size;
- writes to a private temporary file and atomically renames it into place;
- treats malformed or incompatible existing state as a collection-stopping error rather than resetting the campaign to zero.

Completed records, pending +60-second outcomes, methodology provenance and bounded expiry audit state survive a normal process restart only when the configured `DATA_DIR` is durable.

A storage write failure stops campaign collection. The runner does not continue accumulating unpersisted observations.

## Production status

Authenticated users can inspect the bounded process status through:

`/api/dizyquant/evidence/status`

The response exposes the active residency, service phase, pending/completed/expired counts and the current nine campaign cells. It is private/no-store and contains no raw credentials or account state.

The status may report `waiting-collector-capacity` while normal terminal activity uses the remaining low-memory collector slot. That is expected and preferable to degrading the customer-facing terminal.

A `storage-failed` phase means the campaign is not counting observations. The deployment's `DATA_DIR` durability must be corrected before collection resumes; the service never substitutes ephemeral storage or resets an incompatible dataset automatically.

## Research and safety boundary

Every runner state, record and status remains:

- `researchOnly: true`;
- `decisionEligible: false`;
- `signalEligible: false`;
- `executionEligible: false`;
- `promotionEligible: false`.

No account balance, private MEXC API, credential, DizyPaper state, Journal state, DizyBrain behaviour state, DizySignals score or order route enters campaign collection.

Coverage-ready still means only that the bounded symbol × regime matrix has enough qualified representative observations to run the planned Replay studies. It does not mean predictive, validated or promotable.
