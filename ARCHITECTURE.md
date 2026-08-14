# DizyTrades Architecture

This document describes the current boundaries between public market data, deterministic analysis, microstructure research, simulation, replay, review, analytics, authentication, operations and future exchange connectivity.

The enduring mission lives in [VISION.md](VISION.md). Delivery order lives in [ROADMAP.md](ROADMAP.md).

## System overview

```text
Public exchange and discovery providers
                ↓
Transport, validation and normalisation
                ↓
Typed live market state + bounded retained history
        ┌──────────┼──────────┬─────────────┐
        ↓          ↓          ↓             ↓
   DizyCharts   DizyFlow   DizyScanner  DizyStructure
        ↓          ├──────────────→ DizyQuant pure metrics
     DizySignals   │                        ↓
        ↓          │             Replay/statistical laboratory
     DizyBrain     │                        ↓
        ↓          │             retain / reject / promote later
      DizyPaper    │
        ↓          └──────────────→ bounded /research registry
   DizyJournal
        ↓
    DizyReplay ← Historical Replay Memory
        ↓       ← Historical DizyFlow
 Guided Review + Historical DizyBrain Review
        ↓
 Behaviour aggregation + DizyPerformance
```

Authentication, email verification/recovery, personal profiles, workspaces, Paper accounts, Journals, retained evidence, backups and audit storage sit beside the public market-data path. They must not be mixed into provider transport.

DizyQuant is a parallel research path, not a shortcut into DizySignals. Its public page exposes definitions and status only; it does not load live values or raw order-book messages.

## Product surfaces

### Public

- marketing site
- view-only terminal launcher
- bounded read-only DizyQuant research registry
- DizyAcademy
- DizyDEX discovery
- sign-in and signup
- email verification, resend-verification and password-recovery pages
- loading, recovery and not-found states

### Protected research and workflow

- DizyCharts terminal
- DizySignals
- DizyBrain workspace
- DizyFlow and DOM
- DizyPaper
- DizyScanner
- DizyStructure
- DizyJournal and Guided Review
- DizyPerformance
- personal account profile
- owner-only DizyAccount Companion
- DizyOps
- DizyBackup

Viewer sessions may access selected read-only research surfaces but cannot write profile, Paper, Journal, workspace, backup or account data.

## Authentication and personal-account boundary

Public database accounts are stored in server-side SQLite. Passwords use versioned salted scrypt hashes. Successful login issues a random opaque session token while only its SHA-256 digest is retained in the database.

New public accounts require an email address and start unverified. Signup creates no authenticated session. Verification must complete before the account can log in or receive a database session.

Email-verification and password-reset tokens are random, hashed at rest, expiring and single-use. Their browser links carry the bearer token in the URL fragment; the client removes the fragment before calling the same-origin verification/reset API.

Password reset is available only to verified database accounts. Successful reset changes the password hash and revokes existing database sessions. Forgot-password and resend-verification requests remain enumeration-safe and rate-limited.

The account profile layer stores display name, bounded bio and optional PNG/JPEG/WebP avatar bytes in SQLite for database and legacy owner/admin identities. Profile mutation cannot change role or sign-in email.

Trusted legacy owner/admin environment credentials are one-time bootstrap inputs. Server initialization validates both identities as a unit and creates ordinary verified database rows with stable IDs `rob` and `friend`, roles `owner` and `admin`, and current versioned password hashes. A durable migration record prevents restart-time password replacement. Any ID/email/username/role collision aborts without elevation. Once present, these database identities are authoritative and suppress the legacy fallback, so password reset, MFA, opaque sessions and session revocation follow the normal database-account lifecycle. Operators remove the plaintext password variables manually only after production verification.

Production verification/recovery mail is a server-only TLS SMTP boundary configured by Render environment variables. The intended runtime values are declared in `render.yaml`; `SMTP_APP_PASSWORD` remains secret-only. Existing Render services may require newly introduced variables to be added explicitly before restart/redeploy.

## External data boundary

Transport responsibilities:

