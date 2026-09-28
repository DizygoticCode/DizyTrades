# DizyTrades mobile install foundation (28 September 2026)

## What this slice does

The Next.js App Router serves a same-origin manifest at `/manifest.webmanifest` and advertises it from public pages. Launching the home-screen shortcut opens the existing HTTPS DizyTrades web app on the public landing page. A stable app identity (`id: /`) allows the launch URL to evolve independently. The manifest reuses the existing DizyTrades SVG mark, and a generated-icon route renders 192px/512px PNG variants and a 512px maskable variant from the same vector geometry. An Apple touch icon is separately advertised from root metadata.

This is **only the first PWA foundation slice**, not a claim of complete mobile installability: reviewed 192×192 and 512×512 raster icon fallbacks and a maskable icon, Android Chrome and iOS Home Screen installation, safe-area/keyboard/terminal-touch regressions, and cold-start/upgrade checks remain outstanding. Browser-specific installation affordances may vary until these are complete.

## Security and offline scope

- No service worker or offline application cache is registered by this change. Do **not** cache authenticated pages, market/account responses, sessions, execution controls or order-related requests for offline use.
- Standalone display mode does not confer permissions, keep users signed in or enable exchange writes. All server-side auth, CSRF, roles and trading gates remain authoritative.
- The global viewport already includes `viewportFit: cover`; installed-mode chart/toolbar changes belong to the responsive UI audit.
- Any Capacitor Android wrapper requires separately reviewed trusted origin, navigation, cookies/session/MFA and external-link policies. DizyChat's downloadable static bundle updater cannot be transplanted into a server-rendered Next.js app as-is.
- Live exchange execution remains disabled. Do not activate credentials, change execution flags or deploy an APK in this slice.

## Validation

Run `npm ci`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` on the pinned Node runtime. The manifest has focused deterministic and Chromium smoke tests. Phone installation remains an explicit acceptance requirement, not a CI assertion.

Tracking: [mobile scope #378](https://github.com/DizygoticCode/DizyTrades/issues/378) and [UI/CSS audit #377](https://github.com/DizygoticCode/DizyTrades/issues/377).
