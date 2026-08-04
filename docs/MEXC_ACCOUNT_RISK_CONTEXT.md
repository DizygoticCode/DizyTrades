# MEXC account risk context

## Scope

Policy version: `mexc-account-risk-context/1.0.0`.

This server-only layer combines a reviewed MEXC futures account snapshot with one `risk-limits` Trade-read result. It maps current open positions to the provider's current risk level, maximum volume, maximum leverage, maintenance-margin rate and initial-margin rate for the same symbol and side.

The source endpoint is:

- `GET /api/v1/private/account/risk_limit`

No host, path, method or request body is accepted by this interpretation layer. Network access and signing remain exclusively inside the existing reviewed read-only transport.

## Output

Each position retains:

- immutable position identity, symbol and side;
- current leverage, contract volume and ADL level;
- matching provider risk-limit context when present;
- exact leverage-within-limit and volume-within-limit comparisons;
- bounded attention reasons for missing context, provider-limit mismatch, high ADL level or system-held state.

Missing provider context remains explicit. It is never replaced with a guessed tier, maintenance rate or leverage limit.

## Interpretation boundary

The output is informational account context only:

- it is not a liquidation oracle;
- it does not reproduce MEXC's complete matching, margin or liquidation engine;
- it does not claim that the displayed risk tier will remain unchanged;
- it does not infer pending-order exposure, hidden provider state or future fills;
- it has no execution permission.

The account snapshot and risk-limit receipt remain separately timestamped so later freshness handling can reject stale combinations.

## Safety

The output contains no API key, API secret, signature, signed headers or raw request URL. The module contains no fetch, HMAC, write method or private mutation route.

A later focused slice may connect this model to the owner-only DizyAccount refresh and presentation after the provider response is validated on Render.