- REST, WebSocket and SSE connectivity
- official symbol and contract metadata
- candles, ticker prices, depth and public trades
- timeout, retry and recovery handling
- sequence, duplicate and stale protection

Transport code must not contain user-interface assumptions, strategy rules, Paper accounting or research-promotion decisions.

Every external value is validated before entering shared state:

- finite numeric conversion
- market and symbol identity normalisation
- timeframe mapping
- sorting and deduplication
- stale, delayed, fallback and unavailable classification
- bounded collections and retention

## Typed market-state distinctions

The platform must keep these concepts separate:

- closed candles versus a forming candle
- Last price versus Fair/Mark price versus Index price
- selected display source versus authoritative risk source
- setup direction versus historical confirmed signal
- current resting depth versus executed Volume Profile
- current depth versus retained historical liquidity
- public trades versus resting orders
- live state versus replay state
- observed evidence versus trader reflection
- simulation assumptions versus exchange facts
- informational research versus experimental hypotheses versus validated signal evidence

Rendered DOM text must never substitute for typed application state.

## DizyCharts

DizyCharts renders price, structure, indicators and manual drawings.

Visual preferences may change colours, width, label size, visible overlays, display price, panel dimensions and layout. They must not silently change strategy inputs, historical qualification, Paper fills, liquidation marking, retained evidence or research validation status.

Complex chart primitives consume typed render models and bounded stores. High-frequency depth and trade updates must not rerender the whole React terminal.

## DizySignals

DizySignals is a deterministic confirmed-candle engine.

Responsibilities:

- trend, structure, volume and risk context
- stable historical signal markers
- prefix-invariant evidence where tested
- typed qualification and rejection reasons
- strategy and simulation inputs

DizySignals must not scrape rendered labels, consume TradingView widget state, treat current order-book imbalance as prediction or accept DizyQuant metrics without representative validation and a separately reviewed promotion change.

The repository contract keeps every current DizyQuant metric `signalEligible: false`, every research snapshot `decisionEligible: false`, and signal influence `forbidden` unless a future reviewed promotion explicitly changes that boundary.

## DizyBrain

DizyBrain is an explanation and review layer.

Live snapshots include current direction, bias, phase, separate long/short scores, active confluence, configured threshold, confirmed-signal provenance, risk context, checklist state and typed explanation metadata.

Historical review uses retained immutable evidence and a separate deterministic model. Behaviour aggregates completed historical reviews; it does not rerun trades, load Replay candle arrays or predict future performance.

## DizyFlow

DizyFlow owns public microstructure state beneath the candles:

- validated order-book snapshots and sequential updates
- current Market Depth histogram
- grouped virtualised DOM
- recent public trades and flashes
- educational visible queue estimates
- bounded retained liquidity history
- heatmap tiles and render data
- feed health and diagnostics
- typed DizyFlow Intelligence snapshots

Visible queue is approximate because hidden liquidity, venue priority, amendments, cancellations and latency are unavailable. A diagnostic proving retained data exists does not automatically prove every customer-facing visual rendered correctly.

## DizyQuant

DizyQuant is a versioned market-microstructure research boundary built from public depth, public trades and retained-liquidity evidence.

Current implementation:

1. immutable metric registry and evidence-quality contract;
2. snapshot-grade spread and visible-ladder measurements;
3. continuous-stream aggressive-flow and visible-depth-pressure measurements;
4. displayed-liquidity turnover, persistence and migration;
5. shock resilience, replenishment and two explicitly experimental depth-only candidate flags;
6. deterministic Replay/statistical laboratory plus a bounded read-only presentation model.

The registry contains stable informational/experimental identities and remains isolated from live decision, signal and execution eligibility unless a separately reviewed promotion changes those flags.

Evidence states are explicit:

- **fresh** — usable observation age with required continuity proven;
- **stale** — values exist but exceed the live age boundary;
- **gapped** — values exist but required continuity is absent or broken;
- **unavailable** — no finite metric value exists.

