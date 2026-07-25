# Security

## Market-data boundary

DizyCharts calls only documented **public** MEXC contract directory and candle endpoints. TradingView Explorer uses the official branded read-only widget in isolation; it is not scraped, read from, injected with DizySignals or Pine Script, or used for simulations. TradingView attribution remains visible.

Viewer access uses the existing HMAC-signed, HTTP-only session cookie with a two-hour lifetime. Server routes reject viewer profile updates and paper snapshots, while profile reads return in-memory sanitised defaults without creating storage. Viewer UI state stays in `sessionStorage`.

There is no credential storage, private exchange API access, order submission/cancellation, or leverage modification. Live execution remains deliberately unavailable and `LIVE_TRADING_ENABLED` must remain `false`.

This repository contains a test terminal, not a live exchange executor.

- Never commit passwords, session secrets, API keys or `.env` files.
- Render credentials are supplied only through secret environment variables.
- Passwords are stored as salted scrypt hashes.
- Sessions use signed, HTTP-only, same-site cookies with a 12-hour lifetime.
- Per-user settings and paper snapshots are written under `DATA_DIR`.
- The health endpoint always reports `liveTradingEnabled: false`.
- The repository contains no MEXC private API client and no order route.

## Temporary plaintext-password test mode

Server-only plaintext environment passwords are a temporary test-only fallback.
They require the explicit `ALLOW_TEST_PLAINTEXT_PASSWORDS=true` flag and are
blocked when `LIVE_TRADING_ENABLED=true`. Use unique, throwaway passwords, never
commit or reuse them, and restore salted scrypt hash authentication before any
wider testing or live use.

Before live trading is considered, add MFA, database-backed sessions, envelope
encryption, idempotency keys, exchange reconciliation, daily-loss limits,
symbol allowlists, immutable audit storage and a tested emergency kill switch.
