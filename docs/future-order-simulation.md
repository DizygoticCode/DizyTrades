# Future Order Simulation and DizyAcademy Scope

This document records a future product slice. It is not part of the active fee-provenance implementation.

## Goal

Extend DizyPaper and the future trading panel from immediate market actions into explicit pending-order workflows for both futures and spot, with matching DizyAcademy lessons.

## Futures order coverage

- market orders
- limit orders
- time in force: GTC, IOC and FOK where supported
- post-only maker orders
- trigger-market and trigger-limit orders
- trailing stop orders
- chase limit orders, including hedge-mode constraints and maximum chase distance
- take-profit / stop-loss and limit TP/SL
- reduce-only closing semantics
- cancel, replace, expiry and partial-fill lifecycle

## Spot order coverage

- market orders
- limit orders
- limit-maker orders
- IOC orders
- FOK orders
- separate simulated base/quote balances and reserved-order funds
- cancel, replace and partial-fill lifecycle

## Simulation requirements

- typed pending-order state machine instead of instant fills
- exchange-valid price and quantity precision
- maker/taker classification based on actual simulated execution
- order-book-aware fill eligibility
- explicit fill uncertainty and partial-fill evidence
- deterministic replay-compatible order events
- immutable order and fill audit history
- no live credentials or real order routing in the simulation phase

## DizyAcademy lessons

1. Market versus limit: speed, price certainty and slippage
2. Maker versus taker: liquidity, post-only and fees
3. GTC, IOC and FOK time-in-force behaviour
4. Trigger-market versus trigger-limit orders
5. Trailing stops and activation prices
6. Chase limit mechanics, protection distance and hedge-mode limitation
7. TP/SL, limit TP/SL and reduce-only exits
8. Spot balances versus futures margin
9. Partial fills, cancellations and order amendments
10. Practical order-selection exercises inside DizyPaper

## Delivery order

1. Shared pending-order data model and lifecycle
2. Futures limit, GTC/IOC/FOK and post-only
3. Trigger and trailing orders
4. Chase limit simulation
5. Spot account and order simulation
6. DizyAcademy guided lessons and exercises
7. Independent accounting and replay audit
