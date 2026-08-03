# Independent Browser Accessibility Review

Status: completed for the active simulation-only beta in August 2026, subject to the pull request's full Chromium and repository validation gates.

This review extends the earlier focus-order and responsive audits with an independent Chromium accessibility-tree and DOM-structure pass across representative public and authenticated-viewer workspaces. It uses existing GitHub Actions and Playwright infrastructure only; no paid accessibility service or additional runtime infrastructure is required.

## Reviewed surfaces

Public routes:

- marketing home;
- login;
- signup;
- DizyAcademy;
- view-only exploration.

Authenticated viewer routes:

- terminal and embedded Manual Paper workspace;
- DizyScanner;
- DizyStructure;
- DizyPerformance;
- DizyJournal.

Shared interaction states:

- command palette and keyboard reference;
- modal focus containment and opener restoration;
- forced-colour mode;
- reduced-motion mode;
- onboarding hydration during browser navigation.

## Automated browser contract

The independent Chromium journey inspects both the rendered DOM and the computed accessibility tree. It rejects:

- more or fewer than one document `main` landmark;
- unnamed interactive accessibility-tree nodes;
- duplicate element IDs;
- broken `aria-labelledby` or `aria-describedby` references;
- expanded controls whose `aria-controls` target is absent;
- positive `tabindex` values;
- visible nested interactive controls;
- keyboard-reachable descendants hidden with `aria-hidden`;
- images without `alt` attributes;
- image-role SVGs without an accessible name;
- iframes without a title;
- modal backgrounds that remain keyboard or programmatically focusable;
- missing forced-colour focus outlines.

The signup honeypot remains intentionally hidden and `tabIndex=-1`; the audit distinguishes that anti-bot field from an accidentally hidden keyboard control.

## Findings corrected

### Modal background remained interactive

The shared modal foundation trapped `Tab` inside an `aria-modal` dialog, but the page behind the dialog remained available to pointer, programmatic-focus and some assistive-technology navigation.

The foundation now applies `inert` to background siblings along the active dialog's ancestor chain. It preserves any pre-existing inert state, supports portalled dialogs, restores the background when the modal closes and then returns focus to the opener.

### Manual Paper exposed a second main landmark

The terminal already owns the document's primary `main` landmark. The embedded Manual Paper positions, order-history and account workspace used another `main`, producing ambiguous landmark navigation.

The embedded workspace is now a server-rendered named `section`: `Manual Paper account workspace`. This keeps one document main while exposing the trading panel as a discoverable region without changing layout or simulation behaviour.

### Existing palette journey raced onboarding hydration

The older command-palette browser journey checked onboarding visibility only once. A late-hydrating onboarding dialog could then cover the palette trigger and create a flaky failure.

The journey now waits for the bounded onboarding appearance window, dismisses it when present and proves that the backdrop is gone before exercising palette navigation.

## Accepted boundaries

- Automated Chromium inspection is not a legal WCAG certification and does not replace periodic human testing with real screen readers and alternative input devices.
- Canvas chart content is not fully represented by the accessibility tree; adjacent controls, status text, diagnostics and keyboard workflows remain the accessible interaction boundary.
- The CI browser is Chromium. Cross-browser assistive-technology differences remain a manual-release consideration.
- The review covers representative public and viewer surfaces, not every transient market-data state or every owner-only destructive confirmation.
- Visual contrast is exercised through existing styles and forced-colour checks; this review does not introduce an external pixel-based contrast service.
- No market, strategy, simulator, Replay, storage or exchange-execution semantics are changed.
- Live trading remains disabled.

## Evidence

The pull request must pass:

- the independent accessibility-tree and DOM audit;
- the existing focus, responsive, command-palette and protected-route journeys;
- the complete Playwright Chromium suite;
- lint;
- the complete deterministic unit suite;
- the production build.
