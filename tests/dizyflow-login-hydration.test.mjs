import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginFormPath = new URL("../app/login/login-form.tsx", import.meta.url);
const acceptancePath = new URL("../scripts/dizyflow-deployment-acceptance.mjs", import.meta.url);

test("login controls remain disabled until client hydration attaches their handlers", async () => {
  const source = await readFile(loginFormPath, "utf8");

  assert.match(source, /useEffect\(\(\) => setHydrated\(true\), \[\]\)/);
  assert.match(source, /const \[hydrated, setHydrated\] = useState\(false\)/);
  assert.match(source, /const interactive = hydrated && !loading/);
  assert.ok([...source.matchAll(/disabled=\{!interactive\}/g)].length >= 2);
  assert.match(source, /className="viewer-login"/);
  assert.match(source, /onClick=\{continueAsViewer\}/);
});

test("deployed acceptance observes the viewer endpoint before trusting terminal hydration", async () => {
  const source = await readFile(acceptancePath, "utf8");
  const listener = source.indexOf('page.on("response", observeTerminalResponse)');
  const click = source.indexOf("await viewerButton.click()");
  const navigation = source.indexOf("await page.waitForURL");

  assert.ok(listener >= 0);
  assert.ok(click > listener);
  assert.ok(navigation > click);
  assert.match(source, /pathname === "\/api\/auth\/viewer" && method === "POST"/);
  assert.match(source, /viewerEndpointStatus/);
  assert.doesNotMatch(source, /force:\s*true/);
});