The Replay lab uses an ordered training prefix and held-out suffix, deterministic circular-rotation null comparisons and bounded expanding-prefix walk-forward checks. It may recommend retaining an experimental formula, rejecting its current form or recording insufficient evidence. Promotion always requires a separate reviewed change.

The public `/research` route consumes only the frozen presentation model. It displays metric identities, units, evidence grades, status, completed slices and safeguards. It exposes no live research values, raw depth, trade streams, account data or signal inputs.

Detailed formula and promotion rules live in [docs/DIZYQUANT_RESEARCH_CONTRACT.md](docs/DIZYQUANT_RESEARCH_CONTRACT.md).

## DizyScanner

DizyScanner reuses the existing market catalogue, confirmed-candle API and DizySignals settings.

Boundaries:

- bounded market universe and request concurrency
- same signal engine as the terminal
- no duplicate qualification model
- no probability-of-profit output
- market-only profile patches so stale tabs cannot overwrite unrelated settings
- viewer watchlists remain session-local

## DizyStructure

DizyStructure is descriptive closed-candle context.

It may derive:

- UTC day/week sessions
- exact opening ranges
- exact preceding daily/weekly levels
- anchored VWAP
- right-wing-confirmed swing pivots
- HH/LH and HL/LL state
- nearby level clusters
- available-feed-only timeframe alignment

Missing boundary candles, incomplete periods and unavailable feeds must remain unavailable. Structure labels do not identify institutional intent.

## DizyPaper

DizyPaper is isolated from live execution. Fidelity V2 is complete and remains an approximation rather than an exchange matching-engine claim.

Responsibilities:

- manual and signal-driven simulated orders
- margin, notional and quantity sizing
- isolated and cross-margin approximations
- leverage, fee, funding and slippage modelling
- depth-sensitive entries and exits with honest partial fills
- unrealised and realised P&L
- stop, target, maintenance-tier, liquidation and bankruptcy modelling
- reduce-only, reverse and flatten behaviour
- per-user account and fill history

Fair/Mark is the preferred risk source when available. A chart display selector must not alter the simulator's authoritative risk source. Existing fills and backups remain migration-safe.

## DizyAccount

DizyAccount is the owner-only private read boundary between DizyTrades and the current MEXC Futures account.

Its transport is server-side, typed and GET-only. Credentials are held in the Render environment, never the browser. Permission attestation and the software allowlist restrict the connection to read-only account/trade endpoints.

It may expose bounded balances, positions, account-health/risk context, DizyPaper shadow reconciliation, non-executable hypothetical order previews and persistent shadow-audit evidence. It has no live-order path and cannot silently broaden permissions in response to provider errors.

## DizyJournal

Journal entries retain immutable or versioned references rather than current mutable settings.

Trade Review references may include:

- trade lifecycle and outcome
- strategy/settings provenance
- Replay memory
- Historical DizyFlow summary/reference
- Historical DizyBrain review
- trader notes, tags, quality, discipline and mood

Guided Review inserts one bounded marked block into existing notes while preserving free-form text and refusing stale/unsaved overwrite.

## DizyReplay

Replay is a separate deterministic application state.

```text
Live transport state ───────→ Live terminal

Retained/derivable history ─→ Replay clock ─→ Replay projections
```

The replay clock controls the revealed closed-candle prefix. Signals and Brain explanations rebuild from that prefix. Playback, stepping and viewport following must not mutate live feed state or current Paper positions.

Historical DizyFlow may select only prior-or-exact retained samples within a strict age boundary. It must never interpolate, select a future sample or substitute current live flow.

DizyQuant study observations must likewise preserve exact time, symbol, metric identity, coverage and evidence status. Held-out outcomes must never alter a training-prefix model.

## DizyPerformance

DizyPerformance reads immutable completed Journal Trade Reviews.

It may calculate realised PnL, drawdown, expectancy, profit factor, payoff ratio, streaks, holding time, fees coverage, R distribution and deterministic breakdowns.

It must not fabricate account equity or percentages where starting balance is unknown. Missing fees/R remain missing and lower coverage.

## DizyOps

