# Authentication and Storage Threat Review

Status: completed for the active simulation-only beta in August 2026.

This review covers the authentication, session, request-origin and per-user storage boundaries currently present in DizyTrades. It does not approve exchange credentials or live execution. Those systems do not exist in the current product and remain behind later security milestones.

## Assets protected

- public-account password hashes;
- owner and admin emergency credentials held in server environment variables;
- browser session cookies and server-side session records;
- account roles and stable owner identifiers;
- per-user profile, workspace, Manual Paper, Journal and retained evidence files;
- authentication attempt counters and bounded audit events;
- backup ownership and restore isolation.

## Trust boundaries

1. Browser input is untrusted until validated by a server route.
2. Reverse-proxy request metadata is used only after bounded parsing.
3. SQLite is authoritative for public users and revocable opaque sessions.
4. Environment-backed owner/admin access is an explicit emergency fallback.
5. Session identity is authoritative for every user-owned filesystem operation.
6. Backup payload ownership is validated independently from the active session.
7. The Render host and persistent disk remain trusted infrastructure operators; DizyTrades does not claim application-managed disk encryption or immutable host audit storage.

## Findings remediated

### Feature flags defaulted open

`PUBLIC_SIGNUP_ENABLED` and `LEGACY_AUTH_FALLBACK_ENABLED` previously remained enabled unless explicitly set to `false`. Both now fail closed and require the exact value `true`. The checked-in Render and local environment examples remain explicit about the intended beta configuration.

### Authentication throttling disappeared with SQLite

The persistent rate limiter previously returned "not limited" whenever SQLite was unavailable. That weakened the emergency legacy-login path during the exact failure mode in which it was most likely to be used. A bounded in-memory fallback now preserves IP and identifier throttling for the current single-instance deployment.

### Session parsing accepted unnecessarily broad input

Signed viewer and legacy tokens now enforce:

- one body and one HMAC component only;
- bounded total and decoded lengths;
- base64url syntax;
- exact SHA-256 HMAC length;
- safe integer expiry;
- bounded identity fields;
- strict owner identifiers;
- current configured legacy identity and role;
- immediate revocation when legacy fallback is disabled.

Opaque database tokens are accepted only at their exact generated length and syntax before hashing or querying SQLite.

### Database users could receive a dead fallback cookie

If database session creation failed, `issueSession` could create a signed token for a normal user even though signed normal-user tokens are intentionally rejected. Normal users now receive no cookie when their revocable database session cannot be created. The login route returns the existing service-unavailable response instead of appearing to succeed.

### GET logout could be triggered cross-site

POST logout remains protected by the same-origin request check. Compatibility GET logout now requires a real user-initiated, same-origin browser navigation through Fetch Metadata headers. Cross-site embeds, images and passive links cannot revoke the current session.

### Request metadata was too permissive

Client IP values are accepted only when Node recognises them as IPv4 or IPv6. Origin validation now rejects cross-site Fetch Metadata, compares both protocol and host, and parses forwarded values as bounded first-header entries.

### Low-level account creation trusted route validation

The SQLite account creator now validates username, email and password constraints at its own boundary. Public callers still cannot provide an ID or role; IDs remain random UUIDs and roles remain `user`.

### Lossy owner-ID sanitisation could alias storage keys

The generic profile and Journal stores previously removed unsupported characters. Distinct internal identifiers could therefore collapse to the same filename if an unsafe ID reached those stores. They now reject anything outside the shared one-to-one owner-ID grammar instead of rewriting it.

### Authentication database permissions were implicit

The SQLite authentication file is explicitly set to owner read/write permissions (`0600`) after migration. Per-user JSON writes and audit files retain their existing `0600` creation mode.

## Verified controls retained

- versioned salted scrypt password hashing;
- no plaintext password or raw opaque token storage;
- SHA-256 digests for revocable database sessions;
- one active database session per public account;
- public signup always creates the `user` role;
- viewer sessions remain short-lived and read-only;
- owner/admin signed sessions are revalidated against current server configuration;
- HTTP-only, Secure-in-production, SameSite=Lax cookies;
- server-side role checks for owner/admin workspaces;
- strict backup owner matching, integrity hashes and dry-run/apply binding;
- atomic per-user JSON replacement where supported;
- no exchange credential form, private MEXC client or order route.

## Automated evidence

The repository test suite now covers:

- fail-closed signup and legacy-auth flags;
- strict and collision-free owner identifiers;
- malformed, oversized, tampered and revoked signed sessions;
- normal-user session failure without an unusable fallback cookie;
- throttling while SQLite is unavailable;
- authentication database file permissions;
- low-level account validation;
- request IP, origin and logout-navigation boundaries;
- profile and Journal rejection of unsafe owner IDs;
- DizyBrain/global-tool collision regression reported during this review.

Normal merge gates remain lint, the complete deterministic unit suite, production build and Chromium.

## Accepted beta limitations

- The fallback rate limiter is process-local and resets on restart. This is acceptable only while Render runs one application instance. Multi-instance deployment requires a shared limiter.
- Legacy owner/admin signed sessions are not individually revocable in SQLite. Disabling legacy fallback or rotating `SESSION_SECRET` revokes them collectively. Database-backed owner/admin accounts and MFA are required before exchange write permission.
- Public signup has no email verification, self-service password reset or MFA. The beta must not represent this as a hardened financial-account identity system.
- Audit JSONL files are bounded operational evidence, not immutable or externally anchored security logs.
- The provider persistent disk and host remain inside the infrastructure trust boundary.
- The active product stores simulation and review data only. It must not store exchange API secrets.

## Deferred security milestones

Before any live MEXC order permission is considered:

1. complete read-only exchange connection and reconciliation;
2. replace emergency signed owner/admin access with hardened database sessions and MFA;
3. add envelope-encrypted credential custody;
4. add immutable execution audit evidence and shared rate limiting;
5. complete controlled provider persistent-disk snapshot rollback and service restart rehearsal;
6. pass an independent security review and restricted test-account rollout.

The destructive provider snapshot rollback is deliberately deferred to that milestone. The current beta already has read-only Render deployment observation and a destructive application-level restore rehearsal in isolated temporary data roots, without creating another paid service or touching production data.
