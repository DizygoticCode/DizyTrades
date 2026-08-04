# Owner Account Companion risk refresh

Policy version: `mexc-owner-account-companion/1.0.0`.

The owner-only DizyAccount refresh now coordinates three reviewed private reads when an open futures position exists:

- all futures assets;
- open futures positions;
- current provider risk limits.

Assets and positions are refreshed first. Risk context is requested only when that account snapshot is fresh and contains at least one open position. An account with no open positions reports risk context as not applicable and does not make the additional request.

A risk-limit failure does not discard a valid balance and position snapshot. The account remains available while risk context is labelled unavailable with the existing fixed, secret-free failure classification.

The server-rendered `/account` page displays provider risk level, maximum leverage, maximum contract volume, maintenance-margin rate, initial-margin rate, ADL level and bounded attention reasons. It labels this context informational and explicitly not a liquidation oracle.

The coordinator delegates signing and network access to the reviewed GET-only transport. It contains no HMAC implementation, raw fetch call, browser credential form, API route, polling loop, persistent cache or exchange-write capability.

The roadmap live-ingestion item remains pending until the deployed Render page is exercised with the owner's read-only key and the real provider response is confirmed without schema or permission errors.
