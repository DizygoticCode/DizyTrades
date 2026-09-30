# DizyTrades mobile install foundation (28 September 2026)

## What this slice does

The Next.js App Router serves a same-origin manifest at `/manifest.webmanifest` and advertises it from public pages. Launching the home-screen shortcut opens the existing HTTPS DizyTrades web app on the public landing page. A stable app identity (`id: /`) allows the launch URL to evolve independently. The manifest reuses the existing DizyTrades SVG mark, and a generated-icon route renders 192px/512px PNG variants and a 512px maskable variant from the same vector geometry. An Apple touch icon is separately advertised from root metadata.

The icon metadata and raster endpoint coverage are an **installability foundation**, not a claim that every phone offers an installation prompt. Actual Android Chrome and iOS Home Screen installation, mask-safe icon rendering, safe-area/keyboard/terminal-touch regressions and cold-start/upgrade checks remain outstanding. Browser-specific installation affordances may vary until these are complete.

## Repository acceptance checkpoint — 30 September 2026

The repository-side PWA prerequisites are now covered: the scoped same-origin manifest, 192×192 and 512×512 PNG icons, a 512×512 maskable icon, Apple touch icon metadata, standalone display mode, device-width/cover viewport metadata, and the deliberate no-service-worker protected-offline boundary all have deterministic and/or Chromium regression coverage. The responsive terminal audit has also been extended under #377 to exercise real layer toggles and drawing controls before the remaining physical-device pass.

What CI still cannot certify is the browser/OS install affordance and physical-device behavior. Use [PWA_DEVICE_ACCEPTANCE.md](PWA_DEVICE_ACCEPTANCE.md) for that final acceptance. A successful device PWA check does **not** approve a TWA, Capacitor shell, APK, exchange-write activation or native bridge.

## Security and offline scope

- No service worker or offline application cache is registered by this change. Do **not** cache authenticated pages, market/account responses, sessions, execution controls or order-related requests for offline use.
- Standalone display mode does not confer permissions, keep users signed in or enable exchange writes. All server-side auth, CSRF, roles and trading gates remain authoritative.
- The global viewport already includes `viewportFit: cover`; installed-mode chart/toolbar changes belong to the responsive UI audit.
- Any Capacitor Android wrapper requires separately reviewed trusted origin, navigation, cookies/session/MFA and external-link policies. DizyChat's downloadable static bundle updater cannot be transplanted into a server-rendered Next.js app as-is.
- Live exchange execution remains disabled. Do not activate credentials, change execution flags or deploy an APK in this slice.

## Validation

Run `npm ci`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` on the pinned Node runtime. The manifest and raster routes have focused deterministic and Chromium smoke tests (PNG signature, declared dimensions and Apple icon). Phone installation remains an explicit acceptance requirement, not a CI assertion.

Native wrapper options, trust boundaries and release gates are evaluated separately in [MOBILE_NATIVE_THREAT_MODEL.md](MOBILE_NATIVE_THREAT_MODEL.md). That review is design-only and does not approve an APK.

Tracking: [mobile scope #378](https://github.com/DizygoticCode/DizyTrades/issues/378) and [UI/CSS audit #377](https://github.com/DizygoticCode/DizyTrades/issues/377).
