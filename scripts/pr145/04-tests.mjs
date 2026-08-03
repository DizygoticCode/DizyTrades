import {readFile,writeFile} from "node:fs/promises";
await writeFile("tests/dizyflow-toast-layout.test.mjs",`import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, css, globals] = await Promise.all([
  readFile("app/dizyflow-toast-rail.tsx", "utf8"),
  readFile("app/dizyflow-toast-rail.module.css", "utf8"),
  readFile("app/globals.css", "utf8"),
]);

test("DizyFlow activity notification is a bounded floating overlay", () => {
  assert.match(component, /styles\\.rail/);
  assert.match(component, /styles\\.card/);
  assert.match(component, /DizyFlow activity/);
  assert.match(css, /position:\s*fixed\s*!important/);
  assert.match(css, /inline-size:\s*min\\(320px,\s*calc\\(100vw - 24px\\)\\)/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /min-block-size:\s*68px/);
  assert.match(globals, /\\.flow-toast-rail\\{position:fixed!important/);
  assert.doesNotMatch(globals, /\\.flow-toast-rail\\{position:static!important/);
});

test("toast placement and content cannot resize the terminal toolbar", () => {
  assert.match(globals, /\\.flow-toast-rail\\.top-left\\{left:18px!important/);
  assert.match(globals, /\\.flow-toast-rail\\.top-centre\\{left:50%!important/);
  assert.match(globals, /\\.flow-toast-rail\\.top-right\\{right:18px!important/);
  assert.doesNotMatch(css, /inline-size:\s*clamp\\(340px,\s*26vw,\s*440px\\)/);
  assert.match(css, /text-overflow:\s*ellipsis/);
  assert.match(css, /box-shadow:\s*0 14px 38px/);
});

test("floating activity toast remains accessible and dismissible", () => {
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-atomic="true"/);
  assert.match(component, /role="status"/);
  assert.match(component, /Open DizyFlow alert history/);
  assert.match(component, /Dismiss /);
  assert.match(css, /prefers-reduced-motion/);
});
`);
await writeFile("tests/dizybrain-beginner-ui.test.mjs",`import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {buildDizyBrainBeginnerOverview,DIZYBRAIN_DEFAULT_WIDTH,DIZYBRAIN_MIN_WIDTH} from "../app/lib/dizybrain-workspace.ts";

const snapshot={
  currentDirection:"BUY",marketBias:"Bullish",marketPhase:"Markup",activeConfluence:4,qualificationThreshold:3,qualified:false,confirmedSignal:null,
  explanation:{confidencePercent:80,rejectionReasons:["No direction-consistent signal exists on the current confirmed candle."]},
};

test("beginner overview separates market lean from actual setup readiness",()=>{
  const view=buildDizyBrainBeginnerOverview(snapshot,false);
  assert.equal(view.marketRead,"Bullish lean");
  assert.equal(view.actionState,"Watch");
  assert.equal(view.confidenceLabel,"Strong evidence");
  assert.equal(view.confidencePercent,80);
  assert.match(view.summary,/has not confirmed/);
  assert.deepEqual(view.reasons,["Bullish market bias","Markup structure phase","4 of 5 setup checks currently agree"]);
  const ready=buildDizyBrainBeginnerOverview({...snapshot,qualified:true,confirmedSignal:"BUY"},false);
  assert.equal(ready.actionState,"Setup ready");
  assert.match(ready.summary,/meets the current deterministic setup rules/);
});

test("Replay is clearly review evidence rather than a live setup",()=>{
  const view=buildDizyBrainBeginnerOverview(snapshot,true);
  assert.equal(view.marketRead,"Historical review");
  assert.equal(view.actionState,"Review mode");
  assert.equal(view.tone,"neutral");
  assert.match(view.summary,/not a live setup/);
});

test("DizyBrain defaults are larger and the source keeps intelligence behind detailed evidence",async()=>{
  assert.equal(DIZYBRAIN_MIN_WIDTH,340);
  assert.equal(DIZYBRAIN_DEFAULT_WIDTH,420);
  const [brain,css]=await Promise.all([readFile("app/dizybrain-shell.tsx","utf8"),readFile("app/globals.css","utf8")]);
  assert.match(brain,/Current market read/);
  assert.match(brain,/Why DizyBrain says that/);
  assert.match(brain,/What still matters/);
  assert.match(brain,/Advanced details/);
  assert.match(brain,/Detailed evidence/);
  assert.match(brain,/buildDizyBrainBeginnerOverview/);
  assert.match(css,/Beginner-first DizyBrain readability/);
  assert.match(css,/\\.brain-overview-state strong\\{[^}]*font-size:24px/);
  assert.match(css,/\\.brain-row\\{[^}]*font-size:11px/);
  assert.match(css,/\\.brain-nav button\\{[^}]*font-size:10px/);
});
`);
{
  const path="tests/browser/roadmap-smoke.spec.ts",source=await readFile(path,"utf8");
  const oldText='  await expect(page).toHaveURL(/\\/terminal$/);\n\n  await expect(page.getByRole("link", { name: /DizyScanner/ })).toBeVisible();';
  const newText='  await expect(page).toHaveURL(/\\/terminal$/);\n\n  const brainLauncher = page.getByRole("button", { name: /DizyBrain/ });\n  await expect(brainLauncher).toBeVisible();\n  await brainLauncher.click();\n  const brain = page.getByLabel("DizyBrain Analysis Workspace");\n  await expect(brain.getByText("Current market read", { exact: true })).toBeVisible();\n  await expect(brain.getByText(/Setup ready|Watch|Setup forming|No setup|Review mode/)).toBeVisible();\n  await expect(brain.getByText("Why DizyBrain says that", { exact: true })).toBeVisible();\n  await expect(brain.getByText("Detailed evidence", { exact: true })).toBeVisible();\n  await brain.getByRole("button", { name: "Close DizyBrain workspace" }).click();\n\n  await expect(page.getByRole("link", { name: /DizyScanner/ })).toBeVisible();';
  const count=source.split(oldText).length-1;if(count!==1)throw new Error("browser insertion: "+count);
  await writeFile(path,source.replace(oldText,newText));
}
