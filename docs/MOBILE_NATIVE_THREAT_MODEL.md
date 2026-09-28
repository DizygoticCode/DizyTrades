# DizyTrades Android wrapper threat model (28 September 2026)

Status: **design review only** under [mobile roadmap #378](https://github.com/DizygoticCode/DizyTrades/issues/378). No native shell, signing keys, Digital Asset Links, exchange execution, service worker, deployment or Android release are introduced by this document.

## Existing boundary and decision

DizyTrades is a server-rendered Next.js App Router application. Its current [manifest](../app/manifest.ts) provides install metadata and PNG/maskable/Apple icons; the [PWA foundation](MOBILE_INSTALL_FOUNDATION.md) deliberately registers **no offline service worker**. Pages, accounts, server actions, sessions, market feeds and paper-trading logic still depend on the live HTTPS server. The canonical self-hosted public origin for native feasibility is `https://dizytrades.tech`; verify the actual deployed origin and redirects before packaging.

**Current path: PWA first.** Validate Android Chrome installation and iOS Add to Home Screen on real devices, then chart/composer/keyboard, login/MFA, cookie, reconnect and offline/error behavior. Do not equate a successful Chromium manifest test with an installed working phone app.

**Potential Android follow-up: assess a Trusted Web Activity (TWA) before a WebView bridge.** TWA uses the user's browser for the actual site and does not give the host app direct access to its cookies or web storage. It requires origin-to-app ownership verification through Digital Asset Links. Verification failures can produce a Custom Tab instead of the intended fullscreen TWA. This is still a future decision, **not authorization to ship an APK**.

**Capacitor alternative: locally packaged bootstrap only, subject to further review.** A thin local shell could invoke narrowly reviewed HTTPS application routes, but a Next.js authenticated App Router cannot be copied into an offline static bundle. Capacitor documents `server.url` as a live-reload facility, and both `server.url` and `allowNavigation` as not intended for production. Do **not** package a production remote-WebView pointed at DizyTrades or broaden its navigation allowlist. Do not transplant DizyChat's static updater. The local shell is **not** a workaround for HTTPS, server authentication, CSRF, execution gates or a native security review.

Official references:
- [Capacitor configuration: `server.url` / `allowNavigation`](https://capacitorjs.com/docs/config)
- [Android Trusted Web Activities overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [Android TWA quick start and signing/asset-link verification](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2)
- [Android App Links: Digital Asset Links verification](https://developer.android.com/training/app-links/about)

## Assets, attackers and trust boundaries

| Asset / boundary | Threat to test | Required posture |
| --- | --- | --- |
| Server-owned session, role, MFA and CSRF state | Native wrapper accidentally bypasses web origin checks, leaks cookies or turns device login into elevated authorization | Server decides identity and permissions on every request; review same-site cookie behavior, native return navigation, MFA/recovery and logout in a real device. No hard-coded auth tokens or browser-to-native token copy. |
| Exchange read-only credentials and dormant write seam | Secrets or privileged trading methods are exposed through JS, a bridge, APK, log or deep link | Never embed MEXC secrets, environment files, signing logic or a general order bridge; `LIVE_TRADING_ENABLED=false` and `MEXC_WRITE_PROVIDER_ENABLED=false` remain mandatory. No execution activation as a mobile feature. |
| Web origin and inbound links | Forged/unverified links, redirects or hostile origins gain app treatment | For TWA, bind the exact HTTPS origin and release-signing certificate with Digital Asset Links. Do not treat a failed TWA verification as success; open untrusted/off-domain links in the normal browser. For packaged shells, deny unreviewed redirects and navigation. |
| Browser/native API bridge | XSS or linked third-party content gains filesystem, clipboard, notification or device capabilities | Prefer no native bridge for a read-only/paper first release. If proposed later, enumerate each plugin, permission, allowed origin and authorization check separately. Disable WebView debugging and cleartext/mixed content in release builds. |
| Cached account/market data | Offline or stale balances/signals look live; a worker stores authenticated responses or sessions | No indiscriminate service worker or HTML/API caching. Clearly show offline/stale status; fail closed for account, order and control data. Never queue/replay writes on reconnection. |
| Build, release and key custody | Debug signature, substituted APK or a mismatch between manifest and website establishes incorrect trust | Protect release key, attest exact artifact/commit and Android signature; test the *installed release-signed build*. If TWA is approved, publish `/.well-known/assetlinks.json` with the actual app-signing fingerprint only after signing ownership review. |
| Device and network state | App resumes with expired/revoked identity; stale chart implies current price | On cold start/resume/reconnect, revalidate the server session, subscriptions and market freshness; respect server-side bans, role changes, revocation and disabled live mode. |

Native app status is **not** proof of account possession or authority. Client device integrity, browser state and the site's JavaScript are not trusted sources of permission or executable trading intent.

## Acceptance gates before an Android prototype

1. **Complete the existing PWA and responsive checks (#377/#378):** portrait and landscape, zoom/accessibility, touch hit targets, chart gestures/overlays, soft keyboard and safe areas, install/launch/relaunch, maintenance page, offline banner, expired session and reconnect. Test with fixture accounts only; no real balances, private history or credentials in screenshots.
2. **Choose a single architecture:** record whether TWA's browser-session model meets login/MFA and platform requirements. Confirm installed browser support (including the target Huawei device) rather than assuming every Android implementation supports TWA. A packaged Capacitor shell needs its **own** server-route, session/CSRF, cookie, navigation and bridge analysis.
3. **Constrain URL authority:** verify only the intended production HTTPS origin, app-link/deep-link paths and redirect behavior. Review external TradingView/market URLs as external navigation. For a proposed TWA, test Digital Asset Links on the *final signed artifact* and browser fallback when it is absent or invalid.
4. **Keep first-release scope read-only and paper-only:** no credential entry or custody in Android, no exchange write-key provisioning, no writer composition, no background order retry, no trading switch or "live" affordance. Server fail-closed gates stay independent of what the app displays.
5. **Separate approvals:** native architecture review, minimal Android permissions, release signing, reproducible CI and real-device regression evidence precede any signed APK/release. A production deployment, write-egress ceremony and microscopic exchange canary are **different operator-controlled gates**.

## Explicit non-goals / current evidence limits

This document is not a penetration test, proof of PWA installability, assertion that the host is at the latest repository commit, proof of offline support, or proof of exchange egress and credential custody. No Android project, `server.url`, native permissions, API route or exchange-write code is approved or changed here. Revisit this decision after the PWA's actual phone behavior has been recorded.
