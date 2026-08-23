import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/dizy/market/route.ts";
import { DIZY_MINT } from "../app/dizy/token-config.ts";

const jsonResponse = (value) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

test("DIZY market rejects invalid ticker prices and falls back to canonical OHLC", async () => {
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 1000);
  let tickerPrice = null;

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;

    if (url.includes("/simple/networks/solana/token_price/")) {
      return jsonResponse({
        data: {
          attributes: {
            token_prices: {
              [DIZY_MINT]: tickerPrice,
            },
          },
        },
      });
    }

    if (url.includes("/ohlcv/hour")) {
      return jsonResponse({
        data: {
          attributes: {
            ohlcv_list: [
              [now - 7_200, 0.008, 0.008, 0.008, 0.008, 1],
              [now - 3_600, 0.0087, 0.0087, 0.0087, 0.0087, 1],
            ],
          },
        },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    for (const invalidTicker of [null, undefined, "", "   ", 0, "0", -1]) {
      tickerPrice = invalidTicker;
      const response = await GET();
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.status, "ok");
      assert.equal(payload.priceUsd, 0.0087);
      assert.notEqual(payload.change24hPct, -100);
      assert.equal(payload.points.at(-1)?.close, 0.0087);
    }

    tickerPrice = "0.0091";
    const response = await GET();
    const payload = await response.json();
    assert.equal(payload.priceUsd, 0.0091);
    assert.equal(payload.points.at(-1)?.close, 0.0091);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
