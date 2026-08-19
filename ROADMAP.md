# DizyTrades Roadmap

DizyTrades is a transparent, deterministic crypto research, simulation and review platform. The enduring mission lives in [VISION.md](VISION.md); technical boundaries live in [ARCHITECTURE.md](ARCHITECTURE.md).

This roadmap reflects merged `main` as of **19 August 2026**. Items are not promises of dates. Work moves only after focused implementation, deterministic validation and review.

## Current roadmap order

The broad platform-building phase is complete for the current planned scope. There is no standing feature programme waiting behind the current release. The active sequence is deliberately narrower:

1. **Keep the current Render-hosted product stable** while Server Club hardware is completed; do not create temporary exchange-write authority merely to bridge the wait.
2. **Complete the guarded-execution operational migration** only on the intended Server Club host: controlled state migration, restart/rollback rehearsal, fresh exact-host `/32` evidence, fresh write-generation attestation and an independently approved microscopic canary.
3. **Apply optional evidence-led polish and supported-stack maintenance** only where production use or a focused dependency/security reason justifies it.

The first bounded DizyQuant representative campaign is closed for the current roadmap. DizyQuant remains research-only unless a separate versioned follow-up or promotion PR is justified by evidence.

No large feature programme is inserted between these stages merely because the platform can support one.

## 19 August 2026 checkpoint — planned product build complete

The current product-generation programme is complete and live on Render.

- [x] provider-neutral static execution-host authority merged in #344 without activating exchange writes
- [x] provider-neutral chart-market boundary and authenticated Global Search merged through #347/#348
- [x] Global Search remains chart/search-only and cannot acquire order-book, executed-trade or execution capability
- [x] privileged plaintext production account-password environment inputs removed after Rob and Nick completed the database-authoritative reset path
- [x] stale `ALLOW_TEST_PLAINTEXT_PASSWORDS=false` production Render configuration removed; explicitly gated local/test compatibility remains a repository-only development boundary
- [x] production guarded-execution activation remains off and no real order has been submitted

The remaining guarded-execution work is operational Server Club migration, fresh host/credential evidence and the microscopic canary ceremony described below—not another product feature build.

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
- [x] unified MEXC Spot/Futures, authenticated Global Search charting and DizyDEX discovery
- [x] provider-neutral global chart/search boundary with no executed-trade, order-book or execution capability
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
- [x] manually remove privileged plaintext environment inputs after production identity and Nick reset verification
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

### 12. 19 August 2026 checkpoint — guarded execution software boundary complete, activation still off

The guarded-execution programme has moved beyond the historical #320/#322 dormant-writer checkpoint. The production code now contains the reviewed write path, but deployment activation remains deliberately false and no real order has been sent.

Completed security slices:

- [x] durable execution state, tamper-evident audit, durable controls, authenticated caller assertions, exact-account ownership, authoritative GET-only reconciliation, day-start/risk authority and restricted rollout
- [x] modern MEXC reduce-only limit writer with durable lifecycle claim, stable `externalOid`, bounded signing/transport and GET-only ambiguous-delivery reconciliation
- [x] #329 durable exact-account/write-generation credential authority with permission and egress attestations, CAS revisions and sticky revocation
- [x] #330/#332 exact single-public-IPv4 `/32` egress authority with two independent observations, freshness, owner password and fresh replay-resistant TOTP
- [x] #331 encrypted dedicated write-credential custody, exact fingerprint binding and generation burn on failed attestation
- [x] #333 owner-only production egress rehearsal surface and the subsequent public-origin/MFA-return hardening required by the live rehearsal
- [x] #339 owner-only dedicated write-key provisioning ceremony ending at `attested`
- [x] #340 separate owner-only activation ceremony promoting only the exact sealed/attested generation to `active`
- [x] #341 production composition connection to the existing `ModernMexcReduceOnlyWriter`, with credential lease and final mutable-authority re-read immediately before transport
- [x] #342 durable microscopic canary permit: exact-intent-bound, short-lived, single-use, reduce-only LIMIT, exactly 1x and at most 25 USDT notional before a production lifecycle can enter `submitting`
- [x] #344 provider-neutral static execution-host egress authority preserving exact approved `{provider, hostId, /32}` matching without inheriting another provider's durable egress proof

