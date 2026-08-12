# Independent Engineering Review

Status: completed for the Operational Research Platform milestone in August 2026, subject to the pull request's full repository, browser, deployment-observation and recovery gates.

This review covers runtime parity, build and deployment configuration, browser response policy, dependency maintenance, repository artifact hygiene and the boundaries between the simulation beta and any future private-account or execution work. It does not approve exchange credentials or live order submission.

## Findings corrected

### Runtime versions could drift between CI and production

Render was pinned to one Node 22 patch release, while GitHub Actions floated on the Node 22 major and `package.json` declared only a minimum version. A newer CI runner could therefore pass while the deployed runtime behaved differently, particularly around built-in modules such as `node:sqlite`.

The repository now has one authoritative `.node-version`. The exact same version is required by:

- `package.json` and npm engine enforcement;
- the standard lint, test, build and Chromium workflow;
- the read-only Render deployment rehearsal;
- the isolated destructive application-recovery rehearsal;
- the Render Blueprint.

A runtime-version change triggers both operational rehearsals as well as normal CI.

### Production emergency-login configuration did not match the deployed beta

The engineering review initially classified `ROB_PASSWORD` and `FRIEND_PASSWORD` as unused and removed their Blueprint slots while forcing `ALLOW_TEST_PLAINTEXT_PASSWORDS=false`. That assumption was wrong for the deployed private beta: Rob and Nick still use those server-side Render secrets for their stable `rob` and `friend` emergency identities.

The Blueprint retains the existing plaintext slots for one controlled migration boot while setting `ALLOW_TEST_PLAINTEXT_PASSWORDS=false` and keeping `LIVE_TRADING_ENABLED=false`. The application hashes both trusted inputs into verified database-backed `rob` and `friend` accounts, records durable completion, and never overwrites their credentials on restart. Operators verify both logins, Nick's password-reset lifecycle, and MFA enrollment before manually removing the plaintext environment values.

The engineering contract requires the current emergency slots, legacy fallback and simulation-only boundary while continuing to reject private exchange-key names and any accidental `LIVE_TRADING_ENABLED=true` configuration.

### Browser hardening relied mostly on CSP

The application already had a restrictive Content Security Policy, but several explicit browser response policies were absent.

The global response contract now includes:

- Content Security Policy;
- Cross-Origin-Opener-Policy;
- Permissions-Policy;
- Referrer-Policy;
- Strict-Transport-Security;
- X-Content-Type-Options;
- X-Frame-Options.

The CSP preserves the existing TradingView embed and MEXC public WebSocket requirements. `object-src`, `base-uri` and `frame-ancestors` remain restricted.

### Dependency maintenance had no bounded automation

The project depended on manual discovery of outdated npm packages and GitHub Actions. Monthly grouped Dependabot checks now cover both ecosystems with capped open pull requests. This provides maintenance visibility without creating a constant stream of individual update PRs or adding a paid service.

### Engineering assumptions were documentation-only

The review adds executable contracts that fail CI when:

- Node versions drift across package, workflows and Render;
- the production Blueprint enables live trading, drops the currently required emergency-login slots or permits private exchange-key configuration;
- required browser security headers disappear;
- maintenance automation becomes unbounded;
- a real `.env` payload, user backup or SQLite/database file is committed.

The empty `.env.example` template remains intentionally versioned and is distinguished from real environment payloads.

## Operational evidence

The reviewed branch is validated by three independent GitHub Actions boundaries:

1. the standard application workflow running npm installation, lint, the complete deterministic unit suite, production build and Chromium journeys on the exact production Node runtime;
2. the isolated destructive application-recovery rehearsal running export, dry-run, restore, owner-isolation and idempotency evidence on that same runtime;
3. the read-only Render rehearsal authenticating to the configured service, observing deployment state and verifying the simulation-only production health contract.

No workflow reads or prints secret values. The Render rehearsal is observation-only.

## Accepted engineering debt

### Temporary plaintext emergency credentials

Rob and Nick's Render-held plaintext passwords remain a compatibility mechanism for the private simulation beta. They are server-side secrets, are never committed, require the explicit legacy and plaintext flags, and are rejected whenever live trading is enabled. Hash migration remains preferable and should remove the plaintext variables once both accounts have been verified with the generated hashes.

### Large client modules

`app/trading-terminal.tsx` and parts of Manual Paper remain large modules. Splitting them could improve maintainability, but a broad structural refactor immediately after the completed fidelity and audit programmes would create substantial regression risk without changing user value. Future work should extract one stable boundary at a time behind existing tests rather than perform a wholesale rewrite.

### Content Security Policy compatibility allowances

The current Next.js and TradingView integration still requires `unsafe-inline` allowances for scripts/styles. The policy restricts origins and dangerous object/base/frame behaviours, but a nonce-based CSP would be stronger. That migration should be handled as a dedicated compatibility project with production embed testing.

### GitHub Action references

Workflows use trusted major-version action tags such as `actions/checkout@v4` rather than immutable commit SHAs. Monthly Dependabot monitoring limits staleness, but a future supply-chain hardening pass may pin action SHAs once the maintenance burden is justified.

### Cross-file filesystem transactions

User data stores use atomic replacement per file and deterministic/idempotent restore, but the complete application restore is not one database transaction. Predictable conflicts are preflighted; unexpected disk or operating-system interruption is recovered by a new dry-run and idempotent reapply. Provider-level disk rollback remains deferred to the guarded-execution milestone.

### Automated review limitations

Static contracts, deterministic tests and Chromium cannot prove every failure mode. Human review remains required for high-risk architectural changes, private credentials and live execution. Canvas chart semantics and external provider behaviour retain the explicit limitations documented elsewhere.

## Security and product boundary

- The application remains a research, simulation and review platform.
- Public market-data connections remain read-only.
- No MEXC private credentials are requested or stored by this milestone.
- No order-submission route exists.
- Live trading remains disabled.
- No paid infrastructure, database, API or subscription was added by this review.

## Promotion conclusion

With DizyPaper Fidelity V2, workflow/accessibility work, deployment observation, application recovery and the focused authentication/storage, accounting, Replay, backup-conflict, browser-accessibility and engineering reviews complete, DizyTrades satisfies the repository-defined Operational Research Platform milestone.

The next programme is the Read-only Account Companion: private exchange account state may be introduced only through server-side credentials that have no order permission, explicit stale/error handling, reconciliation and proof that no write capability is requested.
