# DizyTrades Roadmap

DizyTrades is a transparent, deterministic crypto research, simulation and review platform. The enduring mission lives in [VISION.md](VISION.md); technical boundaries live in [ARCHITECTURE.md](ARCHITECTURE.md).

This roadmap reflects merged `main` as of **11 August 2026**. Items are not promises of dates. Work moves only after focused implementation, deterministic validation and review.

## Current roadmap order

The broad platform-building phase is largely complete. The active sequence is deliberately narrower:

1. **Apply optional evidence-led polish** only where production use exposes a real reason.
2. **Maintain the supported stack** with focused dependency, documentation and operational updates.
3. **Consider guarded execution readiness** only after every execution-security boundary is independently satisfied.

The first bounded DizyQuant representative campaign is closed for the current roadmap. DizyQuant remains research-only unless a separate versioned follow-up or promotion PR is justified by evidence.

No large feature programme is inserted between these stages merely because the platform can support one.

## 11 August 2026 checkpoint — baseline reset complete

The previous CI/maintenance backlog has been cleared.

- [x] repair the deterministic CI baseline against the current architecture
- [x] restore GitHub Actions as an active merge signal
- [x] require lint, complete deterministic tests, production build and Chromium/Playwright smoke before merge
- [x] fix the terminal Commands/Recent integration without reintroducing hydration mismatch
- [x] apply the focused Next.js 16.2.12 / `eslint-config-next` 16.2.12 security and patch update
- [x] keep React, Lightweight Charts, Playwright, Tailwind, TypeScript and Node type majors out of that focused security patch
- [x] repair persistent MEXC contract-metadata recovery for Manual Paper while keeping core contract rules strict
- [x] close superseded/stale dependency and token-page pull requests instead of carrying an artificial backlog
- [x] sync README and ROADMAP with the current platform state
- [x] require verified email before new public accounts can receive a session
- [x] add enumeration-safe resend-verification and password recovery for verified database accounts
- [x] add persistent personal profiles for database and legacy owner/admin identities
- [x] production-smoke the Render/Gmail verification and reset path without weakening production verification

GitHub Actions is no longer treated as silent or unavailable. The repository's ordinary merge gate is again authoritative.

## Current product generation — complete

### Platform and research terminal

- [x] public marketing site and real view-only terminal
- [x] account authentication and isolated user profiles
- [x] verified public signup and password recovery
- [x] personal profile editing with bounded avatar storage
- [x] DizyCharts multi-timeframe terminal
- [x] manual drawing and saved chart workspaces
- [x] shared route-aware product navigation across the Dizy family
- [x] unified MEXC Spot/Futures and DizyDEX discovery
- [x] DizySignals confirmed-candle confluence engine
- [x] DizyBrain typed explanation/review workspace
- [x] DizyFlow Market Depth, DOM, retained liquidity, heatmap and public trades
- [x] DizyQuant versioned microstructure registry, Replay lab and bounded `/research` page
- [x] owner-only read-only DizyAccount Companion
- [x] bounded DizyOps production diagnostics and explicit feed-health states

### Professional workflow

- [x] DizyPaper manual and signal simulations
- [x] DizyPaper Fidelity V2 execution, funding, margin and liquidation approximations
- [x] typed pending-order lifecycle for futures and spot simulation
- [x] futures limit/TIF/post-only, conditional, trailing, chase and protective-exit simulation
- [x] spot market/limit/TIF simulation with available/reserved accounting
- [x] DizyJournal immutable trade reviews, notes, tags and statistics
- [x] deterministic Replay Engine
- [x] retained Historical Replay Memory
- [x] Historical DizyFlow capture and replay
- [x] DizyBrain deterministic historical trade reviews
- [x] DizyBrain Behaviour aggregation
- [x] Guided Historical Trade Review
- [x] continuous replay playback and viewport following

### Discovery, research and analytics

- [x] saved watchlists and bounded DizyScanner
- [x] DizyStructure sessions, anchored VWAP, swings and timeframe alignment
- [x] DizyPerformance realised PnL, drawdown, expectancy and breakdowns
- [x] DizyAcademy current-product workflow curriculum with lesson-specific visuals
- [x] DizyQuant snapshot-grade and continuous-stream-grade formula layers
- [x] DizyQuant held-out, null-baseline and walk-forward laboratory
- [x] continuity-qualified representative-evidence campaign contract
- [x] first bounded representative campaign closed for the current roadmap without automatic signal promotion

