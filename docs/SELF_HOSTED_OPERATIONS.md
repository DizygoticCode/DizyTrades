# Self-hosted DizyTrades operations (27 September 2026)

## What has actually been observed

The host-reported Caddyfile routes public `dizytrades.tech` to
`127.0.0.1:10000` and `dizychat.com` to `127.0.0.1:10001`,
with a separate LiveKit proxy. DizyTrades and DizyChat systemd services
were reported active. The installed Next.js was 16.3.3 at that observation.
The public DizyTrades Caddy site had no HTTP access logging. None of those
observations establishes the current deployed Git SHA, the state of protected
exchange credentials, or whether any requests were attacks.

## Caddy — staged, reversible, and limited to DizyTrades

The sample [public-site replacement](../deploy/caddy/dizytrades-public.Caddyfile)
corresponds only to the existing `dizytrades.tech, www.dizytrades.tech`
block. It is **not** a complete Caddyfile: preserve all DizyChat,
LiveKit, redirect and LAN blocks exactly as deployed. Review paths before
logging: even a URL path can hold identifiers. Headers and query strings
are removed from the proposed logging output; never record request bodies,
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
heap first/last/min/max plus collector/subscriber peaks. A single 763 MB
RSS sample is **not** evidence of a leak. Repeat the report at comparable
loads; correlate rising post-idle RSS and heap with collectors,
subscribers, archive growth, process uptime, GC and total system memory.
A synthetic capacity harness already exists in
`scripts/dizyflow-capacity-harness.mjs`; it is not a substitute for
monitoring the live process. Do not increase production heap limits or
change collector retention without evidence and an independent review.

## Production verification that GitHub cannot perform

A maintainer with access to dizyserver must verify the actual Caddy
configuration, Caddy access events, DizyTrades and DizyChat deployed
commit SHAs, persisted state/backup integrity, DizyChat
`SOCKET_IO_CORS_ORIGINS`, and the app health/smoke checks. GitHub
PRs and green CI alone do not make changes live.
