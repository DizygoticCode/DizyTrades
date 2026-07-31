import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SCHOOL_DISPLAY_NAME } from "../app/lib/branding.ts";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
test("all intended public and protected routes exist", async () => {
  const routes = ["app/page.tsx", "app/explore/page.tsx", "app/login/page.tsx", "app/signup/page.tsx", "app/school/page.tsx", "app/dex/page.tsx", "app/not-found.tsx", "app/terminal/page.tsx"];
  await Promise.all(routes.map(source));
  assert.match(await source("app/terminal/page.tsx"), /requireUser\(\)/);
  for (const route of routes.filter((route) => !route.includes("terminal"))) assert.doesNotMatch(await source(route), /requireUser\(\)/);
});
test("landing calls to action target the public route map", async () => {
  const page = await source("app/marketing/marketing-page.tsx");
  for (const target of ["/explore", "/signup", "/login", "/school", "/dex"]) assert.match(page, new RegExp(`href=\\"${target}\\"`));
  for (const product of ["DizyCharts", "DizySignals", "DizyFlow", "DizyDEX", "DizyPaper", "DizyTrade"]) assert.match(page, new RegExp(product));
  assert.equal(SCHOOL_DISPLAY_NAME, "Dizy Learing Center");
  assert.match(page, /SCHOOL_DISPLAY_NAME/);
  assert.match(page, /href="\/school"/);
});
test("account routes enter the protected terminal and logout stays on the public origin", async () => {
  assert.match(await source("app/login/login-form.tsx"), /router\.replace\("\/terminal"\)/);
  assert.match(await source("app/signup/signup-form.tsx"), /router\.replace\("\/terminal"\)/);
  assert.match(await source("app/login/page.tsx"), /title:\s*"Sign In \| DizyTrades"/);
  assert.match(await source("app/signup/page.tsx"), /title:\s*"Create Account \| DizyTrades"/);
  const logoutRoute = await source("app/api/auth/logout/route.ts");
  assert.match(logoutRoute, /(?:status:\s*303|NextResponse\.redirect\([\s\S]*?,\s*303\s*\))/, "logout must use a 303 redirect");
  assert.match(logoutRoute, /(?:Location:\s*["']\/login["']|new URL\(\s*["']\/login["'],\s*request\.url\s*\))/, "logout must redirect to /login");
  assert.match(logoutRoute, /maxAge:\s*0/, "logout must expire the session cookie");
  assert.doesNotMatch(logoutRoute, /0\.0\.0\.0/, "logout must never redirect to a development host");
  assert.match(await source("app/lib/auth.ts"), /SESSION_COOKIE\s*=\s*["']dizytrades_session["']/);
});
test("developer links are safely isolated external links", async () => {
  const files = await Promise.all(["app/marketing/marketing-page.tsx", "app/marketing/site-header.tsx", "app/marketing/public-route.tsx"].map(source));
  const links = [...files.join("\n").matchAll(/<a[^>]+href="https:\/\/github\.com\/DizygoticCode\/DizyTrades[^>]*>/g)].map((match) => match[0]);
  assert.ok(links.length >= 7);
  for (const link of links) { assert.match(link, /target="_blank"/); assert.match(link, /rel="noopener noreferrer"/); }
});
test("public view-only terminal launches a temporary restricted viewer session", async () => {
  const explore = await source("app/explore/page.tsx");
  const launcher = await source("app/explore/viewer-launcher.tsx");
  assert.match(explore, /ViewerLauncher/);
  assert.doesNotMatch(explore, /currentUser|requireUser|TradingTerminal/);
  assert.match(explore, /temporary read-only viewer session/);
  assert.match(launcher, /fetch\("\/api\/auth\/viewer",\s*\{\s*method:\s*"POST"\s*\}\)/);
  assert.match(launcher, /router\.replace\("\/terminal"\)/);
  assert.match(launcher, /No profile, exchange credentials or live-order route is used/);
  assert.match(launcher, /Live execution remains disabled/);
  for (const route of ["app/api/profile/route.ts", "app/api/paper/route.ts", "app/api/manual-paper/route.ts", "app/api/chart-workspace/route.ts"]) assert.match(await source(route), /viewer[\s\S]*403|403[\s\S]*viewer/i);
});
test("public navigation labels and fallback routes are explicit", async () => {
  const nav = await source("app/marketing/site-header.tsx");
  const notFound = await source("app/not-found.tsx");
  assert.match(nav, /View-Only Terminal/);
  for (const target of ["/", "/explore", "/school"]) assert.match(notFound, new RegExp(`href=\\"${target}\\"`));
  assert.match(notFound, /earlier DizyTrades preview/);
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
