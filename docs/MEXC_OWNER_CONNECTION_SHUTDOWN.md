# Owner MEXC Account Companion shutdown and credential removal

This runbook covers the read-only MEXC Account Companion only. It does not place, cancel, modify or close exchange orders.

## Two separate states

### 1. Local emergency seal

The authenticated owner opens `/account/control`, enters the exact confirmation phrase shown by the page and submits the shutdown form.

The application then:

1. atomically writes a persistent sealed control record under the existing `DATA_DIR`;
2. blocks Account Companion private reads before credential activation and before provider transport;
3. appends a normalized `connection-control` event to the immutable shadow audit ledger when audit persistence is available;
4. continues to keep public charts and DizyPaper independent of the private connection.

A missing control file means active. A malformed, unreadable or digest-invalid control file fails closed as sealed.

The local seal deliberately has no browser reactivation action. Reactivation requires a separately reviewed operator change rather than a second emergency button.

## 2. Physical Render credential removal

The local seal cannot delete Render environment variables. After sealing, remove the following server configuration from the Render service:

- `OWNER_MEXC_READONLY_API_KEY`
- `OWNER_MEXC_READONLY_API_SECRET`
- `OWNER_MEXC_READONLY_PERMISSION_ATTESTATION`

Set:

```text
OWNER_MEXC_ACCOUNT_COMPANION_ENABLED=false
LIVE_TRADING_ENABLED=false
```

Redeploy the service and revisit `/account/control`.

Credential removal is confirmed only when no private key, secret or permission attestation is present and Account Companion enablement is false or unset. The page reports presence as booleans and never returns the values.

## Provider-side revocation

For suspected key disclosure, also revoke or delete the API key in the MEXC account interface. The DizyTrades local seal and Render-variable removal do not revoke a provider-side key by themselves.

## Failure behaviour

- A local control integrity/read failure blocks private reads.
- A private-read shutdown remains sealed even if immutable audit persistence fails.
- Stale private snapshots are not retained as active after local shutdown; the companion returns an explicit inactive/not-configured state.
- The shutdown route requires an authenticated owner session, an exact confirmation phrase and a same-origin POST.
- No exchange private-write or DizyPaper mutation function is reachable from the shutdown workflow.

## Stored data

The control record contains only:

- schema version;
- sealed state;
- generation;
- timestamp;
- fixed shutdown reason;
- SHA-256 integrity digest.

It does not contain API keys, secrets, permission attestations, signatures, headers or provider response bodies.
