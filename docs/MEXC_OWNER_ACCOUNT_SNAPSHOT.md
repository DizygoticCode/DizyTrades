# Owner MEXC account snapshot service

## Status

This server-only service is the first live-data ingestion layer above the owner-scoped read-only credential activation boundary.

Policy version: `mexc-owner-account-snapshot/1.0.0`.

The service can perform exactly two signed MEXC Contract API reads:

- `GET /api/v1/private/account/assets`
- `GET /api/v1/private/position/open_positions`

Both requests are delegated to the reviewed `mexc-private-readonly` transport. Callers cannot supply a host, path, HTTP method, request body or arbitrary private endpoint.

## Activation boundary

A provider request is possible only when all existing activation gates pass:

- `OWNER_MEXC_ACCOUNT_COMPANION_ENABLED=true`;
- a complete owner key and secret exist only in the server environment;
- the exact read-only operator attestation is present;
- the executable GET-only software proof passes;
- `LIVE_TRADING_ENABLED=false`.

A disabled connection returns a typed `not-configured` account state without making a network request. Malformed or contradictory private configuration fails closed before a network request.

## Snapshot and freshness

A successful refresh:

1. reads all futures account assets and open positions concurrently;
2. validates endpoint and Trade-read provenance;
3. normalises provider decimals, identifiers and enums through the existing immutable MEXC account-state schema;
4. evaluates the snapshot through the existing fresh/stale/unavailable policy;
5. returns only the safe activation report and typed account state.

The default freshness window is fifteen seconds. A failed refresh can retain a previously trusted snapshot only as explicitly stale and decision-ineligible state.

Provider authentication, whitelist, permission, rate-limit, timestamp, timeout, malformed-response and schema failures remain classified through the existing safe failure matrix.

## Secret minimisation

The returned object contains no API key, API secret, signature, signed headers, raw request URL or provider credential field. Credentials exist only long enough to sign the two reviewed server-side requests.

## Deliberately absent

This slice adds no:

- browser credential form;
- application API route;
- terminal account page;
- polling loop or background worker;
- persistent private-account cache;
- database or additional Render service;
- order, cancellation, leverage, margin, transfer or withdrawal route.

The roadmap's live-ingestion checkbox remains open until a separately reviewed owner-only server surface invokes this service on the deployed Render instance and the real provider response is verified without exposing private account data to other users.