### Reliability and operations

- [x] deterministic unit/integration contracts
- [x] active GitHub Actions merge gate
- [x] Playwright Chromium smoke coverage
- [x] protected DizyOps diagnostics workspace
- [x] full JSON backup export and Journal CSV
- [x] integrity validation, restore dry-run and additive recovery
- [x] cross-workspace profile and viewer-state hardening
- [x] read-only Render deployment observation and exact-commit health verification contracts
- [x] destructive application recovery rehearsal in isolated temporary data roots
- [x] authentication/storage, simulator-accounting, Replay, backup-conflict and browser-accessibility reviews

## Completed programmes

### 1. DizyPaper Fidelity V2

- [x] official contract metadata boundary per symbol
- [x] quantity and price-step enforcement
- [x] symbol-specific leverage and maintenance-margin limits
- [x] maker versus taker execution assumptions with explicit fee provenance
- [x] funding-payment modelling with explicit data provenance
- [x] depth-sensitive slippage and partial-fill modelling
- [x] reduce-only semantics
- [x] maintenance tiers and bankruptcy-price audit
- [x] clearer isolated versus cross-margin assumptions
- [x] migration-safe history and backup support
- [x] recovery from unusable optional public MEXC tier fields without erasing valid core leverage rules

The simulator is designed to be more realistic without claiming exchange-exact fills, queue priority or liquidation behaviour.

### 2. Workflow, navigation and accessibility polish

- [x] saved workspace layouts and presets
- [x] shared Dizy product navigation with one active destination model
- [x] terminal-specific second toolbar for chart/workspace actions
- [x] Commands and Recent quick actions with hydration-safe terminal integration
- [x] command palette and keyboard reference
- [x] recent markets, reviews and learning shortcuts
- [x] first-run onboarding
- [x] responsive and mobile audit
- [x] focus order, screen-reader and reduced-motion audit
- [x] empty, delayed and recovery-state polish
- [x] optional, visibly disclosed MEXC referral link without tracking or trading dependency

### 3. Independent correctness and security reviews

- [x] independent engineering review
- [x] authentication and storage threat review
- [x] simulator accounting audit
- [x] Replay future-leakage audit
- [x] backup restore and conflict audit
- [x] browser accessibility independent review
- [x] deployment observation and application recovery rehearsal

Evidence is recorded in:

- [docs/INDEPENDENT_ENGINEERING_REVIEW.md](docs/INDEPENDENT_ENGINEERING_REVIEW.md)
- [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md)
- [docs/SIMULATOR_ACCOUNTING_AUDIT.md](docs/SIMULATOR_ACCOUNTING_AUDIT.md)
- [docs/REPLAY_FUTURE_LEAKAGE_AUDIT.md](docs/REPLAY_FUTURE_LEAKAGE_AUDIT.md)
- [docs/BACKUP_RESTORE_CONFLICT_AUDIT.md](docs/BACKUP_RESTORE_CONFLICT_AUDIT.md)
- [docs/BROWSER_ACCESSIBILITY_INDEPENDENT_REVIEW.md](docs/BROWSER_ACCESSIBILITY_INDEPENDENT_REVIEW.md)

A destructive provider persistent-disk snapshot rollback remains intentionally deferred to the guarded-execution security milestone, when isolated infrastructure and cost can be justified.

### 4. DizyQuant research foundation — complete

The six focused implementation slices are complete:

- [x] source-quality contract, stable identities and Replay-safe snapshots
- [x] spread and visible-ladder state
- [x] public aggressive flow and visible-depth pressure
- [x] displayed-liquidity turnover, persistence and migration
- [x] shock resilience, replenishment and experimental candidate events
- [x] deterministic Replay/statistical laboratory and bounded public presentation

Current research boundary:

- [x] stable informational and experimental metric identities
- [x] no automatic decision eligibility
- [x] no automatic signal eligibility
- [x] repository firewall against unreviewed DizySignals influence
- [x] first bounded representative campaign closed for the current roadmap

