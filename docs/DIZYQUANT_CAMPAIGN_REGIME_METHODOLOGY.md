# DizyQuant campaign regime methodology

Status: research-only methodology contract. No trading, signal, execution or promotion use.

## Purpose

The initial DizyQuant evidence campaign requires mutually exclusive `range`, `directional` and `volatility-shock` labels. This module defines those labels from the same pre-outcome public depth evidence used by DizyQuant. It does not reuse strategy phase, Wyckoff/Elliott labels, later candles, account state, Paper results, Journal data or DizyBrain interpretation.

Formula version: `dizyquant-campaign-regime/1.0.0`.

## Predictor window

Classification requires one exact 60-second depth window sampled on a 1-second event-time grid: 61 frames including both endpoints. Depth continuity must be explicitly proven and the window must be gap-free. Any missing boundary, malformed frame, unknown continuity or gap makes the regime unavailable rather than guessing a label.

Only information at or before the predictor endpoint may enter the classifier. The later +60-second campaign outcome is not an input.

## Volatility-shock precedence

`volatility-shock` is not a new free-form threshold. It reuses the existing versioned DizyQuant resilience shock definition:

- spread widening of at least 50% versus the opening frame, or
- bid depth inside 25 bps falling by at least 40%, or
- ask depth inside 25 bps falling by at least 40%.

Only interior frames are eligible because the resilience formula requires opening, shock and post-shock predictor evidence. The closing frame is never nominated as a shock.

When several frames qualify, selection is deterministic:

1. prefer the frame with the greatest number of qualifying shock components;
2. then prefer the greatest normalized severity score, where spread widening is scaled by 50% and each depth loss by 40%;
3. if still tied, choose the earliest event-time frame.

This selection rule is deterministic methodology, not retrospective cherry-picking. A selected shock timestamp remains inside the predictor window and can later be passed to the existing resilience formula once the runtime attachment is reviewed.

## Range versus directional

If no versioned depth/spread shock is present, the label is derived only from the one-second midpoint path.

The classifier calculates:

- net 60-second midpoint displacement in basis points;
- total absolute one-second path travelled in basis points;
- median absolute one-second move;
- directional efficiency = `abs(net displacement) / total path`;
- sign consistency = the share of non-zero one-second moves agreeing with the final net direction.

A non-shock window is `directional` only when all v1 thresholds are met:

- absolute net displacement >= `max(4 bps, 4 × median absolute one-second move)`;
- directional efficiency >= 0.35;
- sign consistency >= 0.55.

All other valid non-shock windows are `range`.

The dynamic floor prevents a very small smooth drift from being labelled directional merely because its efficiency is high, while scaling upward when ordinary one-second movement is unusually large.

## Boundaries

These are research strata, not forecasts. `directional` does not mean the next move will continue, and `range` does not mean mean reversion will occur. `volatility-shock` means the reviewed public spread/depth shock threshold occurred inside the predictor window; it does not identify cause or participant identity.

The methodology is intentionally independent of chart timeframe and strategy state. Threshold or selection changes require a new formula version and must not silently relabel previously recorded observations.

No campaign observation should increment the 450-sample matrix until the runtime publication carries a valid versioned regime result and the existing anti-lookahead recorder later completes its independent +60-second outcome.
