# DizyTrades Principles

These principles are the product constitution for DizyTrades. New features should strengthen them rather than work around them.

## 1. Everything important is deterministic

Signals, simulations, risk calculations and explanations must be reproducible from known inputs and configured rules.

DizyTrades does not present an opaque model opinion as a trading signal.

## 2. Explain every signal

A BUY or SELL label is incomplete without the evidence that produced it.

DizyBrain should explain current bias, confluence, structure, risk context, confirmation and missing inputs without inventing unavailable data.

## 3. No signal is better than a poor signal

The platform should reject weak or contradictory setups rather than force activity. Restraint is a feature.

## 4. Simulation should resemble exchange reality

DizyPaper should model leverage, margin, fees, mark-to-market P&L, liquidity constraints, stops and liquidation as realistically as practical.

Simulation limitations must remain visible.

## 5. Display is not logic

Changing colours, overlays, visible price source, layout or chart presentation must not silently alter strategy, fills, liquidation or risk calculations.

User-interface state and trading-engine state must be typed and separate.

## 6. Confirmed candles over hindsight

Signal and structure logic should prefer completed candles. Forming candles may provide context but must not be presented as confirmed historical evidence.

## 7. Teach, do not merely signal

DizyAcademy and DizyBrain are first-class product systems. The platform should help users understand structure, order flow, confluence, invalidation and risk.

## 8. Independent evidence beats duplicated evidence

Five indicators measuring nearly the same thing do not create five independent confirmations. Confluence should combine distinct information wherever possible.

## 9. Risk is part of the setup

Entry logic without invalidation, sizing and loss boundaries is incomplete. Risk context should be visible wherever a setup or simulated trade is shown.

## 10. Honest unavailable states

Do not fabricate prices, timestamps, thresholds, exchange values or historical rule events. Clearly label fallback, stale, unavailable and coming-soon states.

## 11. Small, reviewable pull requests

Each pull request should solve one clearly defined problem, include relevant tests and avoid unrelated redesigns.

Before merge:

```bash
npm run lint
npm test
npm run build
```

## 12. Performance before decorative complexity

Charts, live feeds and drawing tools should remain responsive. New visual features must respect memory ceilings, retained rendering and reduced-motion preferences.

## 13. Security before live execution

No live order route should exist until encrypted credentials, server-side risk controls, reconciliation, audit logging and emergency shutdown are complete.

## 14. Customer-facing clarity over internal cleverness

Names, status labels and errors should describe what the user can actually see. Historical signals, current setup lean and qualification state must never be merged into one ambiguous label.

## 15. Preserve product coherence

DizyCharts, DizySignals, DizyFlow, DizyPaper, DizyDEX, DizyBrain and DizyAcademy should behave like one connected platform rather than unrelated tools.
