# DizyQuant evidence recorder contract

## Purpose

The evidence recorder is the anti-lookahead boundary between a versioned DizyQuant predictor snapshot and the later market outcome used by a representative evidence campaign.

It does not classify regimes, choose hypotheses, validate metrics, influence DizySignals, place orders or persist raw order books/trade tapes. Its job is narrower: freeze predictor evidence at time `t0`, wait for a separately observed future midpoint, derive the reviewed 60-second midpoint response, and emit compact campaign-ready records.

## Versioned boundary

- recorder schema: `1`
- recorder formula: `dizyquant-evidence-recorder/1.0.0`
- outcome: `midpoint-response-60s-bps/1.0.0`
- outcome horizon: exactly 60 seconds after predictor source time
- maximum accepted sampling lag: 5 seconds after the 60-second horizon
- regime label contract: `dizyquant-explicit-regime-label/1.0.0`
- allowed initial regime labels: `range`, `directional`, `volatility-shock`
- metric registry: exact current `DIZYQUANT_METRIC_SET_VERSION`
- maximum retained completed/pending sample identities: the existing 10,000-sample evidence-campaign ceiling

The five-second sampling lag is not an alternative forecast horizon. It allows the first real public midpoint observation after the exact +60 second boundary to settle the outcome. If no valid matching-symbol midpoint arrives within that bounded lag, the pending sample expires instead of stretching the outcome window.

## Predictor boundary

A pending sample contains only:

- one stable sample ID;
- one explicit reviewed regime label;
- one positive baseline midpoint;
- one immutable `DizyQuantReplaySnapshot`;
- predictor, due and expiry timestamps;
- fixed research-only safety flags.

Replay predictor coverage may never extend beyond the predictor source timestamp. A caller cannot attach future depth, trades or another later metric value to the predictor after capture. The recorder snapshots the Replay structure so later caller mutation cannot rewrite the retained predictor.

The recorder deliberately accepts valid Replay snapshots that may later be rejected by the campaign evaluator for gapped, unavailable or metric-unavailable evidence. Evidence quality remains the responsibility of the existing campaign contract rather than being silently repaired by the recorder.

## Future outcome

The outcome is defined as:

```text
(outcome midpoint - baseline midpoint) / baseline midpoint * 10,000
```

The midpoint observation must:

- match the predictor symbol;
- be a positive finite value;
- have a safe event timestamp;
- occur no earlier than `t0 + 60s`;
- occur no later than `t0 + 65s`.

An observation before the future horizon cannot complete a sample. A first observation after the bounded lag expires the sample. Missing outcomes are not converted to zero and are not sent to the campaign evaluator.

## Dataset and campaign runner

Completed records can be converted into a deterministic canonical JSON dataset. Import re-validates:

- schema, formula, outcome and metric-set versions;
- exact safety flags;
- sample identity uniqueness;
- Replay predictor structure;
- horizon timestamps;
- midpoint arithmetic.

Dataset ordering is deterministic by predictor source time and sample ID.

The runner selects records that contain the requested campaign metric and maps them directly to the existing `DizyQuantEvidenceCampaignSampleInput` contract. The existing campaign evaluator remains authoritative for evidence grade, continuity, gaps, availability, symbol/regime matrix coverage and metric qualification.

Coverage-ready still means only that every configured symbol × regime cell has enough qualified observations. It does not mean validated, predictive, profitable or promotable.

## Explicitly not in this slice

This recorder foundation does **not** yet:

- automatically classify `range`, `directional` or `volatility-shock` regimes;
- choose a shock timestamp for the 60-second resilience formulas;
- attach itself to the live DizyFlow hook;
- persist records to browser storage, server storage or a new database;
- retain full depth frames, raw DOM rows, raw heatmap tiles or a long-lived public trade tape;
- select which DizyQuant metric should be retained or rejected;
- change DizySignals, Scanner, Paper, Account Companion or execution code.

Those boundaries are intentional. Regime classification and shock selection are research methodology and need their own versioned, reviewable rules instead of being invented inside a storage helper.

## Next integration slice

The next slice may feed this recorder from the existing public DizyFlow path only after it can prove:

1. the 10-second, 30-second and 60-second formula windows are constructed from genuine ordered public evidence;
2. transient raw frames remain strictly bounded in memory and are discarded after a Replay snapshot is formed;
3. sequence gaps and source recovery cannot be painted over;
4. baseline midpoint is captured at predictor time and the future outcome is not available to predictor construction;
5. any regime/shock labelling rule is separately versioned and tested;
6. only compact completed evidence is exported for campaign analysis.

No new paid service or execution capability is required for that integration.
