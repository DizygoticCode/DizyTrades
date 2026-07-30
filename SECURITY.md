# Security

## Market-data boundary

DizyCharts calls only documented **public** MEXC contract directory and candle endpoints. TradingView Explorer uses the official branded read-only widget in isolation; it is not scraped, read from, injected with DizySignals or Pine Script, or used for simulations. TradingView attribution remains visible.

Viewer access uses the existing HMAC-signed, HTTP-only session cookie with a two-hour lifetime. Server routes reject viewer profile updates and paper snapshots, while profile reads return in-memory sanitised defaults without creating storage. Viewer UI state stays in `sessionStorage`.

There is no credential storage, private exchange API access, order submission/cancellation, or leverage modification. Live execution remains deliberately unavailable and `LIVE_TRADING_ENABLED` must remain `false`.

This repository contains a test terminal, not a live exchange executor.

- Never commit passwords, session secrets, API keys or `.env` files.
- Render credentials are supplied only through secret environment variables.
- Passwords are stored as versioned, salted scrypt hashes.
- Account sessions are opaque and revocable; viewer and legacy compatibility sessions remain signed. Cookies are HTTP-only, same-site and expire after at most 12 hours.
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

## Public WebSocket boundary

The real-time chart connection uses only MEXC's public `sub.kline` and `sub.deal` channels. It is browser-side, unauthenticated, restricted by CSP to `wss://contract.mexc.com`, and never receives or transmits an exchange key. A forming candle is display-only and cannot confirm a DizySignals signal or paper entry. WebSocket failure degrades visibly to delayed public REST candles. This does not enable live trading: `LIVE_TRADING_ENABLED=false`, private endpoints, credential collection, and order routes remain prohibited.

## Chart workspace boundary

Chart workspaces contain display configuration only. They are stored per user and
per chart key with atomic mode-`0600` writes; unsafe path components are rejected.
Viewer workspace reads are empty and viewer writes are forbidden. Server limits
are 250 drawings, 30 user indicators, 300 characters per note, and 750 KB per
workspace request. Audit events record only chart keys and object counts—not note
text or drawing content.

Workspace versions prevent confirmed stale-tab overwrites with HTTP 409. Chart
indicators remain display-only and cannot enter strategy, confluence, backtest,
risk, paper-trading, or live-execution paths.

## Account authentication

Public accounts use asynchronously derived, explicitly versioned scrypt password hashes. Login sessions use random opaque tokens whose SHA-256 digests are stored in SQLite; raw tokens and passwords must never be logged. Authentication requests are origin checked and rate limited by IP and normalized identifier. The SQLite database contains authentication data only—never exchange credentials—and public users always receive the `user` role.

Rob and Nick retain environment-backed emergency access behind `LEGACY_AUTH_FALLBACK_ENABLED`. Their stable IDs (`rob` and `friend`) preserve access to existing isolated settings and paper history. `LIVE_TRADING_ENABLED` must remain `false`.
