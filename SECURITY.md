# Security

## Current execution boundary

DizyTrades is an active research, education and simulation platform. It is not a live exchange executor.

- `LIVE_TRADING_ENABLED` must remain `false`.
- The owner-only DizyAccount Companion may use server-held **read-only** MEXC Futures credentials for approved GET-only account and trade-read endpoints.
- No private exchange write client or order-placement route exists.
- No browser workflow requests or stores exchange credentials.
- The public health and diagnostics surfaces must continue to report live execution as disabled.

The server-only execution airlock defines immutable intent, validation,
idempotency, kill-switch and secret-free audit-event contracts. Its only adapter
is non-executing, has no network dependency and always returns a blocked result.
There is no execution route or production exchange adapter. This is an
architecture-only prerequisite and does not approve live execution; DizyAccount
remains read-only and DizyPaper remains simulation-only.

Never commit passwords, session secrets, API keys, Gmail App Passwords, `.env` files or exported account backups.

The authentication/storage review is recorded in [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md). The completed read-only account boundary is recorded in [docs/MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW.md](docs/MEXC_READONLY_ACCOUNT_COMPANION_INDEPENDENT_REVIEW.md). Neither approves exchange write permission.

## Public market-data boundary

DizyCharts, DizyScanner, DizyStructure and DizyFlow use documented public MEXC directory, candle, depth and transaction data. Browser WebSocket connections use only public channels and are restricted by CSP to the declared provider host.

A forming candle is display-only and cannot confirm a DizySignals signal, historical fact or paper entry. Public-feed failure must degrade visibly to delayed, stale or unavailable states rather than fabricating continuity.

TradingView Explorer remains an isolated official read-only widget. It is not scraped, read from, injected with DizySignals or used for simulation.

## Private read-only account boundary

The DizyAccount Companion is owner-scoped and server-side. Its exchange transport accepts typed endpoint IDs only, fixes the provider origin, constructs only `GET` requests and allowlists endpoints that require Account read or Trade read permission. Callers cannot submit an arbitrary host, URL, path or HTTP method.

Activation requires the owner-only environment boundary and explicit read-only permission attestation. Private provider failures degrade to unavailable/stale account state rather than broadening permissions. Account modification, transaction modification and trading permission remain forbidden.

The companion may ingest balances, positions and provider risk context, compare that state with DizyPaper, create non-executable hypothetical previews and append bounded shadow-audit evidence. It cannot place, cancel or amend an exchange order.

Credential shutdown and removal are documented in [docs/MEXC_OWNER_CONNECTION_SHUTDOWN.md](docs/MEXC_OWNER_CONNECTION_SHUTDOWN.md).

## Authentication, verification and roles

Public accounts use versioned salted scrypt password hashes. Login sessions use random opaque tokens whose SHA-256 digests are retained server-side; raw tokens and passwords must never be logged.

- `owner`: Rob's primary operations account.
- `admin`: Nick's authorised test/admin account.
- `user`: normal signed-in account with isolated user-owned data.
- `viewer`: temporary read-only public session.

Public signup and legacy emergency access fail closed unless their environment flags are explicitly set to `true`.

New public signup accounts require an email address and remain unable to receive an authenticated session until the address is verified. Email-verification and password-reset bearer tokens are random, hashed at rest, expiring and single-use. Links place the bearer token in the URL fragment rather than the query string so the token is not sent in the initial HTTP request URL.

Forgot-password and resend-verification requests use enumeration-safe responses and rate limits. Password reset is available only to verified database accounts; a successful reset replaces the password hash, consumes outstanding recovery material and revokes existing database sessions.

Rob and Nick retain environment-backed legacy access behind `LEGACY_AUTH_FALLBACK_ENABLED=true`. Their stable IDs (`rob` and `friend`) preserve access to existing isolated data. Their credentials remain in the protected Render environment boundary and are not managed by the public self-service reset flow.

Viewer access uses a signed HTTP-only session cookie with a two-hour lifetime. Viewer profile reads return sanitised in-memory defaults, writes are rejected, and temporary UI state remains in browser storage.

All cookies are HTTP-only, Secure in production and SameSite=Lax. POST authentication mutations require a valid same-origin request. Compatibility GET logout requires a real user-initiated same-origin browser navigation and rejects cross-site embeds.

Authentication rate limits are stored in SQLite. If SQLite is unavailable, a bounded in-process limiter protects the current single-instance emergency path instead of silently disabling throttling.

## Account email transport

Production verification and recovery mail is sent server-side through a bounded TLS SMTP client. The intended Render runtime contract is:

