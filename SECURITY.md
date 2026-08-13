# Security

## Current execution boundary

DizyTrades is an active research, education and simulation platform. It is not a live exchange executor.

- `LIVE_TRADING_ENABLED` must remain `false`.

Execution provider mechanics remain inside the server-only `ExecutionBoundary`.
The only production provider is deterministic and non-executing: every result is
synthetic, explicitly provenance-marked and `executed:false`. It has no HTTP,
MEXC signing, credential custody or provisioning import. Routes, clients and
DizyPaper cannot import provider internals, and all authentication, kill-switch,
validation, policy and duplicate decisions fail closed before provider evaluation.
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

Durable execution-state/idempotency bookkeeping is isolated in the server-only
execution compartment. Production composition owns a dedicated
`DATA_DIR/execution-state.sqlite` store using a versioned schema, SQLite WAL,
strong synchronous mode and the existing single-instance persistent-disk posture.
A unique `(userId, accountId, idempotencyKey)` processing claim is committed
before synthetic provider mechanics can run. Bounded rejected, blocked and
synthetic prepared results persist only validated non-secret fields and always
retain `executed:false`. Store open, schema, read, write or validation failures
fail closed; production has no permissive process-local idempotency fallback.
An unfinished processing claim after a crash remains duplicate-protected rather
than allowing provider re-entry after restart.

The deterministic preview layer accepts prerequisite market/account snapshots
only as evidence, never as policy. Risk limits are compiled into the server-only
boundary; missing, invalid, stale or policy-violating evidence is rejected. A
successful preview is a sanitized estimate, not an exchange instruction, and
cannot place, cancel or amend an order.

The isolated `executionBoundary` singleton is the only permitted application
import into the airlock implementation. It authenticates a server-internal
caller through a server-owned verifier, requires the verified caller's
user/account binding to match the request, and obtains kill-switch state through
its own dependency.
Caller-supplied intent fields cannot override identity, policy or global,
per-user or per-account shutdown state. Construction and dependency injection
remain internal/test-only, preventing application callers from replacing the
production-owned durable execution-state store. Malformed stored state, store
failures, malformed provider output, exceptions, and other verifier or
shutdown-provider failures fail closed before any execution capability can be
reached. There is still no public execution route, write transport, signing
implementation or write-key custody.

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

Database accounts support standards-compatible six-digit TOTP MFA with a one-step clock window. Enrollment requires password re-authentication, remains pending until a valid TOTP is supplied, and stores its server-generated secret under versioned AES-256-GCM authenticated encryption. Active credentials cannot be replaced by ordinary password-only enrollment. `MFA_ENCRYPTION_KEY` is a dedicated base64url 32-byte deployment secret and must not reuse `SESSION_SECRET`; production fails closed when it is absent, invalid or equivalent to the configured session secret. Recovery codes are revealed only upon activation/regeneration, stored only as individual strong hashes, and atomically consumed once. Every authenticated password/TOTP/recovery proof surface uses persisted per-account and per-IP throttling; proof values are never limiter keys.

Password authentication for an MFA-enabled account creates only a five-minute, hashed-at-rest, bounded-attempt database challenge. It is not an application session. Successful TOTP or recovery proof atomically consumes that challenge and creates a newly random database session. Database sessions record creation, expiry, last-seen and revocation state; security-sensitive MFA disable or recovery regeneration revokes them.

- `owner`: Rob's primary operations account.
- `admin`: Nick's authorised test/admin account.
- `user`: normal signed-in account with isolated user-owned data.
- `viewer`: temporary read-only public session.

Public signup and legacy emergency access fail closed unless their environment flags are explicitly set to `true`.

New public signup accounts require an email address and remain unable to receive an authenticated session until the address is verified. Email-verification and password-reset bearer tokens are random, hashed at rest, expiring and single-use. Links place the bearer token in the URL fragment rather than the query string so the token is not sent in the initial HTTP request URL.

Forgot-password and resend-verification requests use enumeration-safe responses and rate limits. Password reset is available only to verified database accounts; a successful reset replaces the password hash, consumes outstanding recovery material and revokes existing database sessions.

