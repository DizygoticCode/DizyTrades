<div align="center">

# DizyTrades

### Everything Dizy™

**A transparent, simulation-first crypto research, charting, execution-practice and review platform.**

[Open DizyTrades](https://dizytrades.onrender.com) · [View-only terminal](https://dizytrades.onrender.com/explore) · [DizyQuant Research](https://dizytrades.onrender.com/research) · [DizyAcademy](https://dizytrades.onrender.com/school) · [DIZY](https://dizytrades.onrender.com/dizy) · [Roadmap](ROADMAP.md)

![Next.js](https://img.shields.io/badge/Next.js-16.2.12-black?logo=next.js)
![React](https://img.shields.io/badge/React-19.2.6-149ECA?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-22.23.1-339933?logo=node.js)
![Status](https://img.shields.io/badge/status-active%20beta-7c6cff)
![CI](https://img.shields.io/badge/CI-lint%20%7C%20tests%20%7C%20build%20%7C%20Chromium-passing-2ea44f)
![Live trading](https://img.shields.io/badge/live%20trading-disabled-ff5c70)

</div>

> **Not financial advice. Not signal selling. Not black-box AI.**
>
> DizyTrades exposes evidence, assumptions, unavailable states and limitations. Live exchange execution remains disabled.

## Current state — 11 August 2026

DizyTrades has moved well beyond its original chart-and-strategy simulator into a connected research and review platform. Current `main` includes the charting terminal, deterministic signal engine, market-microstructure tooling, realistic paper execution, read-only account reconciliation, replay, journal, analytics, education, backup/recovery, personal profiles and verified public-account recovery.

The repository baseline has also been cleaned up:

- GitHub Actions is operational again.
- The normal merge gate is lint → complete deterministic suite → production build → Chromium/Playwright smoke.
- The CI baseline repair is merged.
- Next.js and `eslint-config-next` are on the focused 16.2.12 security/patch release.
- the persistent MEXC contract-metadata recovery path used by Manual Paper has been repaired and regression-tested.
- DIZY is live on Solana with an official public DizyTrades token page.
- public signup now requires email verification before session creation.
- verified database accounts have enumeration-safe self-service password recovery with session revocation after reset.
- authenticated owner/admin/user identities have a personal profile surface for display name, bounded bio and avatar.

The first bounded DizyQuant representative campaign is no longer treated as the active build programme. DizyQuant remains isolated from DizySignals unless a future separate promotion review explicitly changes that boundary. The near-term engineering queue is evidence-led polish where justified, supported-stack maintenance and then an explicit decision about guarded live-execution readiness.

## What DizyTrades is

```text
DizyScanner
    ↓
DizyStructure
    ↓
DizyCharts + DizySignals + DizyFlow
                   ├────────→ DizyQuant research
                   │               ↓
                   │      Replay / null / walk-forward review
                   │               ↓
                   │      retain, reject or promote separately
                   ↓
DizyPaper ←──────→ DizyAccount read-only shadow reconciliation
    ↓
DizyJournal
    ↓
DizyReplay + Historical DizyFlow
    ↓
Guided Review + DizyBrain Behaviour
    ↓
DizyPerformance
    ↓
Learn and repeat in DizyAcademy
```

The system is deliberately evidence-first. A setup score is not a profit probability, visible liquidity is not guaranteed to remain, an experimental research candidate is not a trade instruction, and simulated execution is not represented as exchange-exact.

## Product family

### DizyCharts

The main multi-timeframe terminal: MEXC spot/perpetual discovery, closed-candle history, public real-time updates, support/resistance, VWAP, moving averages, Volume Profile, Fibonacci, Elliott-lite, Wyckoff-lite, triangles, regression channels, manual drawing and saved layouts.

### DizySignals

Confirmed-candle confluence analysis with explicit qualification/rejection evidence, non-repainting historical behaviour, next-bar simulation entry modelling, ATR risk structure and deterministic prefix-invariance contracts.

### DizyBrain

An explanation and review workspace rather than a prediction engine. It presents current bias, phase, long/short evidence, confirmed-signal provenance and deterministic historical reviews with recurring behaviour observations.

### DizyFlow

Public market-microstructure context beneath the candles: Market Depth, a virtualised DOM ladder, grouped bids/asks, public trade flashes, retained-liquidity heatmap history and explicit live/delayed/stale/gapped/unavailable states.

### DizyQuant

A versioned public-market microstructure research layer kept deliberately parallel to DizySignals. The registry contains stable informational and experimental metric identities with no automatic signal influence.

It includes snapshot-grade spread/depth/imbalance measurements, public aggressor flow, visible-depth pressure, displayed-liquidity turnover/persistence/migration, shock recovery/replenishment measures and a deterministic held-out/null/walk-forward Replay laboratory.

### DizyAccount and personal profiles

DizyAccount is the owner-only, server-side, GET-only MEXC Futures account companion. It can ingest balances, positions and provider risk state, then perform deterministic shadow reconciliation against DizyPaper without changing either account. It has no order route and no browser-held exchange credentials.

Separately, authenticated non-viewer identities have a personal DizyTrades profile for display name, bounded bio and avatar. Profile mutation cannot change role or sign-in email. Legacy owner/admin credentials remain managed in the Render environment boundary.

### DizyScanner

Saved watchlists and bounded multi-symbol analysis using the same DizySignals engine as the terminal, with filtering, sorting and direct chart handoff.

### DizyStructure

Closed-candle market structure: UTC sessions/opening ranges, previous-day/week levels, anchored VWAP, confirmed HH/LH and HL/LL state, multi-timeframe alignment and deterministic nearby-level clustering.

### DizyPaper

Manual and signal-driven simulation without real funds. Fidelity V2 covers symbol-specific contract rules, leverage, price/volume precision, fees, funding, depth-sensitive slippage, partial fills, maintenance tiers, liquidation/bankruptcy evidence, isolated/cross approximations and migration-safe history.

The advanced order simulator adds futures LIMIT/GTC/IOC/FOK/post-only, trigger, trailing and chase behaviour, reduce-only protective exits, plus spot MARKET/LIMIT/LIMIT_MAKER/IOC/FOK with available/reserved accounting.

### DizyJournal, DizyReplay and DizyPerformance

DizyJournal stores immutable completed-trade facts with review notes/tags. DizyReplay rebuilds historical state from revealed candle prefixes without leaking future data. DizyPerformance turns completed Journal trades into realised PnL, drawdown, expectancy, profit factor, payoff ratio, R distributions and breakdowns.

### DizyAcademy

Public education from trading/risk foundations through chart structure, indicators, DOM/order flow, heatmaps, Scanner, Structure, Replay, review, performance and simulator-accounting workflows.

### DizyDEX

Unified public-provider on-chain market discovery with chain/pool/liquidity context and stable contract/pool identities.

### DizyOps and DizyBackup

Owner/admin diagnostics expose deployed runtime identity, storage/evidence status and operational health. DizyBackup provides integrity-hashed JSON export, Journal CSV, restore dry-run, additive recovery and isolated destructive application-restore rehearsal.

## DIZY

**DIZY** is the Solana utility token associated with the DizyTrades ecosystem. It is separate from the platform's execution-safety boundary: owning or trading DIZY does not enable live exchange execution inside DizyTrades.

- **Mint:** `J9Bevbd4BS23cjoWbKazG1LGwRsAhr2iRQq6uo31BEaY`
- **Network:** Solana
- **Decimals:** 9
- **Fixed supply:** 1,000,000 DIZY
- **Mint authority:** revoked
- **Freeze authority:** revoked
- **Official page:** https://dizytrades.onrender.com/dizy
- **Canonical Raydium DIZY/USDT CPMM pool:** `2mH8umwN2FfEx23bzTUuTXjQZ5G9rLNuJ2VWEkgynowA`

The official DIZY page contains the canonical token identity, documentation, explorer and market references. External token-directory/listing reviews are operational/admin work and are not a prerequisite for continuing DizyTrades product development.

## DizyQuant research status

The six-slice DizyQuant implementation foundation and the first bounded representative-evidence programme are treated as closed for the current roadmap. Current DizyQuant formulas remain research-only unless a separate versioned follow-up or promotion review is opened.

No DizyQuant result is silently promoted into DizySignals, decision logic or execution. A future signal-influence proposal still requires representative evidence, an explicit promotion PR and independent review.

See [docs/DIZYQUANT_RESEARCH_CONTRACT.md](docs/DIZYQUANT_RESEARCH_CONTRACT.md) and [docs/DIZYQUANT_CAMPAIGN_CLOSURE.md](docs/DIZYQUANT_CAMPAIGN_CLOSURE.md).

## Account security and recovery

Public signup requires an explicit `PUBLIC_SIGNUP_ENABLED=true` deployment flag and a valid account-mail configuration. New accounts require an email address and remain blocked from authenticated sessions until verification succeeds.

Verification and password-reset tokens are random, hashed at rest, expiring and single-use. Recovery responses are enumeration-safe. A successful password reset revokes existing database sessions.

Production account mail is server-side only. Gmail SMTP credentials never enter browser state, and the Gmail App Password must remain only in the protected Render environment boundary.

See [SECURITY.md](SECURITY.md) and [docs/RENDER_ACCOUNT_EMAIL_DEPLOYMENT.md](docs/RENDER_ACCOUNT_EMAIL_DEPLOYMENT.md).

## Safety boundaries

The repository currently contains:

- no browser exchange API-key form or browser-held exchange credentials
- an owner-only server-side GET-only private MEXC Account Companion
- no write-capable private exchange trading endpoint
- no live order-placement route
- no enabled execution capability
- no automatic DizyQuant influence on DizySignals
- verified public-account signup and recovery isolated from exchange execution

`LIVE_TRADING_ENABLED=false` remains a required deployment boundary. The read-only MEXC connection proves only the Account Companion observation boundary. Any future write-capable execution path requires separate credential custody, risk validation, idempotency, reconciliation, account limits, kill switches, recovery rehearsal and independent security approval.

See [SECURITY.md](SECURITY.md), [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md), [docs/MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW.md](docs/MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW.md) and [docs/SIMULATOR_ACCOUNTING_AUDIT.md](docs/SIMULATOR_ACCOUNTING_AUDIT.md).

## CI and release gate

GitHub-hosted Actions is active. The ordinary repository gate is:

```bash
npm ci
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

The browser smoke job runs with the repository's CI/test environment, including `CI=true`, a dedicated test session secret and an isolated mail boundary. Browser tests do not weaken production email verification.

Dependency upgrades are intentionally focused. The project does not merge broad Dependabot bundles simply because they exist.

## Local development

### Requirements

- Node.js 22.23.1 (repository engine)
- npm

### Setup

```bash
npm ci
cp .env.example .env.local
npm run hash-password -- "choose a long local password"
npm run dev
```

Open `http://localhost:3000`.

Place generated `salt:hash` values in the matching password-hash environment variables and set `SESSION_SECRET` to at least 32 random characters. Public signup and legacy emergency access must each be explicitly enabled. Temporary plaintext test passwords require `ALLOW_TEST_PLAINTEXT_PASSWORDS=true` and are blocked whenever live trading is enabled.

If local public signup is enabled, configure the account-mail variables from `.env.example` with a safe local/test mail boundary. Do not place the production Gmail App Password in committed files or test fixtures.

## Deployment and recovery

The beta is deployed on Render as a Node service with persistent application storage, automatic deploys from `main` and `/api/health` monitoring.

The intended production account-email environment is declared in `render.yaml`, but an existing Render service must be checked explicitly when new variables are introduced. The live service requires:

```text
PUBLIC_SIGNUP_ENABLED=true
APP_BASE_URL=https://dizytrades.onrender.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=dizytrades@gmail.com
SMTP_APP_PASSWORD=<Render secret only>
MAIL_FROM=DizyTrades <dizytrades@gmail.com>
```

After adding or changing those values, save them and restart/redeploy the reviewed commit so the running process receives the new environment. A repository declaration alone is not treated as production proof. Full details and the smoke-test contract live in [docs/RENDER_ACCOUNT_EMAIL_DEPLOYMENT.md](docs/RENDER_ACCOUNT_EMAIL_DEPLOYMENT.md).

The deployment-observation contract is read-only: it resolves the configured DizyTrades service, waits for the expected commit and verifies the public simulation-only health boundary without changing Render.

The isolated recovery rehearsal uses the real backup engine to export, validate, dry-run and restore representative user data into fresh temporary data roots. A persistent disk is not itself a backup; dated DizyBackup exports should be kept outside the provider.

Provider snapshot rollback remains deliberately deferred until guarded-execution security work justifies a destructive infrastructure rehearsal.

## Important limitations

**Elliott-lite** and **Wyckoff-lite** are visual heuristics, not guaranteed textbook classifications, and neither silently contributes to DizySignals.

Visible DOM depth can be cancelled, changed or hidden. Queue-ahead is an educational estimate. Public trade classification and provider coverage are imperfect. Historical DizyFlow exists only where evidence was genuinely retained. Paper fills and liquidations are simulator estimates and do not guarantee exchange-equivalent results.

DizyAccount reflects the owner's read-only MEXC provider state when fresh. DizyPaper reconciliation is observational rather than corrective.

DizyQuant uses aggregated public price-level data. It does not know individual order identity, trader identity, true queue position, hidden liquidity or institutional intent. Experimental research rules are not diagnoses or trading calls.

Public database accounts have verification, self-service recovery and optional TOTP MFA with one-time recovery codes. MFA secrets are encrypted under a dedicated deployment key. Legacy owner/admin compatibility remains available for the ordinary application but does not satisfy future guarded-execution MFA.

## Key documents

- [ROADMAP.md](ROADMAP.md) — active sequence and completed programmes
- [VISION.md](VISION.md) — enduring project direction
- [ARCHITECTURE.md](ARCHITECTURE.md) — technical boundaries
- [SECURITY.md](SECURITY.md) — security posture
- [PRINCIPLES.md](PRINCIPLES.md) — engineering/product principles
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — release history
- [docs/DIZYQUANT_RESEARCH_CONTRACT.md](docs/DIZYQUANT_RESEARCH_CONTRACT.md) — DizyQuant evidence contract
- [docs/RENDER_ACCOUNT_EMAIL_DEPLOYMENT.md](docs/RENDER_ACCOUNT_EMAIL_DEPLOYMENT.md) — production signup/recovery mail configuration

## Contributing

1. Create one focused branch from current `main`.
2. Keep display preferences separate from trading/risk logic.
3. Add deterministic tests for changed boundaries.
4. Run lint, the complete test suite, production build and relevant Chromium checks.
5. Explain user-facing effects, unavailable states and safety implications.
6. Open a focused pull request against `main`.

## Attribution

Chart rendering uses [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) with visible attribution. The separate TradingView Advanced Chart is an isolated official widget.

The drawing system, DizySignals engine, DizyBrain review tools, DizyFlow processing, DizyQuant research system, DizyAccount read-only companion, simulators, Replay, Journal, Academy and application interface are original DizyTrades work.

## Disclaimer

DizyTrades provides market research, education and simulation tools. Cryptocurrency markets are volatile, simulated performance does not guarantee future results, and every trading decision remains the responsibility of the user.

DIZY is a separate cryptoasset associated with the DizyTrades ecosystem. Nothing in this repository or the DIZY page is a promise of price, return, exchange listing or investment performance.

---

<div align="center">

**DizyTrades · Everything Dizy™**

Understand the market. Understand the signal. Understand the decision.

</div>
