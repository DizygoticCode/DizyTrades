# Security

This repository contains a test terminal, not a live exchange executor.

- Never commit passwords, session secrets, API keys or `.env` files.
- Render credentials are supplied only through secret environment variables.
- Passwords are stored as salted scrypt hashes.
- Sessions use signed, HTTP-only, same-site cookies with a 12-hour lifetime.
- Per-user settings and paper snapshots are written under `DATA_DIR`.
- The health endpoint always reports `liveTradingEnabled: false`.
- The repository contains no MEXC private API client and no order route.

Before live trading is considered, add MFA, database-backed sessions, envelope
encryption, idempotency keys, exchange reconciliation, daily-loss limits,
symbol allowlists, immutable audit storage and a tested emergency kill switch.
