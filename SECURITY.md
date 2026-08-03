# Security

## Current execution boundary

DizyTrades is an active research, education and simulation platform. It is not a live exchange executor.

- `LIVE_TRADING_ENABLED` must remain `false`.
- No private MEXC API client or exchange order route exists.
- No browser workflow requests or stores exchange credentials.
- The public health and diagnostics surfaces must continue to report live execution as disabled.

Never commit passwords, session secrets, API keys, `.env` files or exported account backups.

The current authentication and storage review is recorded in [docs/AUTH_STORAGE_THREAT_REVIEW.md](docs/AUTH_STORAGE_THREAT_REVIEW.md). That review approves only the active simulation beta boundary; it does not approve exchange credentials or order permission.

## Public market-data boundary

DizyCharts, DizyScanner, DizyStructure and DizyFlow use documented public MEXC directory, candle, depth and transaction data. Browser WebSocket connections use only public channels and are restricted by CSP to the declared provider host.

A forming candle is display-only and cannot confirm a DizySignals signal, historical fact or paper entry. Public-feed failure must degrade visibly to delayed, stale or unavailable states rather than fabricating continuity.

TradingView Explorer remains an isolated official read-only widget. It is not scraped, read from, injected with DizySignals or used for simulation.

## Authentication and roles

Public accounts use versioned salted scrypt password hashes. Login sessions use random opaque tokens whose SHA-256 digests are retained server-side; raw tokens and passwords must never be logged.

- `owner`: Rob's primary operations account.
- `admin`: Nick's authorised test/admin account.
- `user`: normal signed-in account with isolated user-owned data.
- `viewer`: temporary read-only public session.

Public signup and legacy emergency access fail closed unless their environment flags are explicitly set to `true`.

Rob and Nick retain environment-backed emergency access behind `LEGACY_AUTH_FALLBACK_ENABLED=true`. Their stable IDs (`rob` and `friend`) preserve access to existing isolated data. Signed emergency sessions are revalidated against current server configuration and are revoked collectively by disabling the fallback or rotating `SESSION_SECRET`.

Viewer access uses a signed HTTP-only session cookie with a two-hour lifetime. Viewer profile reads return sanitised in-memory defaults, writes are rejected, and temporary UI state remains in browser storage.

All cookies are HTTP-only, Secure in production and SameSite=Lax. POST authentication mutations require a valid same-origin request. Compatibility GET logout requires a real user-initiated same-origin browser navigation and rejects cross-site embeds.

Authentication rate limits are stored in SQLite. If SQLite is unavailable, a bounded in-process limiter protects the current single-instance emergency path instead of silently disabling throttling.

## DizyOps boundary

DizyOps and `/api/admin/diagnostics` are available only to `owner` and `admin` roles. Normal users, viewers and unauthenticated requests are blocked server-side; hiding a navigation link is never treated as access control.

Diagnostics return bounded aggregate deployment, runtime, storage and sanitised audit metadata only. They must not expose:

- credentials or secret configuration values;
- raw user records, Journal text or order details;
- filesystem paths;
- session identifiers;
- unbounded audit logs.

A healthy application process does not prove that every public provider is fresh.

## Backup, export and recovery boundary

DizyBackup is available to authenticated non-viewer accounts for their own data only. Backups are owner-ID scoped and may include profile settings, simulator history, Manual Paper, Journal records, Replay memories, Historical DizyFlow, deterministic DizyBrain reviews and saved workspace layouts.

Backups exclude authentication records, passwords, sessions, exchange credentials and future live-execution secrets.

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

The authentication SQLite file is explicitly restricted to owner read/write permissions (`0600`). Per-user JSON and audit writes retain their existing private creation mode.

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
- Emergency owner/admin signed sessions are not individually revocable in SQLite.
- Public accounts have no MFA, email verification or self-service password reset.
- Local audit JSONL is operational evidence, not immutable externally anchored security logging.
- Render host and persistent-disk security remain inside the provider trust boundary.
- The application must continue storing simulation and review data only, not exchange secrets.

## Requirements before exchange write permission

Before live execution is considered, DizyTrades requires at minimum:

- read-only account connectivity and reconciliation first;
- MFA and hardened database-backed sessions;
- envelope-encrypted server-side credentials;
- idempotent order submission;
- immutable audit storage;
- shared authentication and abuse rate limiting for any multi-instance deployment;
- symbol, leverage, notional and daily-loss limits;
- stale-price rejection;
- position reconciliation and reduce-only safeguards;
- a tested global kill switch;
- controlled provider persistent-disk snapshot rollback and service-restart rehearsal;
- independent security review;
- test-account rollout before meaningful capital.
