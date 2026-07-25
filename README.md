# DizyTrades

## Public market views and safety

Native **DizyCharts** reads enabled perpetual-market metadata and closed OHLCV candles only from MEXC's documented public contract API. Its provider boundary is designed for additional public-data exchanges without coupling the analysis UI to an exchange implementation. **TradingView Explorer** is a separate, isolated official Advanced Chart widget: TradingView data and widget state are never consumed by DizySignals or paper simulations, and this application does not execute Pine Script.

Viewer sessions are signed, expire after two hours, and use browser `sessionStorage` for local market preferences. They cannot write profiles, paper snapshots, audit events, or user files. No exchange credentials, private exchange endpoints, order routes, or live-execution capability exist. `LIVE_TRADING_ENABLED=false` must remain unchanged.

Private test platform containing:

- **DizyCharts** — TradingView Lightweight Charts terminal and visual overlays
- **DizySignals** — confirmed-candle confluence and historical paper simulator

This repository is intentionally unable to place live exchange orders.

## Test features

- authenticated Dizygotic and Friend workspaces
- signed HTTP-only sessions and salted scrypt password hashes
- public MEXC BTC/USDT perpetual candle adapter with deterministic demo fallback
- 5m, 15m, 1h and 4h charts
- full-width labelled support/resistance and Fibonacci levels
- rolling VWAP, trend MA, regression channels and pivot trendlines
- shaded bullish/bearish triangles and right-aligned volume profile
- Elliott-lite, Wyckoff and confirmed BUY/SELL labels
- persisted per-user visual, strategy and risk settings
- confirmed-signal historical paper runs with ATR stop, TP1, break-even and TP2
- JSONL audit events and saved paper snapshots
- health endpoint that reports live trading as disabled

## Local setup

Requires Node.js 22 or newer.

```bash
npm ci
cp .env.example .env.local
npm run hash-password -- "choose a long local password"
```

Place the generated `salt:hash` value in `ROB_PASSWORD_HASH` or
`FRIEND_PASSWORD_HASH`, set the matching email, and replace `SESSION_SECRET`
with at least 32 random characters.

> **Temporary test-only plaintext login:** If hash authentication is temporarily
> unavailable, server-only `ROB_PASSWORD` and `FRIEND_PASSWORD` environment
> values can be enabled explicitly with
> `ALLOW_TEST_PLAINTEXT_PASSWORDS=true`. This mode is blocked whenever
> `LIVE_TRADING_ENABLED=true`. Use unique, throwaway passwords only, never commit
> them, and restore hashed authentication before any wider testing or live use.

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm test
npm run build
```

GitHub Actions runs the same checks on pushes and pull requests.

## Render test deployment

The included `render.yaml` creates:

- one paid Starter Node web service in Frankfurt;
- one 1 GB persistent disk mounted at `/var/data`;
- automatic deploys from `main`;
- `/api/health` monitoring;
- a generated session secret;
- prompted secret values for both users' emails, password hashes and temporary
  test-only plaintext passwords, with plaintext authentication disabled by
  default.

Create the service from **New → Blueprint** in Render after the private GitHub
repository is connected. Render prompts for every value marked `sync: false`.
Do not put those values in this repository.

The test service uses a disk-backed JSON store because it is intentionally
limited to one instance and two testers. A persistent disk can only attach to
one Render service instance, so managed Postgres is the required next storage
step before a separate worker or any scale-out.

## Live-trading boundary

`LIVE_TRADING_ENABLED=false` is part of the deployment configuration, the
health response always reports `liveTradingEnabled: false`, and there is no
exchange credential or order endpoint in the codebase.

Before any live milestone: add MFA, database-backed sessions, envelope-encrypted
exchange credentials, trade-only/IP-allowlisted keys, idempotency, symbol and
daily-loss caps, exchange reconciliation, durable TP1→BE→TP2 state, immutable
audit storage, an emergency kill switch and a shadow-mode soak test.

## Attribution

Chart rendering uses
[TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
and keeps TradingView attribution visible.

Render references:
[Blueprints](https://render.com/docs/blueprint-spec),
[persistent disks](https://render.com/docs/disks), and
[web services](https://render.com/docs/web-services).

## Real-time public market data

Native DizyCharts augments authoritative REST history with MEXC's public contract WebSocket (`wss://contract.mexc.com/edge`). It subscribes only to public kline and transaction channels and uses no API key, credentials, private API, or order route. The forming candle and interim last price are display-only: DizySignals and paper simulations receive closed candles exclusively, with entries still modelled on the following bar. If streaming is unavailable the UI clearly marks the feed delayed and retains/reconciles public REST history. Real-time market data is not live trade execution; `LIVE_TRADING_ENABLED=false` remains mandatory.
