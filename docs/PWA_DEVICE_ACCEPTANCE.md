# DizyTrades PWA physical-device acceptance

Tracking: [mobile roadmap #378](https://github.com/DizygoticCode/DizyTrades/issues/378).

Repository/CI acceptance is complete for the current PWA-first scope. This checklist is intentionally limited to behavior that cannot be proved honestly by headless Chromium or source inspection.

## Android Chrome

Use the production HTTPS origin `https://dizytrades.tech` and a viewer/test account rather than an account containing private exchange data.

1. Open the site in current Chrome and confirm the browser offers its normal install/add-to-home-screen flow.
2. Install DizyTrades. Confirm the launcher icon is the DIZY mark, is not visibly cropped by Android's mask, and the app label is DizyTrades.
3. Launch from the home-screen icon. Confirm it opens as the DizyTrades standalone app at the public landing page rather than an unrelated origin or blank/error page.
4. Close it fully and relaunch it. Then background/resume it once. Confirm navigation, session state and market freshness behave normally.
5. Open the view-only terminal in portrait and landscape. Pinch/pan/zoom the chart; open Tools; create/undo a drawing; toggle a few overlays; open Settings and DizyFlow/DOM. Confirm controls remain reachable and no page-level horizontal scrolling appears.
6. Focus search/text inputs to show the software keyboard. Confirm the focused field and primary action remain visible and the layout recovers when the keyboard closes.
7. Increase Chrome/Android text or page scaling if available and confirm long symbols/labels do not obscure required actions.
8. Disable networking while on a public page, then try a protected/account route. Confirm DizyTrades does not present a stale authenticated offline shell or imply that account/trading data is current. Restore networking and confirm recovery.
9. Confirm all visible trading/execution status remains test/paper/live-disabled. Installing the PWA must not expose or request exchange credentials.

## iPhone/iPad Home Screen

When an iOS/iPadOS device is available:

1. Open `https://dizytrades.tech` in Safari and use Add to Home Screen.
2. Confirm the Apple touch icon/name and launch from the new icon.
3. Repeat cold launch, background/resume, portrait/landscape, software-keyboard, chart gesture and offline/reconnect checks above.
4. Check safe-area/notch/home-indicator spacing and make sure fixed controls are not hidden behind browser/OS chrome.

## Pass/fail record

For each device record only: device model, OS/browser version, installed/not installed, pass/fail for launch/relaunch, portrait/landscape, keyboard, chart touch/drawings, safe areas, offline/reconnect, and icon appearance. Do not attach screenshots containing private balances, email addresses, recovery data, credentials or execution-control secrets.

If all applicable checks pass, #378's **PWA-first phase** can be closed. TWA/Capacitor/native signing remains a separate future product decision; it is not required merely to call the web app's PWA phase complete.
