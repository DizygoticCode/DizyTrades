# Account Email Deployment

This document records the production runtime contract for DizyTrades public signup, email verification and password recovery on the self-hosted production service.

## Required production variables

The DizyTrades production service requires:

```text
PUBLIC_SIGNUP_ENABLED=true
APP_BASE_URL=https://dizytrades.tech
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=dizytrades@gmail.com
SMTP_APP_PASSWORD=<server secret only>
MAIL_FROM=DizyTrades <dizytrades@gmail.com>
```

## Secret handling

`SMTP_APP_PASSWORD` must be a dedicated Google App Password for the DizyTrades Gmail account.

- Never use the normal Google account password.
- Never commit the App Password to GitHub, `.env.example`, documentation, screenshots or test fixtures.
- Keep the real value only in the protected production service environment.

## Application preflight

The account-mail boundary fails closed unless its complete configuration is valid.

- Public signup requires `PUBLIC_SIGNUP_ENABLED` to equal exactly `true`.
- `APP_BASE_URL` must resolve as a valid HTTP/HTTPS origin and must use HTTPS in production.
- SMTP user must be a valid email address.
- SMTP port must be valid.
- `SMTP_APP_PASSWORD` must be non-empty.
- Sender and host values must be valid single-line headers.

The signup page and signup API use the same `publicSignupEnabled()` helper so the UI cannot present signup as enabled while the backend rejects it because the explicit flag is absent.

## Applying production environment changes

When one of these variables is newly introduced or changed:

1. update the protected DizyTrades production service environment on the self-hosted Ubuntu host;
2. restart the DizyTrades service so the running process receives the new environment;
3. verify `/api/health` through the production origin;
4. verify the intended signup, verification and password-recovery flow.

Repository defaults do not replace the protected production environment and must never contain real secrets.

## Production smoke evidence

A complete account-email smoke should prove the real runtime chain rather than only the repository declaration:

1. create a new public account using a controlled test address;
2. confirm signup creates a pending-verification account and no session;
3. receive the DizyTrades verification email through Gmail SMTP;
4. follow the verification link and confirm the account becomes verified;
5. sign in and reach the protected terminal;
6. request password recovery for that verified account;
7. receive the reset email;
8. complete a password change;
9. confirm existing database sessions are revoked and the new password can sign in.

## Privileged account transition

The first deployment after the privileged migration uses the existing trusted `ROB_EMAIL`/`ROB_PASSWORD` and `FRIEND_EMAIL`/`FRIEND_PASSWORD` values only to create the verified database-backed `rob` owner and `friend` admin identities. The migration is transactional, conflict-intolerant and durably recorded. Do not delete the plaintext variables before that first boot.

After verifying both identities, exercise Nick's forgot-password flow, confirm his prior database sessions are revoked, confirm only the new password works, and confirm MFA enrollment is available. Then remove `ROB_PASSWORD` and `FRIEND_PASSWORD` from the protected production environment. Do not change the stable IDs or roles. Subsequent boots use the durable database credentials and do not reset them from environment input.

Verification/reset bearer links are sensitive. Do not copy live token URLs into tickets, logs or public documentation. The tokens are single-use and expire, but they must still be handled as credentials while valid.

## What this does not enable

Account email configuration does not change the exchange-execution boundary.

- `LIVE_TRADING_ENABLED=false` remains required.
- Gmail credentials cannot place exchange orders.
- Public account verification does not grant owner/admin roles.
- Profile editing cannot change account role or sign-in email.
- Guarded live execution remains a separate security programme.
