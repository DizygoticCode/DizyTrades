import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const custody = readFileSync("app/lib/credential-custody/index.ts", "utf8");
const execution = readdirSync("app/lib/execution", { recursive: true }).filter((name) => String(name).endsWith(".ts"))
  .map((name) => readFileSync(`app/lib/execution/${name}`, "utf8")).join("\n");

test("custody stays server-only, networkless, signerless, and disconnected from execution", () => {
  assert.match(custody, /^import "server-only";/);
  for (const forbidden of ["use client", "fetch(", "mexc-private", "execution/", "NEXT_PUBLIC_", "signRequest", "placeOrder", "cancelOrder", "amendOrder"])
    assert.equal(custody.includes(forbidden), false, forbidden);
  assert.equal(execution.includes("credential-custody"), false);
});
