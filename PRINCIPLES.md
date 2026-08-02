# DizyTrades Principles

These principles are the product constitution for DizyTrades. New features should strengthen them rather than work around them.

## 1. Everything important is deterministic

Signals, simulations, risk calculations, Replay projections, reviews and analytics must be reproducible from known inputs and configured rules.

DizyTrades does not present an opaque model opinion as a trading signal.

## 2. Explain every qualification and rejection

A BUY or SELL label is incomplete without the evidence that produced it.

DizyBrain should explain current bias, confluence, structure, risk context, confirmation and missing inputs without inventing unavailable data.

## 3. No signal is better than a poor signal

The platform should reject weak or contradictory setups rather than force activity. Restraint is a feature.

## 4. Simulation should resemble exchange reality

DizyPaper should model leverage, margin, fees, mark-to-market P&L, liquidity constraints, stops, funding and liquidation as realistically as practical.

Simulation assumptions and limitations must remain visible. A paper fill is never represented as proof of an exchange fill.

## 5. Display is not logic

Changing colours, overlays, visible price source, layout or chart presentation must not silently alter strategy, fills, liquidation, Replay evidence or risk calculations.

User-interface state and trading-engine state must be typed and separate.

## 6. Confirmed candles over hindsight

Signal and structure logic should prefer completed candles. Forming candles may provide context but must not be presented as confirmed historical evidence.

Replay must use only the revealed candle prefix and must never leak future candles into current analysis.

## 7. Teach, do not merely signal

DizyAcademy and DizyBrain are first-class product systems. The platform should help users understand structure, order flow, confluence, invalidation, simulation, review, performance and recovery.

## 8. Independent evidence beats duplicated evidence

Five indicators measuring nearly the same thing do not create five independent confirmations. Confluence should combine distinct information wherever possible.

## 9. Risk is part of the setup

Entry logic without invalidation, sizing and loss boundaries is incomplete. Risk context should be visible wherever a setup or simulated trade is shown.

## 10. Honest unavailable states

Do not fabricate prices, timestamps, thresholds, exchange values, historical flow, fees, R values or past rule events. Clearly label fallback, stale, unavailable and coming-later states.

## 11. Preserve the historical evidence chain

Completed trade facts, retained Replay memory, Historical DizyFlow and deterministic reviews are immutable or versioned records.

Current settings and live market state must not rewrite what was knowable at the time of a trade.

## 12. Separate process from outcome

A good process can lose and a poor process can win. Journal quality, Behaviour observations and realised Performance metrics should remain distinguishable.

Aggregated associations are descriptive and must not be marketed as causes or predictions.

## 13. Small, reviewable pull requests

Each pull request should solve one clearly defined problem, include relevant tests and avoid unrelated redesigns.

Before merge:

```bash
npm run lint
npm test
npm run build
npm run test:e2e  # when the workflow or browser surface changes
```

## 14. Performance before decorative complexity

Charts, live feeds, Scanner requests and drawing tools should remain responsive. New visual features must respect memory ceilings, bounded concurrency, retained rendering and reduced-motion preferences.

## 15. Security before live execution

No live order route should exist until encrypted credentials, MFA, server-side risk controls, reconciliation, idempotency, audit logging and emergency shutdown are complete and independently reviewed.

Read-only account connectivity must precede write permission.

## 16. User-owned evidence needs recovery

Persistent disk is not a backup. Export, integrity validation, dry-run recovery, conflict handling and off-platform copies are part of product trust.

Restores must never silently cross users, replace open Paper state or apply a payload different from the one reviewed.

## 17. Customer-facing clarity over internal cleverness

Names, status labels and errors should describe what the user can actually see. Historical signals, current setup lean, qualification state, provider health and deployment health must never be merged into ambiguous labels.

## 18. Preserve product coherence

DizyCharts, DizySignals, DizyBrain, DizyFlow, DizyScanner, DizyStructure, DizyPaper, DizyJournal, DizyReplay, DizyPerformance, DizyAcademy, DizyDEX, DizyOps and DizyBackup should behave like one connected evidence and learning platform.
