import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
test("all intended public and protected routes exist", async () => {
  const routes = ["app/page.tsx", "app/explore/page.tsx", "app/login/page.tsx", "app/signup/page.tsx", "app/school/page.tsx", "app/dex/page.tsx", "app/terminal/page.tsx"];
  await Promise.all(routes.map(source));
  assert.match(await source("app/terminal/page.tsx"), /requireUser\(\)/);
  for (const route of routes.filter((route) => !route.includes("terminal"))) assert.doesNotMatch(await source(route), /requireUser\(\)/);
});
test("landing calls to action target the public route map", async () => {
  const page = await source("app/marketing/marketing-page.tsx");
  for (const target of ["/explore", "/signup", "/login", "/school", "/dex"]) assert.match(page, new RegExp(`href=\\"${target}\\"`));
  for (const product of ["DizyCharts", "DizySignals", "DizyFlow", "DizyDEX", "DizySchool", "DizyPaper", "DizyTrade"]) assert.match(page, new RegExp(product));
});
test("login enters the protected terminal and logout stays on the public origin", async () => {
  assert.match(await source("app/login/login-form.tsx"), /router\.replace\("\/terminal"\)/);
  const logoutRoute = await source("app/api/auth/logout/route.ts");
  assert.match(
    logoutRoute,
    /(?:status:\s*303|NextResponse\.redirect\([\s\S]*?,\s*303\s*\))/,
    "logout must use a 303 redirect",
  );
  assert.match(
    logoutRoute,
    /(?:Location:\s*["']\/login["']|new URL\(\s*["']\/login["'],\s*request\.url\s*\))/,
    "logout must redirect to /login",
  );
  assert.match(
    logoutRoute,
    /maxAge:\s*0/,
    "logout must expire the session cookie",
  );
  assert.doesNotMatch(
    logoutRoute,
    /0\.0\.0\.0/,
    "logout must never redirect to a development host",
  );
  assert.match(await source("app/lib/auth.ts"), /SESSION_COOKIE\s*=\s*["']dizytrades_session["']/);
});
test("developer links are safely isolated external links", async () => {
  const files = await Promise.all(["app/marketing/marketing-page.tsx", "app/marketing/site-header.tsx", "app/marketing/public-route.tsx"].map(source));
  const links = [...files.join("\n").matchAll(/<a[^>]+href="https:\/\/github\.com\/DizygoticCode\/DizyTrades[^>]*>/g)].map((match) => match[0]);
  assert.ok(links.length >= 7);
  for (const link of links) { assert.match(link, /target="_blank"/); assert.match(link, /rel="noopener noreferrer"/); }
});
test("public view-only terminal has no network or user persistence path", async () => {
  const explore = await source("app/explore/page.tsx");
  assert.doesNotMatch(explore, /fetch\(|currentUser|requireUser|TradingTerminal|\/api\//);
  assert.match(explore, /does not load a user profile, write settings or execute paper orders/);
  for (const route of ["app/api/profile/route.ts", "app/api/paper/route.ts", "app/api/manual-paper/route.ts", "app/api/chart-workspace/route.ts"]) assert.match(await source(route), /viewer[\s\S]*403|403[\s\S]*viewer/i);
});
test("navigation is responsive and motion honours user preferences", async () => {
  const nav = await source("app/marketing/site-header.tsx");
  assert.match(nav, /aria-expanded=\{open\}/);
  assert.match(nav, /aria-controls="site-navigation"/);
  const css = await source("app/globals.css");
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /\.site-nav\.open/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
