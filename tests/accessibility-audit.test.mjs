import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("protected workspaces mount one shared accessibility foundation", async () => {
  const [mounted, foundation, layout] = await Promise.all([
    readFile("app/command-palette-mounted.tsx", "utf8"),
    readFile("app/accessibility-foundation.tsx", "utf8"),
    readFile("app/layout.tsx", "utf8"),
  ]);
  assert.match(mounted, /<AccessibilityFoundation \/>/);
  assert.match(foundation, /Skip to main content/);
  assert.match(foundation, /function focusMainContent\(\)/);
  assert.match(foundation, /explicit user activation/);
  assert.match(foundation, /main\.focus\(\{ preventScroll: true \}\)/);
  assert.match(foundation, /main\.addEventListener\("blur", restore/);
  assert.match(foundation, /onClick=\{\(event\) => \{[\s\S]*focusMainContent\(\)/);

  const effectStart = foundation.indexOf("useEffect(() => {");
  const effectEnd = foundation.indexOf("  }, [active, pathname]);", effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart, "accessibility effect should be discoverable");
  const effectBody = foundation.slice(effectStart, effectEnd);
  assert.doesNotMatch(effectBody, /main\.id = "main-content"/);
  assert.doesNotMatch(effectBody, /main\.tabIndex = -1/);

  assert.match(foundation, /\[role="dialog"\]\[aria-modal="true"\]/);
  assert.match(foundation, /event\.key !== "Tab"/);
  assert.match(foundation, /function restoreOpenerFocus\(element: HTMLElement\)/);
  assert.match(foundation, /element\.focus\(\{ preventScroll: true \}\)/);
  assert.match(foundation, /restoreOpenerFocus\(restore\)/);
  assert.match(layout, /import "\.\/accessibility-audit\.css"/);
});

test("focus and reduced-motion styles remain explicit", async () => {
  const css = await readFile("app/accessibility-audit.css", "utf8");
  assert.match(css, /\.accessibility-skip-link:focus-visible/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration: 0\.01ms !important/);
  assert.match(css, /transition-duration: 0\.01ms !important/);
  assert.match(css, /scroll-behavior: auto !important/);
});