DizyQuant is not declared "finished science". Its current programme is simply no longer an active roadmap blocker. Any follow-up hypothesis, revised formula or signal-influence proposal must be separate and versioned.

See [docs/DIZYQUANT_RESEARCH_CONTRACT.md](docs/DIZYQUANT_RESEARCH_CONTRACT.md), [docs/DIZYQUANT_CAMPAIGN_CLOSURE.md](docs/DIZYQUANT_CAMPAIGN_CLOSURE.md) and the bounded public `/research` page.

### 5. Read-only MEXC Account Companion and shadow reconciliation — complete

No order permission and no browser-held exchange credentials.

- [x] owner-scoped server-side read-only MEXC credential activation
- [x] executable proof that the software requests no write capability
- [x] live balance, position and account-health ingestion
- [x] stale/private-data failure handling on provider reads
- [x] provider risk context
- [x] MEXC ↔ DizyPaper shadow reconciliation
- [x] non-executable hypothetical order preview beside real account state
- [x] immutable persistent shadow audit log
- [x] owner-controlled credential removal and shutdown workflow
- [x] independent review of the complete read-only boundary

This programme did not create an order route and did not weaken `LIVE_TRADING_ENABLED=false`.

Closure evidence is recorded in:

- [docs/MEXC_OWNER_READONLY_CREDENTIAL_ACTIVATION.md](docs/MEXC_OWNER_READONLY_CREDENTIAL_ACTIVATION.md)
- [docs/MEXC_OWNER_CONNECTION_SHUTDOWN.md](docs/MEXC_OWNER_CONNECTION_SHUTDOWN.md)
- [docs/MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW.md](docs/MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW.md)

### 6. Advanced pending-order simulation and DizyAcademy — complete

- [x] shared typed immutable order lifecycle and deterministic replay
- [x] futures LIMIT, GTC, IOC, FOK and post-only simulation
- [x] trigger-market, trigger-limit and trailing-stop simulation
- [x] chase-limit repricing, protection distance and hedge-mode constraints
- [x] position-bound reduce-only TP/SL and limit TP/SL simulation
- [x] cancel, replace, expiry and partial-fill evidence
- [x] spot MARKET, LIMIT, LIMIT_MAKER, IOC and FOK simulation
- [x] separate spot base/quote available and reserved accounting
- [x] exact reservation, price-improvement, cancellation and replacement evidence
- [x] DizyAcademy pending-order and spot-accounting lessons
- [x] lesson-specific Academy diagrams and product screenshots
- [x] owner-only DizyOps removed from the ordinary-user Academy path
- [x] independent accounting, replay and live-routing-boundary audit

The programme remains simulation-only.

### 7. Liquidity heatmap presentation and DizyFlow evidence quality — complete for the current beta

- [x] retained-history tiles render through the real DizyFlow store
- [x] live depth transitions bridge from retained history to the current live-candle edge
- [x] live display coverage remains separate from historical archive coverage
- [x] sequence gaps clear synthetic live continuity instead of painting across missing evidence
- [x] unrelated DOM/trade updates cannot drag an already rendered heatmap edge backwards
- [x] initial/backfill catch-up may fill historical gaps without pretending those samples existed earlier
- [x] heatmap and trade-bubble defaults remain restrained so candles are readable
- [x] explicit live, delayed, stale, gapped and unavailable semantics remain part of the evidence model

Future heatmap work should be evidence-led polish or bug repair, not another standing foundation programme.

### 8. DIZY public token surface — complete for the current engineering scope

DIZY is a live Solana cryptoasset associated with the DizyTrades ecosystem.

- [x] canonical Solana mint identity published
- [x] fixed 1,000,000 DIZY supply documented
- [x] 9-decimal SPL identity documented
- [x] mint and freeze authorities revoked
- [x] official public `/dizy` page live
- [x] permanent public documentation/metadata references exposed through the official page
- [x] canonical Raydium DIZY/USDT market documented
- [x] token language kept separate from guarantees of return, exchange listing or live DizyTrades execution

External directory/listing review is administrative and does not block the product roadmap.

### 9. Verified account lifecycle and personal profiles — complete