DizyOps exposes bounded owner/admin operational metadata:

- deployed build/runtime identity
- storage and retained-evidence status
- aggregate audit health
- application and provider health distinctions

It must not expose credentials, private user payloads or unbounded logs.

## DizyBackup

Backup export is owner-scoped and excludes authentication records, session tokens, account verification/reset tokens and secrets.

Restore requirements:

- strict schema and ownership validation
- bounded request size
- integrity hashing
- dry-run before application
- expected-hash match
- explicit confirmation
- conflict reporting
- additive recovery
- no silent replacement of existing/open Manual Paper state
- audit events for export, dry-run, apply and rejection

## Storage and identity

- SQLite-backed public account credentials and verification state
- hashed opaque database-session tokens
- hashed email-verification and password-reset tokens
- legacy owner/admin fallback sessions
- personal display-name/bio/avatar profiles
- isolated per-user profile settings
- saved chart workspaces
- Paper state and fills
- Journal files
- Replay memories
- Historical DizyFlow memories
- Historical DizyBrain reviews
- bounded guarded-execution state/idempotency records
- bounded audit records
- owner-scoped backups

Writes are atomic where file-backed and serialised where concurrent mutation could corrupt state. The supported production topology is one Render instance with persistent SQLite authentication/session/rate-limit and guarded-execution idempotency state, with vertical scaling first. Horizontal multi-instance operation is not currently planned and would require shared managed storage plus a separate shared authentication/rate-limit and execution-state design before use.

## Deployment configuration boundary

`render.yaml` is the repository declaration of the intended Render service, but it is not treated as proof that every newly added variable already exists on an older live service.

For verified signup and recovery, the live service requires `PUBLIC_SIGNUP_ENABLED=true`, the canonical HTTPS `APP_BASE_URL`, Gmail SMTP host/port/user/from settings and the secret-only `SMTP_APP_PASSWORD`. When those variables are introduced to an existing service they must be verified in the live Render environment and applied by restart/redeploy before production mail is considered configured.

Production behaviour, not the YAML file alone, is the final evidence boundary.

## Live-execution boundary

The current repository contains no enabled live-order path. `LIVE_TRADING_ENABLED=false` remains required.

The server-owned `ExecutionBoundary` also contains a narrow provider-mechanics
contract. Its single production implementation is `NonExecutingProvider`: it has
no network, signer, credential or custody dependency and returns only typed,
deterministic `would-accept`, `would-reject`, `would-timeout` or `would-unknown`
outcomes with synthetic provenance and `executed:false`. Authentication, kill
switches, structural validation, policy preview and duplicate detection precede
provider evaluation. This contract is design scaffolding, not exchange submission,
acknowledgement or reconciliation, and application code cannot inject a provider.

The first guarded-execution architecture slice adds a **server-only execution
airlock**. A validated, immutable futures intent passes through structural risk
validation, duplicate detection, typed kill switches and an execution service
boundary to the repository's sole adapter: a non-executing adapter that can only
return `blocked`. There is no execution API route, exchange payload, network
transport or production exchange write adapter. Setting the generic live flag
to any value cannot connect this airlock to MEXC; even the literal `true` value
fails closed as `adapter-unavailable`.

The second slice adds a deterministic server-owned, default-deny preview policy.
Fresh authoritative reference prices, fresh supplied account/position state,
allowed symbols, leverage/notional ceilings, contract volume normalization and
reduce-only exposure checks must all pass before the immutable estimate is
created. The estimate records contract volume, reference price, notional,
margin and policy version, but still ends at the same blocking adapter with
`executed: false`.

The third readiness slice puts that airlock behind a server-owned singleton,
`executionBoundary`, the sole application-facing server-side entry point. Its
narrow request carries an internal caller assertion, an explicit user/account
binding, an intent and the authoritative prerequisites. A server-owned verifier
must authenticate and bind the caller to that exact user/account before
validation. The boundary, rather than its caller, reads global, per-user and
per-account kill-switch state and passes only the resulting block reason into
the internal airlock. Authentication or dependency failure is isolated as a
rejected, preview-free, `executed: false` response. Its construction and
dependency-injection seam are internal, and source contracts forbid routes,
client modules, paper routes and other application modules from importing the
implementation modules directly.

