import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const text = (path) => readFileSync(join(root, path), "utf8");

test("production execution idempotency authority is durable SQLite, not a process-local Map", () => {
  const service = text("app/lib/execution/internal/service.ts");
  const composition = text("app/lib/execution/internal/composition.ts");
  const store = text("app/lib/execution/internal/state-store.ts");

  assert.doesNotMatch(service, /new Map\s*</);
  assert.match(service, /stateStore\.claim\(/);
  assert.match(service, /stateStore\.complete\(/);
  assert.match(composition, /createProductionExecutionStateStore\(\)/);
  assert.match(store, /from "node:sqlite"/);
  assert.match(store, /execution-state\.sqlite/);
  assert.match(store, /PRAGMA journal_mode=WAL/);
  assert.match(store, /PRAGMA synchronous=FULL/);
  assert.match(store, /PRIMARY KEY\(user_id, account_id, idempotency_key\)/);
  assert.match(store, /record_state IN \('processing','complete'\)/);
  assert.match(store, /CHECK\(executed=0\)/);
});

test("durable execution state remains secret-free and disconnected from exchange writes", () => {
  const store = text("app/lib/execution/internal/state-store.ts");
  assert.doesNotMatch(store, /credential-(?:custody|provisioning)|mexc-private|requestMexc|decryptCredential/i);
  assert.doesNotMatch(store, /\bfetch\s*\(|axios|https?:\/\/|createHmac|sign(?:er|ature)/i);
  assert.doesNotMatch(store, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(store, /\b(?:apiKey|apiSecret|password|totp|authorization|cookie|sessionToken)\b/i);
  assert.doesNotMatch(store, /submitted|acknowledged|reconciled|orderId|fillId|tradeId/i);
});

test("durable state does not weaken production disabled flags", () => {
  assert.match(text("render.yaml"), /- key: LIVE_TRADING_ENABLED\s+value: "false"/);
  assert.match(text(".env.example"), /^LIVE_TRADING_ENABLED=false$/m);
  const composition = text("app/lib/execution/internal/composition.ts");
  assert.match(composition, /const caller = verifyProductionExecutionCaller\(stableRequest\.callerAssertion\)/);
  assert.match(composition, /authenticateInternalCaller:\s*\(assertion\)\s*=>\s*caller/);
});
