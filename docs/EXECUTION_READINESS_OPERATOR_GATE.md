# DizyTrades guarded-execution operator gate

Tracking: [execution readiness #376](https://github.com/DizygoticCode/DizyTrades/issues/376).

This is the final **human/operator evidence checklist** after repository-side implementation and documentation review. It is deliberately split from any future exchange-write activation or canary. Completing the checks below does not itself authorize an order.

## Safety boundary

- Keep `LIVE_TRADING_ENABLED=false` and `MEXC_WRITE_PROVIDER_ENABLED=false`.
- Do not paste API keys, secret keys, session cookies, TOTP seeds/codes, encryption keys, environment dumps, database contents or backup contents into GitHub, chat, screenshots or logs.
- Do not use a read-only Account Companion key as the write credential.
- Do not weaken or remove the MEXC IP restriction to make a test pass.
- Do not click the credential **activation** action and do not submit a canary/order while performing this checklist.
- If any evidence is unavailable, stale, inconsistent or surprising, stop with execution disabled.

## 1. Running-host identity and disabled posture

On dizyserver, verify only non-secret facts:

- the deployed DizyTrades Git SHA is the exact reviewed/green commit intended for the ceremony;
- Node and the installed Next.js version match the repository support contract;
- `dizytrades.service` is active;
- local `http://127.0.0.1:10000/api/health` reports the DizyTrades service healthy, in test mode, with live trading disabled;
- the public HTTPS site is reachable through the normal Caddy route.

Do **not** dump the service environment to prove the two write switches. Verify their disabled state through the application's bounded status/diagnostic surfaces or a local operator method that reveals only the variable names and boolean state, never secret values.

## 2. Durable protected-state readiness

Before changing any egress or credential authority, confirm the current host owns the intended durable application/execution state and that it survives a controlled restart.

Evidence should cover:

- current `DATA_DIR` ownership/permissions without publishing sensitive paths or contents;
- the relevant SQLite authority/custody/audit stores are readable by the service and fail closed when unavailable;
- a fresh protected backup exists outside the live mutation path;
- the backup has passed the repository-supported integrity/dry-run validation;
- an **isolated** restore/rollback rehearsal has succeeded without writing over production state;
- after a controlled application restart, the same non-secret authority revisions/statuses remain available.

A dry-run alone is not a full host-loss recovery proof. Do not perform a destructive production restore for this gate.

## 3. Owner identity and MFA

Using the real owner account in the normal HTTPS UI:

- confirm the owner account is database-backed and signs in normally;
- confirm TOTP MFA is active and a fresh code can complete an ordinary owner authentication flow;
- confirm password/TOTP/recovery proof throttles have not been disabled;
- confirm no legacy plaintext password mechanism is being relied on for guarded execution.

Never record the password, TOTP seed, current code or recovery code in the evidence.

## 4. Read-only Account Companion separation

Confirm the existing DizyAccount Companion remains a separate GET-only capability:

- it has no order-placement permission or browser-held exchange credential;
- if its MEXC key is present, it is the dedicated read-only key and **not** the intended execution key;
- its local shutdown/control page accurately reports only bounded presence/enablement state;
- live exchange-write readiness is not inferred from successful account reads.

## 5. Self-hosted execution-host egress evidence

Use the current owner **Write credential ceremony** surface, not the retired historical Render egress route.

Before making any mutation, inspect the non-secret status only:

- exact server-owned owner/account/generation identity is the intended one;
- current runtime/host identity is the intended self-hosted execution host;
- the independent HTTPS observers agree on the host's public IPv4;
- any durable egress proof belongs to the same provider/host/generation and exactly one `/32`;
- historical Render evidence is not accepted as current-host authority;
- observation timestamps/revisions are fresh enough for the current authority rules.

If a new declaration/two-observation ceremony is required, treat that as a deliberate owner operation: use fresh password+TOTP proofs, require the same exact observer-agreed IPv4 twice with the enforced delay, and stop if the address changes.

## 6. Dedicated MEXC write credential and allowlist

Only after the exact-host proof is clean:

- create/use a **dedicated execution key** that is distinct from the Account Companion key;
- confirm at MEXC that its permission is the narrowly reviewed Order Placing permission only;
- confirm its IP restriction is exactly the proven current host `/32`;
- keep all unrelated provider permissions disabled;
- attest the allowlist only against the same server-owned account/generation;
- if provisioning is required, enter the access/secret only into the protected owner HTTPS ceremony so it is sealed into encrypted custody; never paste it elsewhere;
- after sealing, verify only the resulting non-secret status/fingerprint agreement: custody `sealed`, authority `attested`, matching fingerprint/egress receipt.

At this point **stop**. An attested generation is sufficient to complete the provisioning evidence; it does not need to be activated merely to prove readiness.

## 7. Fail-closed controls before any separate activation proposal

Confirm, without arming anything:

- emergency/maintenance/global/user/account disable logic is available and fails closed;
- revocation/rotation and quarantine paths are documented and tested;
- ambiguous-delivery reconciliation remains GET-only and cannot authorize a second POST;
- risk/day-start equity/reconciliation prerequisites report unavailable rather than inventing data when evidence is missing;
- the execution audit chain is readable and intact;
- there is still no general browser/public order route.

## Exit condition for #376

Issue #376 can be closed as **readiness evidence complete** when sections 1–7 are recorded using non-secret pass/fail facts and the exact host/account/generation identifiers already safe to expose in the bounded UI. Closing #376 must **not** imply that production writing is active.

A future transition from `attested` to `active`, production writer connection, or the first microscopic reduce-only LIMIT canary at exactly 1x and no more than 25 USDT requires a **new, separate, explicit owner-approved operation** with its own preflight and reconciliation. Do not perform it as a side effect of this checklist.