Current production posture:

- [x] `LIVE_TRADING_ENABLED=false` remains the committed/default deployment posture
- [x] `MEXC_WRITE_PROVIDER_ENABLED=false` remains the committed/default deployment posture
- [x] no browser/public general execution route exists
- [x] Account Companion read credentials remain independent and GET-only
- [x] no real MEXC order has been submitted by the guarded-execution programme
- [x] ambiguous-delivery recovery remains GET-only and cannot authorize a second POST

Current operational blocker and migration boundary:

- [x] replace the Render-specific execution-host identity assumption with an equivalently strict provider-neutral approved-host + exact static `/32` authority before moving execution to Server Club
- [ ] complete a controlled persistent-state migration, integrity and rollback/restart rehearsal before changing the production execution host
- [ ] restore trusted private MEXC account state on the migrated Server Club host; do not re-authorize temporary Render egress solely to bridge the wait
- [ ] verify the Server Club host's static public IPv4 from independent observers and bind fresh egress evidence to that exact `/32`
- [ ] reprovision/re-attest the dedicated write generation against the migrated host rather than silently inheriting stale Render egress authority
- [ ] perform an independently approved microscopic reduce-only canary only after trusted account state, reconciliation, risk, rollout, egress, custody and every kill-switch/activation gate are fresh on the migrated host
- [ ] make a separate explicit decision about broader production exchange-write activation only after the canary is reconciled and reviewed

Shared authentication/rate limiting remains a prerequisite only if the supported topology later becomes horizontally multi-instance. The current security design remains single-instance with durable local SQLite authority and fail-closed restart semantics.

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

Useful for public MEXC and provider-neutral global charting, market study, deterministic signals, public order-flow observation, bounded microstructure research, realistic simulation, replay, review, analytics, education and recovery while execution remains disabled.

### Operational Research Platform — achieved

DizyPaper Fidelity V2, shared workflow/navigation, provider-neutral Global Search, DizyQuant's research foundation/current bounded campaign, DizyFlow heatmap presentation, deployment/recovery contracts, verified account lifecycle, CI baseline and focused independent reviews are complete for the current roadmap.

### Read-only Account Companion — achieved

The owner-only companion can ingest and label private account state, add provider risk context, reconcile it with DizyPaper, calculate non-executable previews, persist shadow evidence and fail closed through an owner-controlled shutdown. It remains strictly separate from guarded live execution.

### Verified Account Lifecycle — achieved

Public accounts require verified email before session creation and support self-service recovery with session revocation. Personal profile editing remains role/email-safe and separate from exchange connectivity. Production owner/admin passwords are database-authoritative and privileged plaintext password environment inputs have been removed from the live Render service.

### DIZY public launch surface — achieved

The live Solana token identity, fixed supply, revoked authorities, official DizyTrades token page and canonical public market references are published. External directory approval is not represented as an engineering milestone.

### Evidence-qualified DizyQuant promotion — conditional

A metric may be considered only after representative evidence and a separate promotion review. This milestone may validly remain unstarted indefinitely.

### Guarded Trading Platform — operational activation pending

The software security boundary includes the production writer connection, encrypted credential custody, exact-account/generation authority, provider-neutral exact-host `/32` proof and microscopic one-shot canary gate. Production exchange-write activation remains off. The milestone becomes operational only after the intended Server Club host is migrated and rehearsed, fresh host and credential evidence is established, the bounded canary is reconciled and reviewed, and a separate explicit activation decision is made.

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
- Keep the existing Render service as the current application host while Server Club is prepared; do not grant temporary Render exchange-write egress solely to bridge that wait.
- Prefer existing infrastructure, GitHub workflows and free tooling where they preserve the reviewed security boundary.
- Do not create paid services, disks, databases, APIs or subscriptions without explicit owner approval.