The public account lifecycle now fails closed around email ownership without weakening production verification.

- [x] require email for public signup
- [x] block login/session creation until verification succeeds
- [x] send bounded TLS SMTP verification mail from the server
- [x] keep verification/reset bearer tokens hashed at rest, expiring and single-use
- [x] keep bearer tokens in URL fragments rather than request query strings
- [x] provide enumeration-safe resend-verification and forgot-password flows
- [x] revoke database sessions after successful password reset
- [x] persist personal display name, bounded bio and bounded avatar storage
- [x] keep role and sign-in email immutable from the personal profile API
- [x] migrate legacy owner/admin credentials once into verified database accounts with stable IDs, normal reset/MFA/session lifecycle and database-authoritative passwords
- [ ] manually remove privileged plaintext environment inputs after production identity and Nick reset verification
- [x] isolate Playwright from external SMTP without weakening the production contract
- [x] production-smoke signup → Gmail verification → verified login → terminal
- [x] production-smoke forgot password → Gmail reset → password change → session revocation

The live Render account-email environment contract is documented in [docs/RENDER_ACCOUNT_EMAIL_DEPLOYMENT.md](docs/RENDER_ACCOUNT_EMAIL_DEPLOYMENT.md).

## Optional evidence-led polish

### 10. Improve only what evidence or real production use justifies

This stage is intentionally conditional. It is not another feature-expansion programme.

Possible work includes:

- [ ] improve DizyQuant research presentation only where it makes results easier to audit
- [ ] remove or de-emphasise metrics that create noise without useful evidence
- [ ] refine Scanner, Structure, Replay, Performance or DizyFlow UX where real use exposes friction
- [ ] improve rendering/performance only where measurement shows a real bottleneck
- [ ] tighten explanations, unavailable states and evidence provenance where users can still misread them
- [ ] add focused visual or deterministic regression coverage for any production issue uncovered

Large institutional-style features remain parked unless evidence creates a concrete reason to build them.

## Ongoing maintenance — supported stack, not dependency churn

### 11. Keep the base current and reviewable

The emergency CI-recovery item is complete. Maintenance is now continuous rather than a one-off roadmap blocker.

Current base:

- Node.js 22.23.1
- Next.js 16.2.12
- React / React DOM 19.2.6
- TypeScript 5.9.3
- Lightweight Charts 5.0.x

Rules and remaining maintenance:

- [x] recover the GitHub Actions merge gate
- [x] apply the focused Next.js 16.2.12 security/patch update
- [x] re-audit README and ROADMAP after the CI/security cleanup
- [x] synchronize `SECURITY.md`, `ARCHITECTURE.md` and deployment documentation after the verified-account rollout
- [x] align signup-page availability with the backend's explicit `PUBLIC_SIGNUP_ENABLED=true` contract
- [x] document the existing-service Render environment/redeploy requirement for production account mail
- [ ] test useful supported dependency updates independently rather than as broad bundles
- [ ] review runtime/package engine alignment when Node support requirements change
- [ ] run focused dependency/browser regressions before every accepted framework/runtime update
- [ ] keep TypeScript major migrations and mismatched Node-major type upgrades separate unless dedicated migration work is justified

No dependency bundle is merged merely because Dependabot opened it.

## Final major programme — guarded execution readiness

### 12. Security architecture before any live order route

The completed DizyAccount read-only companion is a prerequisite and observation layer. It is **not** an execution approval.

An initial non-executing airlock defines server-only intent, structural validation,
duplicate detection, kill-switch and audit-event contracts. Its sole adapter
always blocks and has no exchange transport. This architecture slice does **not**
complete any live-execution requirement below: each item must still be made
operational, durable where required, exercised and independently approved before
an exchange write path is considered.

A second readiness slice exercises an in-memory, server-only deterministic risk
preview against a versioned default-deny policy and fresh supplied price,
account and position state. It remains non-routable and non-executing. The
requirements below remain unchecked because this slice is not operational
execution infrastructure and has not received independent security approval.