- `PUBLIC_SIGNUP_ENABLED=true`
- `APP_BASE_URL=https://dizytrades.onrender.com`
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_USER=dizytrades@gmail.com`
- `SMTP_APP_PASSWORD` supplied only as a Render secret/environment value
- `MAIL_FROM=DizyTrades <dizytrades@gmail.com>`

`SMTP_APP_PASSWORD` must be a dedicated Google App Password, never the Google account password and never committed to source control. Production requires an HTTPS `APP_BASE_URL` and TLS certificate validation for SMTP.

`render.yaml` declares the intended service contract, but an already-existing Render service may require newly introduced environment variables to be added to the live service explicitly and then applied by a restart/redeploy. Deployment documentation must keep that operational distinction visible.

## Personal profile boundary

Authenticated non-viewer identities have a personal profile surface. Database users and the legacy owner/admin identities can store a display name, bounded bio and optional avatar in the server-side SQLite profile store.

Profile mutation cannot change role or sign-in email. Email is read-only on the profile page; a future email-change feature would require a separate verify-new-address design. Avatar uploads accept bounded PNG, JPEG or WebP content with signature/type validation and a 512 KB maximum.

## DizyOps boundary

DizyOps and `/api/admin/diagnostics` are available only to `owner` and `admin` roles. Normal users, viewers and unauthenticated requests are blocked server-side; hiding a navigation link is never treated as access control.

Diagnostics return bounded aggregate deployment, runtime, storage and sanitised audit metadata only. They must not expose:

- credentials or secret configuration values;
- raw user records, Journal text or order details;
- filesystem paths;
- session identifiers;
- unbounded audit logs.

A healthy application process does not prove that every public or private provider is fresh.

## Backup, export and recovery boundary

DizyBackup is available to authenticated non-viewer accounts for their own data only. Backups are owner-ID scoped and may include profile settings, simulator history, Manual Paper, Journal records, Replay memories, Historical DizyFlow, deterministic DizyBrain reviews and saved workspace layouts.

Backups exclude authentication records, passwords, sessions, exchange credentials, email-verification/reset tokens and future live-execution secrets.

Recovery requires:

1. payload-size enforcement;
2. strict schema and owner validation;
3. SHA-256 integrity verification;
4. a server-side dry-run;
5. the unchanged reviewed backup hash;
6. explicit `RESTORE` confirmation;
7. conflict-aware additive writes.

Existing records and open Manual Paper state must never be silently replaced. Journal CSV output neutralises spreadsheet-formula prefixes. Exported backups should be stored outside the Render persistent disk and treated as sensitive user data.

The application-level recovery path is exercised destructively in isolated temporary data roots by GitHub Actions. Production deployment identity and health are observed read-only through the Render API. A destructive provider snapshot rollback is deferred until the guarded-execution security milestone, when it can be justified and rehearsed with isolated infrastructure.

## Persistent user-data boundary

Per-user settings, workspaces, Manual Paper, Journal and retained historical evidence are written beneath `DATA_DIR` using strict one-to-one owner identifiers and atomic file replacement where supported. Unsupported owner-ID characters are rejected rather than removed, preventing two identities from collapsing to the same filename.

The authentication SQLite file is explicitly restricted to owner read/write permissions (`0600`). Database-account identities, opaque session hashes, account-verification/reset token hashes and personal profile/avatar records live in that server-side authentication store. Per-user JSON and audit writes retain their existing private creation mode.

Chart workspaces contain display configuration only. Viewer workspace reads are empty and viewer writes are forbidden. Workspace versions prevent confirmed stale-tab overwrites with HTTP 409. Display indicators cannot enter strategy, risk, paper-trading or execution paths.

Scanner and Structure use bounded market-only profile patches so an older secondary tab cannot overwrite unrelated strategy, risk, appearance or order-flow settings.

## Historical evidence boundary

Completed trade facts, Replay memories, Historical DizyFlow and deterministic reviews are immutable or content-addressed evidence. Current live depth, settings or future candles must never be substituted for missing historical evidence.

Replay uses only the revealed candle prefix. Historical DizyFlow is returned only when retained evidence satisfies its identity, time and age boundaries.

## Temporary plaintext-password test mode

Server-only plaintext environment passwords are a temporary test-only fallback. They require `ALLOW_TEST_PLAINTEXT_PASSWORDS=true` and are blocked when `LIVE_TRADING_ENABLED=true`.

Use unique throwaway passwords, never commit or reuse them, and retain salted scrypt authentication for normal accounts.

## Accepted active-beta limitations

- The SQLite-outage fallback limiter is process-local and resets on restart. It is acceptable only for the current single-instance service.
- Emergency owner/admin legacy sessions are not individually managed by the public database-account recovery flow.
- Public accounts have email verification and self-service password reset but do not yet have MFA.
- Local audit JSONL is operational evidence, not immutable externally anchored security logging.
- Render host and persistent-disk security remain inside the provider trust boundary.
- The application remains simulation-only; the read-only Account Companion does not approve or imply exchange write capability.

## Requirements before exchange write permission

Before live execution is considered, DizyTrades requires at minimum:

- isolated execution service or equivalently isolated execution boundary;
- MFA and hardened database-backed sessions;
- envelope-encrypted server-side write-capable credentials;
- shared authentication and abuse rate limiting for any multi-instance deployment;
- server-side order preview and risk validation;
- idempotent order submission;
- exchange acknowledgement and deterministic reconciliation;
- symbol, leverage, notional and daily-loss limits;
- reduce-only enforcement;
- stale-price and stale-account-state rejection;
- global and per-user kill switches;
- immutable execution audit storage;
- controlled provider persistent-disk snapshot rollback and service-restart rehearsal;
- restricted test-account rollout;
- independent security review before meaningful capital.
