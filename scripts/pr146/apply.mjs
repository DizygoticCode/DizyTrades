import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(oldText, newText);
}

const compactCss = `.rail {
  position: static !important;
  z-index: auto;
  top: auto !important;
  right: auto !important;
  left: auto !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  inline-size: clamp(228px, 18vw, 258px);
  min-inline-size: 228px;
  max-inline-size: 258px;
  block-size: 32px;
  min-block-size: 32px;
  flex: 0 1 258px;
  padding: 0;
  overflow: hidden;
  pointer-events: auto;
  transform: none !important;
}

.rail .card {
  display: grid;
  grid-template-columns: 3px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  inline-size: 100%;
  min-inline-size: 0;
  block-size: 30px;
  min-block-size: 30px;
  padding: 3px 5px;
  overflow: hidden;
  border: 1px solid rgba(133, 151, 184, 0.3);
  border-radius: 7px;
  background: rgba(11, 15, 25, 0.92);
  box-shadow: none;
  pointer-events: auto;
  animation: toast-in 140ms ease-out;
}

.rail .card > i {
  inline-size: 3px;
  block-size: 100%;
  min-block-size: 20px;
  border-radius: 999px;
}

.message {
  display: flex !important;
  min-inline-size: 0;
  flex-direction: column !important;
  align-items: flex-start !important;
  gap: 0 !important;
}

.eyebrow {
  display: none;
}

.title,
.detail {
  max-inline-size: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title {
  color: #edf1fa;
  font-size: 10px;
  line-height: 1.05;
}

.detail {
  color: #9da8bb !important;
  font-size: 8px;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  align-items: center;
  gap: 1px;
}

.history,
.dismiss {
  min-inline-size: 24px;
  min-block-size: 24px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #9ba6b9;
  cursor: pointer;
}

.history {
  font-size: 7px;
}

.dismiss {
  padding: 0;
  font-size: 15px;
}

.history:hover,
.history:focus-visible,
.dismiss:hover,
.dismiss:focus-visible {
  background: rgba(122, 100, 217, 0.16);
  color: #eee8ff;
  outline: 1px solid rgba(160, 137, 255, 0.55);
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 900px) {
  .rail {
    inline-size: min(240px, calc(100vw - 16px));
    min-inline-size: 0;
    max-inline-size: 240px;
    flex-basis: 220px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rail .card { animation: none; }
}
`;
await writeFile("app/dizyflow-toast-rail.module.css", compactCss);

{
  const path = "app/globals.css";
  const source = await readFile(path, "utf8");
  const oldText = ".flow-toast-rail{position:fixed!important;z-index:59;top:74px;right:18px!important;left:auto!important;min-height:0;max-height:none;display:block!important;padding:0;overflow:visible;pointer-events:none;transform:none!important}.flow-toast-rail.top-left{left:18px!important;right:auto!important}.flow-toast-rail.top-centre{left:50%!important;right:auto!important;transform:translateX(-50%)!important}.flow-toast-rail.top-right{right:18px!important;left:auto!important}.flow-toast-rail article{pointer-events:auto}.flow-capturing{display:none}.flow-history{z-index:var(--layer-drawer)}";
  const newText = ".flow-toast-rail{position:static!important;z-index:auto;top:auto!important;right:auto!important;left:auto!important;min-height:32px;max-height:32px;flex:0 1 258px;display:grid!important;padding:0;overflow:hidden;pointer-events:auto;transform:none!important}.flow-toast-rail.top-left,.flow-toast-rail.top-centre,.flow-toast-rail.top-right{left:auto!important;right:auto!important;transform:none!important}.flow-toast-rail article{pointer-events:auto}.flow-capturing{display:none}.flow-history{z-index:var(--layer-drawer)}";
  await writeFile(path, replaceOnce(source, oldText, newText, "toolbar toast override"));
}

await writeFile("tests/dizyflow-toast-layout.test.mjs", `import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, css, globals] = await Promise.all([
  readFile("app/dizyflow-toast-rail.tsx", "utf8"),
  readFile("app/dizyflow-toast-rail.module.css", "utf8"),
  readFile("app/globals.css", "utf8"),
]);

test("DizyFlow activity notification owns a compact reserved toolbar lane", () => {
  assert.match(component, /styles\\.rail/);
  assert.match(component, /styles\\.card/);
  assert.match(component, /DizyFlow activity/);
  assert.ok(css.includes("position: static !important;"));
  assert.ok(css.includes("inline-size: clamp(228px, 18vw, 258px);"));
  assert.ok(css.includes("min-block-size: 32px;"));
  assert.ok(css.includes("block-size: 30px;"));
  assert.ok(globals.includes(".flow-toast-rail{position:static!important"));
  assert.ok(!globals.includes(".flow-toast-rail{position:fixed!important"));
});

test("toolbar toast cannot cover neighbouring controls", () => {
  assert.ok(globals.includes("top:auto!important"));
  assert.ok(globals.includes(".flow-toast-rail.top-left,.flow-toast-rail.top-centre,.flow-toast-rail.top-right{left:auto!important;right:auto!important;transform:none!important}"));
  assert.ok(css.includes("flex: 0 1 258px;"));
  assert.ok(css.includes("overflow: hidden;"));
  assert.ok(css.includes("text-overflow: ellipsis;"));
  assert.ok(css.includes("box-shadow: none;"));
  assert.ok(!css.includes("position: fixed"));
});

test("toolbar activity toast retains stable expiry and accessible controls", () => {
  assert.match(component, /const activeAlertId = activeAlert\\?\\.id \\?\\? null/);
  assert.match(component, /\\[activeAlertId, paused, settings\\.alerts\\.durationMs\\]/);
  assert.doesNotMatch(component, /\\[paused, settings\\.alerts\\.durationMs, visible\\]/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-atomic="true"/);
  assert.match(component, /role="status"/);
  assert.match(component, /Open DizyFlow alert history/);
  assert.match(component, /Dismiss /);
  assert.match(css, /prefers-reduced-motion/);
});
`);
