# MEXC Futures Account State Foundation

Status: credentialless model and mocked ingestion only. No real MEXC account is connected.

This slice defines the first typed private-account state used by the Read-only Account Companion programme. It consumes only the already approved private-read endpoint identities `all-assets` and `open-positions` through an injected reader. It does not accept an API key, secret, host, path or HTTP method.

## Source boundary

The model follows the documented MEXC Contract API response fields for:

- `GET /api/v1/private/account/assets`;
- `GET /api/v1/private/position/open_positions`.

Both reads require Trade reading permission. No endpoint requiring Trading, Account modification or Transaction modification permission is represented by this ingestion layer.

Official reference: [MEXC Contract API](https://mexcdevelop.github.io/apidocs/contract_v1_en/).

## Normalised asset state

Each futures asset contains:

- currency;
- position margin;
- frozen balance;
- available balance;
- drawable/cash balance;
- equity;
- unrealised profit and loss;
- optional bonus balance.

Provider decimal numbers are converted to validated canonical decimal text. The model does not perform account calculations with JavaScript binary floating point.

Currencies are upper-cased, strictly validated and sorted. Duplicate currencies fail the entire snapshot rather than being merged or overwritten.

## Normalised open-position state

Each current position contains:

- exact position ID;
- futures symbol;
- long or short side;
- isolated or cross margin mode;
- holding or system-holding state;
- held, frozen and closing volume;
- holding, opening, closing and liquidation prices;
- original and current initial margin;
- holding fees and realised PnL;
- optional ADL level;
- leverage and automatic-margin setting;
- provider creation and update timestamps when present.

Numeric position IDs are accepted only while they are safe JavaScript integers. Larger IDs must be supplied as integer text. This prevents precision loss from silently changing the identity used by later reconciliation.

Only current-position states documented for the open-position feed are accepted. Closed or unknown states fail validation.

## Snapshot contract

A snapshot requires exactly two successful, correctly labelled reads:

1. `all-assets`;
2. `open-positions`.

The reads are issued together. A failure, endpoint mix-up, malformed payload, duplicate identity or invalid field rejects the complete snapshot. No partial balance-only or position-only account state is returned.

The immutable snapshot records:

- schema version;
- provider and account kind;
- observation timestamp derived from the latest completed read;
- deterministic asset and position arrays;
- bounded summary counts and identities;
- endpoint, permission and timing provenance.

It contains no credentials, signatures or signed request headers.

## Deliberately deferred

This foundation does not yet implement:

- real credential custody;
- an API route or browser workspace;
- freshness, stale or unavailable classification;
- cached private state;
- reconciliation against DizyPaper;
- order previews;
- shadow audit events;
- proof against a real MEXC key's configured permissions.

Those remain separate reviewed slices. Live trading remains disabled.

## Automated evidence

The test suite proves that:

- only assets and open positions are requested;
- documented numeric and string decimals normalise deterministically;
- scientific notation expands to canonical decimal text;
- provider enums map to explicit internal values;
- identities and arrays are sorted deterministically;
- duplicate currencies and position IDs are rejected;
- unsafe numeric IDs, malformed decimals, unsupported states and reversed timestamps are rejected;
- endpoint mix-ups fail closed;
- one failed read never produces a partial snapshot;
- serialised account state contains no credential or signature fields.