On the first safe server boot, trusted `ROB_EMAIL`/`ROB_PASSWORD` and `FRIEND_EMAIL`/`FRIEND_PASSWORD` inputs are transactionally migrated to verified database accounts with stable IDs `rob` and `friend` and exact roles `owner` and `admin`. Passwords use the normal versioned scrypt format; plaintext is never stored. A durable completion record makes restart idempotent and prevents environment values from overwriting later password changes. Conflicting IDs, roles, emails or usernames fail closed without insertion or elevation. A migrated database identity shadows legacy fallback, including after a normal reset, and uses the same MFA, opaque-session and recovery lifecycle as any verified database account.

The plaintext environment inputs remain staged only for the first production migration. After deployment verification of both identities and Nick's reset lifecycle, operators may manually remove `ROB_PASSWORD` and `FRIEND_PASSWORD`; completed restarts do not require them. This PR does not claim that removal has already happened.

Viewer access uses a signed HTTP-only session cookie with a two-hour lifetime. Viewer profile reads return sanitised in-memory defaults, writes are rejected, and temporary UI state remains in browser storage.

Legacy signed owner/admin and viewer sessions preserve ordinary application compatibility, but **do not satisfy any future guarded-execution MFA requirement**.

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

The authentication SQLite file is explicitly restricted to owner read/write permissions (`0600`). Database-account identities, opaque session hashes, account-verification/reset token hashes and personal profile/avatar records live in that server-side authentication store. The separate guarded-execution state database is also server-only and restricts its main database and SQLite sidecar files to owner read/write permissions where supported; it contains bounded execution-state/idempotency metadata only, never credentials or authorization/session material. Per-user JSON and audit writes retain their existing private creation mode.

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
- Current production is one Render instance with persistent SQLite authentication, rate-limit and guarded-execution idempotency state, scaled vertically first. Guarded-execution idempotency is durable across restart on this supported topology but is not a horizontally shared multi-instance solution. Horizontal multi-instance deployment is not planned for this slice and would require a separate shared-state design before use.
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
# Future execution credential custody

DizyTrades has a dedicated, server-only SQLite custody boundary for synthetic validation and future MEXC execution credentials. It encrypts the complete API-key/secret payload with AES-256-GCM, a fresh 96-bit nonce, and canonical authenticated ownership AAD. The AAD binds the stable database user, bounded account reference, exchange, future-execution purpose, record id, envelope version, and key version. Only bounded non-secret lifecycle metadata is audited.

Custody is disabled by default and disconnected from routes, browser code, MEXC signing/network transports, and `app/lib/execution`. Its existence adds **no live execution capability**. The ordinary application boots without custody keys while disabled. Custody operations fail closed unless an active version and a dedicated 32-byte keyring are explicitly configured. Keys must be distinct from `SESSION_SECRET`, `MFA_ENCRYPTION_KEY`, password material, and all exchange credentials.

The owner-only credential provisioning ceremony is a separate, server-only handoff into that custody compartment. It requires the database-backed `rob` owner session plus a fresh database password and fresh TOTP, then issues a five-minute, single-use, purpose- and session-bound authorization whose SHA-256 digest is the only persisted representation. Provision and revoke use separate authorizations. Responses and lifecycle audits contain metadata only; there is no secret readback or MEXC verification. `CREDENTIAL_PROVISIONING_ENABLED` and `CREDENTIAL_CUSTODY_ENABLED` are both false by default. The ceremony adds no signer, private-write transport, provider wiring, order route, or paid infrastructure.

The existing Account Companion remains an independent GET-only/read-only facility with `writeCapability:false`; its credentials are never migrated to future-execution custody. `LIVE_TRADING_ENABLED=false` remains mandatory.

Rotation decrypts and re-encrypts within one SQLite transaction; historical key versions must remain available during rewrap, and plaintext is never persisted. A later externally managed KMS can implement the same versioned record contract. Provisioning and any execution-provider wiring require separate security review. The MEXC Account Companion remains a separate GET-only, allow-listed, read-only subsystem.
