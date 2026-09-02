import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DepthCollector,
  DEPTH_PUBLICATION_MS,
  DEPTH_TRANSPORT,
  MEXC_FUTURES_WS_URL,
  parseMexcFuturesWsUrl,
} from "../app/lib/order-flow/depth-collector.ts";
import { mexcPrivateReadCapabilityManifest } from "../app/lib/mexc-private-readonly.ts";

const currentWs = "wss://contract.mexc.com/edge";
const currentRest = "https://api.mexc.com";
const wrongWs = "wss://api.mexc.com/edge";
const retiredRest = "https://contract.mexc.com";

test("MEXC futures websocket origin is exact and safely configurable", () => {
  assert.equal(MEXC_FUTURES_WS_URL, currentWs);
  assert.equal(parseMexcFuturesWsUrl(undefined), currentWs);
  assert.equal(parseMexcFuturesWsUrl(`${currentWs}/`), currentWs);
  assert.equal(parseMexcFuturesWsUrl(wrongWs), currentWs);
  assert.equal(parseMexcFuturesWsUrl("https://contract.mexc.com/edge"), currentWs);
  assert.equal(parseMexcFuturesWsUrl("wss://example.com/edge"), currentWs);
  assert.equal(parseMexcFuturesWsUrl("wss://contract.mexc.com/ws"), currentWs);
});

test("DizyFlow opens the native futures websocket first with bounded publication", () => {
  let opened = null;
  let closed = false;
  const socket = {
    readyState: 0,
    addEventListener() {},
    send() {},
    close() {
      closed = true;
    },
  };
  const collector = new DepthCollector(
    "BTC_USDT",
    async () => new Response("{}", { status: 503 }),
    Date.now,
    (url) => {
      opened = url;
      return socket;
    },
    { transport: "ws" },
  );
  collector.start();
  assert.equal(opened, currentWs);
  assert.equal(DEPTH_TRANSPORT, "ws");
  assert.equal(DEPTH_PUBLICATION_MS, 125);
  collector.stop();
  assert.equal(closed, true);
});

test("owner private reads use current REST origin while websocket config remains separate", async () => {
  const manifest = mexcPrivateReadCapabilityManifest();
  const [privateSource, realtimeSource, environment, nextConfig] = await Promise.all([
    readFile("app/lib/mexc-private-readonly.ts", "utf8"),
    readFile("app/lib/market/use-mexc-realtime.ts", "utf8"),
    readFile(".env.example", "utf8"),
    readFile("next.config.ts", "utf8"),
  ]);

  assert.equal(manifest.baseOrigin, currentRest);
  assert.equal(privateSource.includes(`"${retiredRest}"`), false);
  assert.match(privateSource, /MEXC_FUTURES_PRIVATE_BASE_URL\s*=\s*"https:\/\/api\.mexc\.com"/);
  assert.match(realtimeSource, /MEXC_FUTURES_PUBLIC_WS_URL\s*=\s*"wss:\/\/contract\.mexc\.com\/edge"/);
  assert.match(environment, /^MEXC_FUTURES_REST_BASE_URL=https:\/\/api\.mexc\.com$/m);
  assert.match(environment, /^MEXC_FUTURES_WS_URL=wss:\/\/contract\.mexc\.com\/edge$/m);
  assert.match(environment, /^DIZYFLOW_DEPTH_TRANSPORT=ws$/m);
  assert.match(nextConfig, /wss:\/\/contract\.mexc\.com/);
  assert.equal(realtimeSource.includes(wrongWs), false);
});
