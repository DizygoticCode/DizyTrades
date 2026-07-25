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

## Render

`render.yaml` defines one paid Starter web service in Frankfurt with a 1 GB
encrypted persistent disk mounted at `/var/data`. JSON persistence is suitable
for this two-user test only; migrate to managed Postgres before adding a worker,
multiple instances or live execution.
