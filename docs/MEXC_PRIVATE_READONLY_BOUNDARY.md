# MEXC Futures Private Read-Only Boundary

Status: transport foundation only. No private credentials are configured, persisted or accepted by a browser workflow.

This boundary is the first software slice of the Read-only Account Companion programme. It provides a server-only, deny-by-construction transport for a small set of documented MEXC Futures account reads. It does not connect a real account and does not complete the roadmap item for server-side credential custody.

## Official permission model

The MEXC Contract API distinguishes read permissions from modification/trading permissions. The current allowlist uses only endpoints documented as requiring:

- Account reading permission; or
- Trade reading permission.

The policy does not request Account modify, Transaction information modify or Trading permission.

Official references:

- [MEXC Contract API](https://mexcdevelop.github.io/apidocs/contract_v1_en/)
- [MEXC API management overview](https://www.mexc.com/en-GB/mexc-api)

The permission and endpoint matrix is versioned in code as `mexc-private-readonly/1.0.0` and must be rechecked against official documentation before enabling real credentials.

## Allowed capability

Every request is selected by a typed endpoint ID. Callers cannot supply an HTTP method, host or raw path.

| Endpoint ID | Method | Documented permission | Purpose |
| --- | --- | --- | --- |
| `all-assets` | GET | Trade read | Futures asset balances |
| `single-asset` | GET | Account read | One currency balance |
| `open-positions` | GET | Trade read | Current positions |
| `risk-limits` | GET | Trade read | Current account risk limits |
| `tiered-fee-rate` | GET | Trade read | Current maker/taker fee rate |

Symbols and currencies are strictly validated. Unknown parameters, path traversal, unlisted endpoint IDs and malformed identities are rejected before signing or network access.

## Signing boundary

For an allowed GET request, the server:

1. validates credentials in memory;
2. validates and canonicalises declared parameters;
3. builds the request target from API key, request time and canonical query string;
4. signs the target with HMAC-SHA256 using the API secret;
5. sends one `GET` request to `https://contract.mexc.com` with no body, no cache and redirects disabled;
6. enforces a bounded timeout and response-size limit;
7. returns typed data and provenance without returning credentials or request headers.

The API secret is never placed in a URL, response object, capability manifest or error. Provider messages are bounded and must be treated as untrusted text.

## Explicitly absent capability

This foundation has no code path for:

- placing, cancelling or modifying orders;
- changing leverage, margin or position mode;
- transferring assets;
- changing risk limits;
- submitting a caller-provided URL or HTTP method;
- reading credentials from environment variables or user storage;
- exposing credentials to React or browser code;
- automatically retrying a request that might become a write in the future.

Provider error codes requiring account modification or transaction modification are classified as `write-permission-required`; they are never used to broaden the allowlist.

## Failure behaviour

Failures are typed as authentication, IP whitelist, account-read permission, trade-read permission, write permission, stale request, rate limit, timeout, provider or invalid response.

The transport:

- does not return stale cached account state;
- does not infer missing balances or positions;
- rejects oversized or malformed JSON;
- normalises and bounds provider messages;
- never logs inside the transport;
- does not silently change hosts or follow redirects.

A later account-state service must attach explicit observed-at, stale and unavailable states before this data reaches a user interface.

## Credential milestone still open

A real account connection requires a separate reviewed design for:

- per-user server-side credential custody;
- encryption at rest and key rotation;
- owner/admin authorization boundaries;
- API-key permission attestation;
- IP whitelist guidance;
- revocation and deletion;
- audit events that contain no secrets;
- proof that the configured key has no write/trading permission;
- safe handling of MEXC's live-only API environment.

Until that work is complete, no environment variables, database fields, API routes or UI forms accept MEXC private credentials.

## Automated evidence

Tests prove:

- the capability manifest contains only `GET` and read permissions;
- the endpoint allowlist contains no order/change/cancel route;
- signing is deterministic for a fixed key, timestamp and query;
- query parameters are sorted and encoded;
- raw endpoint IDs and undeclared parameters are rejected;
- symbols and currencies reject traversal and malformed values;
- transport requests have no body, use no-store and reject redirects;
- results and errors do not return credentials;
- permission, whitelist, rate-limit, malformed response and timeout failures stay typed.

Live trading remains disabled.
