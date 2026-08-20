import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [layout, controller, css] = await Promise.all([
  readFile("app/layout.tsx", "utf8"),
  readFile("app/mobile-terminal-density.tsx", "utf8"),
  readFile("app/mobile-terminal-density.css", "utf8"),
]);

test("mobile density controller is mounted without replacing the terminal component", () => {
  assert.match(layout, /import \{ MobileTerminalDensity \} from "\.\/mobile-terminal-density";/);
  assert.match(layout, /<MobileTerminalDensity \/>/);
  assert.match(layout, /import "\.\/mobile-terminal-density\.css";/);
  assert.ok(
    layout.indexOf('import "./mobile-terminal-density.css";') <
      layout.indexOf('import "./terminal-responsive-mobile.css";'),
  );
});

test("phone density uses progressive disclosure over the real terminal controls", () => {
  assert.match(controller, /window\.matchMedia\("\(max-width: 760px\)"\)/);
  assert.match(controller, /\.terminal-shell \.terminal-primary-column/);
  assert.match(controller, /\.drawing-toolbar/);
  assert.match(controller, /\.signal-dock/);
  assert.match(controller, /#manual-paper-panel/);
  assert.match(controller, /button\[aria-label="Minimise Manual Paper"\]/);
  assert.match(controller, /\.replay-controls:not\(\.active\) button/);
  assert.match(controller, /aria-label="Compact terminal controls"/);
  assert.match(controller, /aria-controls="mobile-terminal-tools"[\s\S]*?Tools[\s\S]*?<\/button>/);
  assert.match(controller, /aria-pressed=\{snapshot\.paperExpanded\}[\s\S]*?Paper[\s\S]*?<\/button>/);
  assert.match(controller, /aria-pressed=\{snapshot\.replayActive\}[\s\S]*?Replay[\s\S]*?<\/button>/);
});

test("default phone chrome hides dense surfaces while keeping explicit reveal states", () => {
  assert.match(css, /data-mobile-density-tools="open"/);
  assert.match(css, /data-mobile-density-signal="open"/);
  assert.match(css, /not\(\[data-mobile-density-tools="open"\]\) \.drawing-toolbar \{\s*display: none !important;/s);
  assert.match(css, /not\(\[data-mobile-density-signal="open"\]\) \.signal-dock \{\s*display: none !important;/s);
  assert.match(css, /\.replay-controls:not\(\.active\) \{\s*display: none !important;/s);
  assert.match(css, /--dizy-product-nav-height: 44px !important;/);
  assert.match(css, /#manual-paper-panel:not\(:has\(aside\)\)/);
});