The fourth readiness slice replaces process-local execution idempotency authority
with a dedicated server-only SQLite store at `DATA_DIR/execution-state.sqlite`.
Production composition owns the store. A unique `(userId, accountId,
idempotencyKey)` processing claim is committed transactionally before synthetic
provider mechanics can run. Bounded terminal `rejected`, `blocked` and synthetic
`prepared` results are schema-validated, secret-free and always `executed:false`.
A reconstructed service using the same database retains duplicate history;
provider exceptions and malformed synthetic outcomes stay duplicate-protected,
and an unfinished processing reservation after a crash blocks provider re-entry.
Malformed records, unsupported schema versions and database open/read/write
failures fail closed with no permissive in-memory fallback.

The fifth readiness slice adds a pure, server-only synthetic reconciliation
classifier. Test composition may separately supply one of three explicitly
synthetic observations; production composition supplies none. The classifier
distinguishes matched, conflicting, unresolved and recovered fixture outcomes,
always with synthetic provenance and `executed:false`. Its strictly validated,
bounded evidence may be nested in the existing synthetic provider result and
therefore survives reconstruction through the existing `provider_json` record.
It adds no provider readback, acknowledgement, identifiers, retry, signing,
credential wiring or network transport.

This is durable readiness state for the current supported **single Render
instance**. It is not a horizontally shared multi-instance execution service,
not exchange order submission and not acknowledgement/reconciliation. Execution
controls are stored separately at `DATA_DIR/execution-control.sqlite`. The
strict versioned singleton is initialized `armed:false` and
`globalDisabled:true`; atomic revision compare-and-swap updates survive restart.
Emergency stop precedes maintenance, global disable precedes user/account
disable, and explicit disarming and stale provider state independently fail
closed. A missing store can only create that safe initial state, while malformed,
corrupt, unsupported or unavailable state rejects the boundary dependency. No
environment variable is an arming authority. This is durable for the supported
single instance, not a horizontally shared control plane. Execution audit events are now stored in a
separate production-owned `DATA_DIR/execution-audit.sqlite` database with strict
canonical validation, restart-safe sequence ordering and a SHA-256 hash chain.
The API is append/read-verify only and audit availability and validity are
fail-closed prerequisites before synthetic mechanics. This is tamper-evident,
application-append-only single-instance persistence—not externally anchored WORM
or truly immutable storage—and the only adapter/provider remains non-executing with
no exchange transport. Therefore the guarded-execution roadmap gate remains open.

DizyAccount remains an independent owner-only, GET-only observation and shadow
reconciliation layer. DizyPaper and pending orders remain simulation-only. These
slices define architecture and preliminary structural checks, not live risk
approval or guarded-execution completion.

Future connectivity must preserve the already-completed read-only observation layer and introduce write capability only through a separate guarded execution architecture:

The next readiness slice installs a server-only authenticated internal caller
assertion authority. Only verified-email, active database sessions established by
TOTP MFA qualify; password-only, recovery-code, viewer and legacy signed sessions
do not. Assertions are short-lived, digest-only, identity-bound and atomically
single-use in `DATA_DIR/execution-caller.sqlite`, with originating-session
revocation rechecked on consume. No public execution or assertion-mint route
exists, and account ownership/risk authorization and activation remain future
gates. Production remains disarmed and globally disabled, and the only adapter is
non-executing with every result `executed:false`.

```text
User intent
   ↓
Order preview and validation
   ↓
Server-side account and risk limits
   ↓
Idempotent exchange adapter
   ↓
Acknowledgement and reconciliation
   ↓
Immutable audit record
```

