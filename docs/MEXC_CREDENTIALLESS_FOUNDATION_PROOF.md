# MEXC Credentialless Read-Only Foundation Proof

Status: software-boundary proof complete. No real MEXC credential is configured or attested.

This record closes the planned credentialless foundation sequence for the Read-only Account Companion programme. It proves that the current private-account software boundary can express only the reviewed MEXC Futures reads and that the surrounding account-state, availability, reconciliation, preview and audit foundations add no exchange-write route.

It does not prove the permission switches of a future real API key. That requires separate server-side custody, connection, revocation and live permission-attestation work.

## Completed foundation slices

The credentialless sequence now contains:

1. a server-only private MEXC transport selected by typed endpoint ID;
2. a typed immutable futures account-state model with mocked asset and open-position ingestion;
3. fresh, stale and unavailable account-state classification;
4. observation-only reconciliation against DizyPaper;
5. a hypothetical, explicitly non-executable order preview;
6. minimised SHA-256-linked shadow audit events;
7. this runtime manifest and repository-level permission proof.

No slice adds a credential store, browser credential form, private API route, order request or live-trading capability.

## Runtime capability proof

`buildMexcReadOnlyPermissionProof` reads the executable transport manifest and requires the exact reviewed matrix:

| Endpoint ID | Method | Permission | Path |
| --- | --- | --- | --- |
| `all-assets` | GET | Trade read | `/api/v1/private/account/assets` |
| `single-asset` | GET | Account read | `/api/v1/private/account/asset/{currency}` |
| `open-positions` | GET | Trade read | `/api/v1/private/position/open_positions` |
| `risk-limits` | GET | Trade read | `/api/v1/private/account/risk_limit` |
| `tiered-fee-rate` | GET | Trade read | `/api/v1/private/account/tiered_fee_rate` |

The proof also requires:

- transport policy version match;
- origin pinned to `https://api.mexc.com`;
- method set exactly `GET`;
- permission set exactly Account read and Trade read;
- unique endpoint identities;
- `writeCapability: false`.

The sorted proof facts receive a deterministic SHA-256 digest. The proof fails when any required runtime check is false.

## Repository contracts

CI reads the production source and deployment configuration directly. It rejects:

- POST, PUT, PATCH or DELETE in the private transport/foundation;
- private order, cancellation, leverage, margin, transfer or withdrawal paths;
- request bodies in the private transport;
- private fetch, HMAC or signed-header construction outside the single reviewed transport;
- private-account foundation imports from client components;
- private-account foundation imports from application API routes;
- MEXC private key or secret environment slots in `.env.example` or `render.yaml`;
- production configuration that no longer declares live trading disabled;
- a preview that no longer declares itself hypothetical and non-executable.

These checks are intentionally source and configuration contracts rather than a broad keyword ban. The code may classify and discuss rejected write permission without gaining a write route.

## Forbidden capabilities

The proof records the following capabilities as absent:

- order submission;
- order cancellation or cancel-all;
- leverage changes;
- margin changes;
- position-mode changes;
- asset transfers;
- withdrawals.

There is no raw host, path or HTTP-method input at the private transport boundary. Callers select one typed allowlisted read endpoint.

## What this proof does not establish

This is not proof that a future MEXC key is read-only. No key exists in DizyTrades yet, so the system cannot currently verify:

- which permission toggles the owner selected in MEXC;
- whether Trading, Account modification or Transaction modification is disabled;
- whether an IP whitelist is correctly configured;
- whether the key has expired or been revoked;
- whether MEXC changes its permission model after this review.

The runtime report therefore states:

- `realCredentialConfigured: false`;
- `realKeyPermissionAttested: false`;
- `credentialAttestationStatus: not-performed`.

A future real connection must re-check the official MEXC documentation, inspect the key's effective behaviour without requesting a write, and surface failure as unavailable rather than broadening permissions.

## Roadmap status

The six planned credentialless software foundations are complete. The active roadmap boxes remain open because they describe a working real-account companion, not merely its unplugged software components.

Still required before any roadmap promotion:

- reviewed server-side credential custody and deletion;
- connection of a deliberately read-only key;
- real balance/position/account-health reads;
- live freshness and failure behaviour;
- real reconciliation and hypothetical preview presentation;
- persistent owner-scoped shadow audit storage and anchoring;
- explicit evidence that the configured key has no write permission.

Live execution remains disabled. Provider-level disk rollback remains deferred to the guarded-execution security milestone. No paid infrastructure was added by this foundation sequence.
