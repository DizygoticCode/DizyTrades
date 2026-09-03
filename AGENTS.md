# DizyTrades agent guide

## Product boundary

DizyCharts is the charting UI. DizySignals is the confirmed-candle analysis and
paper-test engine. This repository is a private TEST deployment.

## Non-negotiable safety rules

- Keep `LIVE_TRADING_ENABLED=false`.
- Do not add an exchange order route, credential form or MEXC private-key use
  without a separate security review and explicit owner approval.
- Never send exchange credentials to browser code, logs, commits or audit data.
- Signals must use closed candles. Entries are modelled on the following bar.
- Preserve per-user isolation for settings, paper snapshots and audit events.
- Validate all client-provided sizing and strategy values on the server.
- Keep TradingView Lightweight Charts attribution visible.

## Checks

Run `npm run lint`, `npm test` and `npm run build` before proposing a merge.

## Self-hosted deployment

Production is self-hosted. GitHub CI is the validation gate, not the deployment
target. Merge only after the exact PR head is green, then deploy that exact green
SHA to the server deliberately rather than pulling an unverified moving branch.

The application runs under `systemd` and is exposed through Caddy as the public
reverse proxy. Keep runtime secrets and host-specific service configuration out
of the repository, and preserve the disabled live/write trading defaults during
deployment and restart work.