A third readiness slice isolates the in-process airlock behind one narrow typed
boundary. It authenticates and binds internal callers, owns kill-switch
enforcement and prevents application, client, route and paper-simulation imports
from bypassing the boundary. The boundary remains an in-process isolation rather
than a separately deployed service; kill-switch state is not durable/shared,
audit events are not immutable storage, and no independent operational or
security approval has occurred. It adds no exchange write capability.

A fourth readiness slice adds a dedicated server-only SQLite execution-state
store on the existing `DATA_DIR` persistent disk. It transactionally reserves
the existing user/account/idempotency-key scope before synthetic provider
mechanics, persists only bounded rejected/blocked/synthetic-prepared results with
`executed:false`, survives service reconstruction and fails closed on malformed
or unavailable storage. This completes the **single-instance durable execution
state / restart-safe idempotency readiness slice only**. It does not submit an
order, does not provide horizontally shared idempotency and does not complete
exchange acknowledgement, reconciliation or immutable execution audit.

A fifth persistence slice adds **durable append-only tamper-evident
single-instance execution audit persistence** in a separate SQLite file on the
existing disk. Strict canonical event validation, durable sequencing and a
SHA-256 chain detect modification across restart; audit open, verification and
append failures stop mechanics before synthetic provider evaluation. This is
application-append-only evidence on one persistent disk, not externally anchored
WORM or truly immutable storage, so the broader immutable-audit requirement
remains unchecked.

A sixth readiness slice replaces the static production shutdown state with a
separate production-owned `DATA_DIR/execution-control.sqlite` store. Its
versioned, bounded document starts disarmed and globally disabled, uses durable
atomic compare-and-swap updates, and independently enforces emergency,
maintenance, global, user, account, explicit arming and provider-freshness
brakes. Missing state is initialized fail-closed; corrupt, malformed,
unsupported or unavailable storage never falls back to environment state. This
completes the durable single-instance kill-switch/control prerequisite only. It
does not add an operator route, exchange adapter, authentication capability or
order transport.

Live execution remains disabled until every relevant requirement below is implemented, exercised and independently reviewed:

- [ ] isolated execution service or equivalently isolated execution boundary
- [x] encrypted future live-trading credential custody suitable for write-capable keys (disabled and disconnected; no execution wiring)
- [x] MFA and hardened database-backed sessions
- [ ] shared authentication and abuse rate limiting before any horizontal multi-instance deployment (current supported production is one Render instance with persistent SQLite state and vertical scaling first)
- [ ] server-side order preview and risk validation
- [ ] idempotent order submission
- [ ] exchange acknowledgement and deterministic reconciliation
- [ ] symbol, leverage, notional and daily-loss limits
- [ ] reduce-only enforcement
- [ ] stale-price and stale-account-state rejection
- [x] durable global, per-user and per-account kill switches (single-instance control store; no execution enablement)
- [ ] immutable execution audit trail
- [ ] controlled provider persistent-disk snapshot rollback and service-restart rehearsal
- [ ] restricted test-account rollout
- [ ] independent security approval

Only after those gates pass should an explicit decision be made about whether to enable any exchange write capability at all.

## Parked institutional-style analysis

These remain ideas, not active roadmap commitments:

- [ ] footprint data model and visualisation where public data genuinely supports it
- [ ] bid/ask delta and cumulative delta
- [ ] correlation and market-regime workspace
- [ ] portfolio concentration and cross-market risk
- [ ] visual strategy builder

They must not imply access to private matching-engine information, Level-4 order identity or hidden institutional intent.

## Product milestones

### Active Beta — achieved

Useful for public charting, market study, deterministic signals, public order-flow observation, bounded microstructure research, realistic simulation, replay, review, analytics, education and recovery while execution remains disabled.

### Operational Research Platform — achieved

DizyPaper Fidelity V2, shared workflow/navigation, DizyQuant's research foundation/current bounded campaign, DizyFlow heatmap presentation, deployment/recovery contracts, verified account lifecycle, CI baseline and focused independent reviews are complete for the current roadmap.

### Read-only Account Companion — achieved

The owner-only companion can ingest and label private account state, add provider risk context, reconcile it with DizyPaper, calculate non-executable previews, persist shadow evidence and fail closed through an owner-controlled shutdown. It remains strictly separate from guarded live execution.

### Verified Account Lifecycle — achieved

