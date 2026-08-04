# Owner MEXC read-only credential activation

Status: implemented as a server-only activation boundary. No browser route, account UI or exchange order route is added by this slice.

## Purpose

DizyTrades can load one owner-scoped MEXC Futures credential pair from the Render server environment and make it available only to the reviewed private GET transport.

The activation layer composes with the existing capability proof. It does not broaden the endpoint allowlist, accept caller-provided URLs or methods, or enable live trading.

## Render variables

Configure these directly in Render. Never commit or paste the credential values into GitHub, logs, browser code or chat.

```text
OWNER_MEXC_ACCOUNT_COMPANION_ENABLED=true
OWNER_MEXC_READONLY_API_KEY=<owner access key>
OWNER_MEXC_READONLY_API_SECRET=<owner secret key>
OWNER_MEXC_READONLY_PERMISSION_ATTESTATION=account-read+trade-read;no-write/v1
LIVE_TRADING_ENABLED=false
```

All four owner variables are declared with `sync: false` in `render.yaml`, so a blueprint deployment does not replace the values managed in Render. Missing enablement defaults to disabled in code.

## Activation requirements

Private credentials are returned to server code only when every condition is true:

1. the Account Companion enable flag is exactly `true`;
2. `LIVE_TRADING_ENABLED` is exactly `false`;
3. both owner credential values are present and structurally valid;
4. the exact read-only operator attestation is present;
5. no matching `NEXT_PUBLIC_` credential variable exists;
6. the executable MEXC capability proof passes;
7. the transport remains pinned to `https://contract.mexc.com`;
8. the endpoint matrix remains GET-only with Account-read and Trade-read declarations;
9. the capability manifest continues to declare `writeCapability: false`.

Partial, dormant, malformed or browser-prefixed configuration fails closed.

## What the report exposes

The safe activation report contains only bounded status facts:

- owner scope;
- disabled or ready state;
- whether a complete configuration exists;
- whether private reads are allowed;
- requested read permission names;
- software-proof and activation digests;
- explicit false values for write permission, live trading and provider permission introspection.

It never contains the API key, secret, signature, signed headers or request body.

## Permission truth

DizyTrades proves its own software boundary: the private transport can issue only the reviewed GET endpoints and contains no order, cancellation, leverage, margin, transfer or withdrawal capability.

The operator attestation records that the key was created with Account-read and Trade-read only and no write permission. It is not a cryptographic provider attestation and does not claim MEXC exposes every key-management toggle through the private API.

A successful real account read in the next slice will confirm that the configured key authenticates and has the required read capability. It still will not make the software write-capable.

## Deliberately absent

- no API route or browser credential form;
- no credential value in repository configuration;
- no balance or position request in this slice;
- no polling scheduler or private-state cache;
- no account page yet;
- no order placement, cancellation or exchange mutation;
- no weakening of `LIVE_TRADING_ENABLED=false`;
- no additional Render service, disk or paid infrastructure.

## Emergency shutdown

Set `OWNER_MEXC_ACCOUNT_COMPANION_ENABLED=false` and remove both owner credential values in Render. The activation loader then refuses to return credentials. Revoking or deleting the key in MEXC remains the authoritative provider-side shutdown.
