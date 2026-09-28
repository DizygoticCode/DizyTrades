# Self-hosted DizyTrades operations (27 September 2026)

## Operator-verified host snapshot — 28 September 2026

These are dated **host observations**, not a guarantee that a later checkout,
service or deployment still matches. Recheck after every rollout.

- Ubuntu 24.04, running kernel `6.8.0-142-generic`; the Netplan update
  generated successfully, and the firmware package split was installed (one
  upgraded meta package plus 18 new component packages). The initramfs for
  the running kernel was regenerated. These observations do **not** prove a
  subsequent reboot has been rehearsed against the new firmware.
- Caddy was upgraded to `2.11.4`; the live configuration was validated.
  It routes `dizytrades.tech` to `127.0.0.1:10000` and
  `dizychat.com` to `127.0.0.1:10001`, with LiveKit separately proxied.
  A narrow DizyTrades `Next-Action` malformed-POST rejection returns 400;
  the valid `/api/health` endpoint and DizyChat `/version` were checked.
  Public-site access-event logging was added with request headers/URI
  removed from structured log output. Do not infer a visitor's identity or
  an attack from a log event.
- The deployed DizyTrades checkout was checked at
  `0ae0bd1ec5f75dec8164d19d0f7fab86366d6ae6`, with Next.js
  `16.3.6`. A separate DizyChat checkout was checked at
  `3128460815da164b7f4d8f26b08856795e22c3b5` before its subsequent
  documentation/audit-test-only merge; see
  [DizyChat's own maintenance runbook](https://github.com/DizygoticCode/dizychat-server/blob/main/docs/SELF_HOSTED_MAINTENANCE.md)
  for its later checkpoint.
- `ssh.socket`, `caddy`, `dizytrades`, `dizychat`, and `mongod`
  each returned `active` after the package upgrades. The DizyTrades
  health response identified `mode: test` and `liveTradingEnabled: false`.
  This **does not** attest to the state of protected exchange credentials,
  exchange-write authority, restore readiness or an authenticated UI flow.
- MongoDB standalone server was upgraded from `8.0.29` to `8.0.32`
  under a DizyChat maintenance window. The new protected
  `mongodump --gzip --archive` file was checked with
  `mongorestore --dryRun --gzip --archive`, and MongoDB `ping` returned
  `ok: 1`. A dry run is **not** a verified full restore.
- System Node.js remains `22.23.1` and `sudo apt-mark hold nodejs`
  is in effect. DizyTrades `package.json` requires **exactly**
  `22.23.1`; the available `22.23.3` NodeSource package was
  deliberately not installed. Change the engine constraint and prove
  CI/build/runtime compatibility **before** coordinating an APT unhold,
  Node upgrade and new application build.

An earlier 27 September observation had Next.js `16.3.3` and no DizyTrades
access logging; it is historical, not the 28 September host snapshot.

## Caddy — staged, reversible, and limited to DizyTrades

The illustrative [public-site fragment](../deploy/caddy/dizytrades-public.Caddyfile)
corresponds only to the existing `dizytrades.tech, www.dizytrades.tech`
block. It is **not** a complete Caddyfile: preserve all DizyChat,
LiveKit, redirect and LAN blocks exactly as deployed. Review paths before
logging: even a URL path can hold identifiers. Headers and query strings
are removed from the host's filtered structured logging output; never record request bodies,
cookies or `Next-Action` values. Journald's size/retention policy belongs
to the host.

On the host, take a timestamped backup of `/etc/caddy/Caddyfile`, make
only the reviewed DizyTrades-block substitution, run
`sudo caddy validate --config /etc/caddy/Caddyfile` and only after success
use `sudo systemctl reload caddy`. Keep the backup for rollback.
Neither application requires restarting for the Caddy-only configuration.
Test GET `/api/health`, browser navigation, authenticated forms, and
real Socket.IO room join. Observe
`sudo journalctl -u caddy --since '5 minutes ago' -o cat --no-pager`.
Do not copy client IPs, tokens or query parameters into public reports.

The matcher returns HTTP 400 **only** to POSTs with a present
`Next-Action` header between 1 and 9 characters. It is a narrow
noise-reduction measure, not proof of compromise and not a substitute
for patching Next.js. Never block every POST or every Server Action.
Because the original incident predates access logging, its source IP
cannot be reconstructed from the provided evidence.

## Deployment identity and safe maintenance

Do not use `git pull main` as an implicit deploy. Confirm an exact tested
commit SHA, back up durable state, retain rollback artifacts, and use the
local operator deployment procedure. Check `/api/health` plus a browser
smoke test before reporting success. Keep
`LIVE_TRADING_ENABLED=false` and
`MEXC_WRITE_PROVIDER_ENABLED=false` at every step.
A Next.js version change requires an atomic rebuild and deployment of the
matching `.next/standalone` and `.next/static`; editing just
`node_modules` does not update a running server.

## Read-only DizyFlow memory investigation

Run the dependency-free tool against the combined monitor log without
restarting services:

`node scripts/dizyflow-memory-report.mjs /home/dizy/dizy-live-monitor.log`

It reads the file sequentially and keeps at most 1,000 numeric snapshots;
no request bodies, tokens or chat content are printed. It reports RSS and
heap first/last/min/max plus collector/subscriber peaks. The 28 September report of the **last 1,000 complete snapshots** returned
RSS first/last/min/max of **763 / 344 / 311 / 2,228 MB** and heap
**383 / 215 / 184 / 2,092 MB**. Collector count ranged 2–3 and subscriber
count 0–1. A separate, recent five-reading journal window showed RSS
396–403 MB and heap 240–278 MB with two collectors holding 1,800 samples
each for BTC_USDT and ETH_USDT. The summary tool does not attach timestamps
or process identities, so do **not** treat the end values of the two
observation windows as simultaneous. The large transient peak remains
unexplained; neither these extrema nor the later fall establish a sustained
leak or prove it cannot recur. Repeat the report at comparable
loads; correlate rising post-idle RSS and heap with collectors,
subscribers, archive growth, process uptime, GC and total system memory.
A synthetic capacity harness already exists in
`scripts/dizyflow-capacity-harness.mjs`; it is not a substitute for
monitoring the live process. Do not increase production heap limits or
change collector retention without evidence and an independent review.

## OS update, runtime pin and backup guardrails

The operator upgraded Netplan and firmware in reviewed batches, checked
`sudo netplan generate` without applying a new network configuration, and
verified service activity. **Do not remotely run `netplan apply` blindly**:
a changed network definition can remove SSH access. Validate first and use a
timed rollback/console recovery plan for any real network change. Preserve
the timestamped `/etc/netplan` and `/etc/caddy/Caddyfile` backups.

Before MongoDB maintenance, quiesce application writes and produce a
protected, fresh full `mongodump` archive; inspect its file permissions
and run a dry-run restore. A full restore must be rehearsed separately in
an isolated target before calling recovery verified. Do not put database
archives, credentials, host environment files or access logs in Git.

Avoid indiscriminate `apt autoremove`: Ubuntu proposed
`libfwupd2`, `libgusb2` and `libnss3-tools` as removable, but
nothing in this maintenance verified that removal was safe for all
operations. Node.js's APT hold is intentional, not an unfinished automatic
update. Document and review any future unhold.

## Production verification that GitHub cannot perform

A maintainer with access to dizyserver must verify the actual Caddy
configuration, Caddy access events, DizyTrades and DizyChat deployed
commit SHAs, persisted state/backup integrity, DizyChat
`SOCKET_IO_CORS_ORIGINS`, and the app health/smoke checks. GitHub
PRs and green CI alone do not make changes live.
