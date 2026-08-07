import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("app/lib/market/use-mexc-realtime.ts", "utf8");

test("browser futures realtime proves subscriptions before reporting LIVE", () => {
  assert.match(source, /MEXC_FUTURES_PUBLIC_WS_URL\s*=\s*"wss:\/\/contract\.mexc\.com\/edge"/);
  assert.match(source, /MEXC_FUTURES_SUBSCRIPTION_CONFIRM_MS\s*=\s*10_000/);
  assert.match(source, /confirmedSubscriptions\.has\("rs\.sub\.kline"\)/);
  assert.match(source, /confirmedSubscriptions\.has\("rs\.sub\.deal"\)/);
  assert.match(source, /envelope\.channel === "rs\.error"/);

  const confirmation = source.slice(
    source.indexOf("const confirmFeed = () =>"),
    source.indexOf("const reconnect = () =>"),
  );
  assert.match(confirmation, /attempt = 0/);
  assert.match(confirmation, /onStatus\("live"\)/);
  assert.match(confirmation, /if \(recovered\) callbacks\.current\.onResync\(\)/);

  const openHandler = source.slice(
    source.indexOf("current.onopen = () =>"),
    source.indexOf("current.onmessage = async"),
  );
  assert.doesNotMatch(openHandler, /attempt = 0/);
  assert.doesNotMatch(openHandler, /callbacks\.current\.onStatus\("live"\)/);
  assert.match(openHandler, /MEXC_FUTURES_SUBSCRIPTION_CONFIRM_MS/);
});

test("heartbeat proves transport health without masking a failed market subscription", () => {
  const pongBlock = source.slice(
    source.indexOf("// Pong proves the transport is alive"),
    source.indexOf('if (envelope.channel === "rs.error")'),
  );
  assert.match(pongBlock, /envelope\.channel === "pong"/);
  assert.match(pongBlock, /return;/);
  assert.doesNotMatch(pongBlock, /onStatus\("live"\)/);

  const errorBlock = source.slice(
    source.indexOf('if (envelope.channel === "rs.error")'),
    source.indexOf("const acknowledgement = subscriptionChannel"),
  );
  assert.match(errorBlock, /onStatus\("delayed"\)/);
  assert.match(errorBlock, /reconnect\(\)/);
});