Public accounts require verified email before session creation and support self-service recovery with session revocation. Personal profile editing remains role/email-safe and separate from exchange connectivity.

### DIZY public launch surface — achieved

The live Solana token identity, fixed supply, revoked authorities, official DizyTrades token page and canonical public market references are published. External directory approval is not represented as an engineering milestone.

### Evidence-qualified DizyQuant promotion — conditional

A metric may be considered only after representative evidence and a separate promotion review. This milestone may validly remain unstarted indefinitely.

### Guarded Trading Platform — conditional future

Complete only after credential, risk, reconciliation, shutdown, provider-recovery and audit requirements pass independent review.

## Delivery and cost rules

- One focused concern per pull request.
- Work from current `main`.
- Run lint, the complete deterministic suite, production build and relevant Chromium checks before merge.
- Keep display preferences separate from strategy and risk logic.
- Preserve immutable trade, Replay and research evidence.
- Do not infer unavailable exchange, feed or account data.
- Prefer deterministic, explainable behaviour over black-box output.
- Research observations remain informational or experimental until separately validated and promoted.
- Live trading remains disabled until the final security milestone is complete.
- Prefer the existing Render service, GitHub workflows and free tooling.
- Do not create paid services, disks, databases, APIs or subscriptions without explicit owner approval.
# Guarded execution readiness

- [x] Add disabled, encrypted, server-only future credential custody with key versioning and atomic rewrap.
- [x] Add a disabled-by-default, owner-only fresh-password + fresh-TOTP provisioning and revocation ceremony with metadata-only status.
- [x] Complete the separately reviewed, strongly authenticated credential provisioning ceremony design.
- [x] Review and design non-executing provider mechanics behind `ExecutionBoundary`. The deterministic synthetic contract is complete; it is not wired to custody or provisioning and does not complete controlled activation or live execution.
- [x] Add durable single-instance execution-state persistence and restart-safe user/account/idempotency-key protection for the non-executing airlock. This is not real idempotent order submission and adds no exchange write capability.
- [x] Add durable append-only tamper-evident single-instance execution audit persistence. This does not claim external WORM/immutable storage and adds no exchange transport or credential wiring.
- [x] Add a deterministic synthetic lifecycle/reconciliation contract with bounded restart-safe evidence and `executed:false`. This is not exchange acknowledgement or readback reconciliation.
- [x] Add short-lived, single-use server-only internal caller assertions backed by TOTP-assured database sessions. No public mint/execution route exists; the separately completed exact-account ownership ceremony does not complete risk approval or restricted rollout, production stays disarmed/global-disabled, the adapter stays non-executing and real MEXC launch codes remain confiscated.
- [x] Install a durable, default-deny server-side account authorization and risk
  officer ahead of synthetic provider evaluation, while retaining the
  non-executing adapter and `executed:false` result contract.
- [x] Add bounded authoritative MEXC account/position readback through the existing
  owner read-only credential seam. The missing authoritative day-start equity is
  represented explicitly, so this slice does not yet satisfy daily-drawdown risk.
- [x] Complete the server-only credential-to-account ownership and activation
  ceremony. Proof requires a fresh GET-only Radar readback plus an independent,
  exact owner/account and credential-generation operator attestation; activation
  is a separate authenticated CAS transition and revocation is sticky. This adds
  no credential migration, public mutation route, exchange write, or execution
  capability, and production remains disarmed and globally disabled.

- [x] Add a durable restricted-rollout approval and arming gate for the single
  independently bound owner test account. Approval and arming are separate CAS
  transitions; disarm/revoke are sticky; bounded reduce-only policy, current
  ownership, risk authorization and reconciliation are rechecked. This is only
  pre-submission approval: the adapter remains non-executing, every outcome is
  `executed:false`, and actual exchange-write capability remains unapproved.
- [ ] Approve any exchange write capability (restricted rollout pre-submission
  approval is complete, but provider submission remains unapproved and absent).
# Guarded execution safety

- [x] Durable exact-account Radar reconciliation and sticky divergence quarantine
  ahead of provider evaluation (GET-only evidence, `executed:false`).
- [ ] Exchange-write capability remains explicitly out of scope and absent.