Encrypted write-capable credentials, shared abuse controls for any horizontal deployment, loss limits, symbol/notional/leverage limits, reduce-only enforcement, stale-price/account-state rejection, emergency shutdown, provider-recovery rehearsal and independent security review are mandatory before execution. Database-account MFA and hardened opaque sessions are implemented; legacy signed owner/admin sessions remain ordinary-application compatibility only and cannot satisfy future guarded-execution MFA.

Future stages still require shared abuse/rate limiting for any horizontal
deployment; a separately approved execution authentication/activation path; real
idempotent order submission; exchange acknowledgement and deterministic
reconciliation; durable operational symbol, leverage, notional and daily-loss
limits; enforceable reduce-only behaviour; authoritative stale-state rejection;
operational global/per-user kill switches; an immutable execution audit trail;
provider rollback/restart rehearsal; restricted test-account rollout; and
independent security approval. Existing encrypted credential custody remains
disabled and disconnected until a separately reviewed future wiring decision.

## Pull-request rule

A feature PR should normally touch only the layers it needs. Changes crossing transport, strategy, simulation, replay, storage and interface boundaries must explain why, add contract tests and document what deliberately remains unchanged.

## Authoritative provider readback

The guarded-execution internals can obtain bounded MEXC USDT assets and open
positions through a server-only readback component. Its production transport
exports only named read operations, fixes the HTTP method to `GET`, and selects
paths from three constants. It reuses the owner Account Companion's exact
`account-read+trade-read;no-write/v1` environment seam; it does not copy or
persist credentials and has no public route or execution-adapter dependency.

MEXC does not supply an authoritative start-of-day equity baseline in these
reads. Translation therefore returns no risk snapshot rather than copying current
equity. A later reviewed reconciliation slice must establish that baseline before
the Risk Officer can accept this evidence.
# Credential-custody compartment

`app/lib/credential-custody` is a server-only, networkless compartment backed by `DATA_DIR/credential-custody.sqlite`. It owns versioned AES-256-GCM envelopes, ownership-bound AAD, metadata inspection, callback-scoped open, atomic rewrap, revocation, and secret-free lifecycle audit records. It has no import relationship in either direction with the execution airlock and no relationship with the separate MEXC read-only Account Companion.

`app/lib/credential-provisioning` is the narrow owner-only enrollment boundary above custody. A database-backed owner session, fresh password, and fresh TOTP mint a five-minute digest-only authorization for exactly one provision or revoke action. Submitted values pass directly to custody and cannot be read back; status is metadata-only. Both features remain disabled by default, perform no exchange request or credential verification, and have no dependency from execution. The separate Account Companion stays GET-only/read-only.

The custody open/decrypt operation is deliberately not exposed through a production route or UI. The disabled-by-default provisioning UI exposes only metadata and a browser-native direct-to-server enrollment submission; client JavaScript never handles credential values. `CREDENTIAL_CUSTODY_ENABLED` defaults to false. `CREDENTIAL_CUSTODY_KEYRING` is a bounded JSON object mapping numeric versions to dedicated base64/hex 32-byte keys; `CREDENTIAL_CUSTODY_ACTIVE_KEY_VERSION` selects the write/rewrap version. Missing historical versions fail closed.
# Default-deny execution risk officer

The server-only execution composition includes a separate `execution-risk.sqlite`
authority keyed by the exact user/account pair. Its empty state authorizes nobody;
its bounded, expiring policies only tighten global preview ceilings. After ordinary
intent validation and previewing, fresh account risk evidence and conservatively
valued gross exposure must pass before the synthetic provider fixture is reached.
Global kill switches retain precedence. This is a risk officer, not an execution
capability: there is no route, exchange write adapter, credential wiring, or policy
mutation endpoint, and all results remain `executed:false`.
# Authoritative execution reconciliation

The guarded execution airlock has a separate, server-only SQLite reconciliation
store scoped to the exact `(userId, accountId)` pair. Only validated, fresh MEXC
Radar GET-only readback may be compared with bounded execution-owned expected
contract volumes. Unknown state and unexplained divergence fail closed before
provider evaluation; quarantine is durable and sticky. This adds **no exchange-write
capability**: every execution result remains `executed:false`.
