# Read-only MEXC Account Companion — independent boundary review

Review date: 2026-08-04  
Review scope: merged Account Companion implementation through the owner connection-shutdown programme  
Review method: a separate review-only pull request, adversarial source inspection and executable repository contracts

## Decision

**Accepted as a read-only owner Account Companion and shadow-reconciliation boundary.**

No critical or high-severity software-boundary finding remains open in the reviewed scope. The programme may be marked complete as a research/account-observation feature while `LIVE_TRADING_ENABLED=false` remains mandatory.

This decision does **not** approve exchange execution, browser-held credentials, multi-user broker connections or any private-write route.

## Reviewed implementation sequence

- PR #188 — owner-scoped server-side credential activation and GET-only permission proof
- PR #189 — typed owner futures balance and open-position ingestion
- PR #191 — authenticated owner-only DizyAccount surface
- PR #192 — typed provider risk-limit context
- PR #193 — risk context integrated into the Account Companion
- PR #194 — deterministic MEXC ↔ DizyPaper reconciliation
- PR #195 — non-executable hypothetical DizyPaper order preview
- PR #196 — append-only, hash-chained shadow audit ledger
- PR #197 — persistent local shutdown and credential-removal verification workflow

## Claims supported by executable evidence

### Credential custody and activation

- Private key and secret values are read from server environment variables only.
- Browser-exposed MEXC credential variables are rejected.
- The complete key/secret pair and the exact read-only operator attestation are required.
- Activation fails closed unless `LIVE_TRADING_ENABLED=false`.
- Activation reports explicitly state that write permission is not requested and provider permission introspection was not performed.

### Provider transport

- The private transport is server-only.
- The capability manifest contains only `GET`.
- Only the reviewed account-assets, single-asset, open-positions, risk-limit and tiered-fee endpoints are allowlisted.
- Parameters are endpoint-specific and bounded.
- Requests have bounded response size, timeout, no-store caching and redirect rejection.
- Provider failures are classified and redacted before they reach display models.

### Authorization and browser boundary

- DizyAccount, hypothetical preview, audit viewer and connection-control pages require an authenticated owner role.
- Private account pages are server-rendered and do not use client-held credentials.
- The only Account Companion POST route is the local shutdown action. It requires an authenticated owner, same-origin submission and an exact confirmation phrase; it cannot call MEXC.

### Freshness, reconciliation and preview

- Fresh, stale, unavailable and not-configured private states are explicit.
- Stale or failed private state cannot become decision-eligible.
- Reconciliation compares MEXC with DizyPaper without changing either account.
- Missing public marks remain explicit rather than being invented.
- The hypothetical preview is marked `executable: false`, `decisionEligible: false` and `exchangeWriteCapability: none`.
- Existing-position add, reduce and reversal cases are blocked instead of modelled ambiguously.

### Immutable shadow evidence

- Successful reconciliation and hypothetical-preview output must be appended before it is labelled fresh.
- Events are normalized, bounded NDJSON records linked by sequence, previous digest and SHA-256 digest.
- The complete chain is verified on read.
- Credential-like fields, authorization, headers and raw provider bodies are rejected.
- The owner browser receives bounded event summaries, not complete private payloads.
- Audit persistence failure blocks normal reconciliation/preview freshness. Emergency shutdown is the sole exception: the local seal remains effective even when its audit append fails.

### Shutdown and removal

- A persistent local seal is checked before credential activation, credential requirement and private transport.
- A missing seal defaults active; an unreadable, malformed or digest-invalid control record fails closed as sealed.
- The seal survives application restarts in the existing data root.
- Credential values are not written to the control record.
- Render credential presence is reported as booleans only.
- Browser reactivation is intentionally unavailable.
- The shared Account Companion layout displays a sealed-state banner across every companion page.

## Review finding remediated in this PR

### Sealed state was not globally prominent

Before this review, `/account/control` clearly displayed the local seal, while other Account Companion pages primarily appeared disabled/not-configured. The shared server-rendered Account Companion layout now displays an explicit sealed banner on every companion page without exposing credential metadata.

## Residual risks and limitations

These are accepted limitations of the read-only programme, not evidence for future live execution:

1. **Provider permission introspection is not available.** The software proves what it requests, and the operator provides a read-only attestation. MEXC remains the authority on the actual key permissions.
2. **CI does not prove a deployed authenticated provider response.** Deterministic tests prove request construction, normalization and failure behaviour. The owner must still observe the deployed DizyAccount state after each key, IP-whitelist or provider-policy change.
3. **The shadow ledger is tamper-evident, not externally anchored.** A privileged disk administrator who rewrites the complete ledger and application state is outside this local hash-chain threat model.
4. **Persistence assumes the current single-service data-root model.** Multi-instance deployment would require shared, transactional control and audit storage before private reads could be considered coherent.
5. **Server environment variables remain present in process memory while configured.** This is accepted only for the owner read-only companion. It is not acceptable credential custody for guarded live execution.
6. **The local seal does not revoke the provider key.** Suspected key disclosure requires MEXC-side revocation plus Render-variable removal.
7. **Hypothetical liquidation and exposure remain approximations.** They are informational and cannot be treated as a provider liquidation oracle or executable risk approval.

## Rejection triggers

The review decision becomes invalid if any of the following occurs without a new independent review:

- a private endpoint or HTTP method is added;
- any order, cancel, leverage, margin, transfer or withdrawal route is introduced;
- browser code receives a credential, signature or raw signed-request component;
- `LIVE_TRADING_ENABLED` is allowed to become true in this boundary;
- reconciliation or previews modify MEXC or DizyPaper state;
- audit persistence becomes optional for normal fresh output;
- the shutdown check moves after credential requirement or private transport;
- the application is scaled to multiple instances without shared connection-control and audit consistency.

## Evidence

The review is enforced by `tests/mexc-account-companion-independent-review.test.mjs` in addition to the focused activation, transport, account-state, reconciliation, preview, audit and shutdown tests introduced by the implementation PRs.

Operational shutdown instructions are recorded in [MEXC_OWNER_CONNECTION_SHUTDOWN.md](MEXC_OWNER_CONNECTION_SHUTDOWN.md). Credential activation is documented in [MEXC_OWNER_READONLY_CREDENTIAL_ACTIVATION.md](MEXC_OWNER_READONLY_CREDENTIAL_ACTIVATION.md).
