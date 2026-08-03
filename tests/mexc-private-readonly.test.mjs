import assert from "node:assert/strict";
import test from "node:test";

import {
  MEXC_CONTRACT_PRIVATE_BASE_URL,
  MEXC_PRIVATE_READ_ENDPOINTS,
  MexcPrivateReadOnlyError,
  buildMexcPrivateReadUrl,
  canonicalMexcPrivateGetParameters,
  classifyMexcPrivateFailure,
  mexcPrivateReadCapabilityManifest,
  mexcPrivateReadRequestTarget,
  requestMexcPrivateRead,
  signMexcPrivateReadRequest,
} from "../app/lib/mexc-private-readonly.ts";

const credentials = Object.freeze({
  apiKey: "test-api-key",
  apiSecret: "test-secret",
});

test("private capability manifest is GET-only and has no write capability", () => {
  const manifest = mexcPrivateReadCapabilityManifest();
  assert.equal(manifest.policyVersion, "mexc-private-readonly/1.0.0");
  assert.equal(manifest.baseOrigin, "https://contract.mexc.com");
  assert.deepEqual(manifest.methods, ["GET"]);
  assert.equal(manifest.writeCapability, false);
  assert.deepEqual(manifest.permissions, ["account-read", "trade-read"]);
  assert.ok(manifest.endpoints.length >= 5);
  for (const endpoint of manifest.endpoints) {
    assert.equal(endpoint.method, "GET");
    assert.ok(["account-read", "trade-read"].includes(endpoint.permission));
    assert.doesNotMatch(endpoint.path, /(?:submit|cancel|change_|order\/submit)/i);
  }
  assert.ok(MEXC_PRIVATE_READ_ENDPOINTS.every((endpoint) => endpoint.method === "GET"));
});

test("GET parameters are sorted and encoded for signing and transport", () => {
  assert.equal(
    canonicalMexcPrivateGetParameters({
      symbol: "BTC_USDT",
      page_num: 1,
      ignored: undefined,
      note: "a/b c",
    }),
    "note=a%2Fb%20c&page_num=1&symbol=BTC_USDT",
  );
  assert.equal(
    mexcPrivateReadRequestTarget({
      apiKey: "test-api-key",
      requestTimeMs: 1_700_000_000_000,
      query: "page_num=1&symbol=BTC_USDT",
    }),
    "test-api-key1700000000000page_num=1&symbol=BTC_USDT",
  );
});

test("private GET signature follows the documented HMAC target", () => {
  const headers = signMexcPrivateReadRequest({
    credentials,
    requestTimeMs: 1_700_000_000_000,
    query: "page_num=1&symbol=BTC_USDT",
    receiveWindowSeconds: 5,
  });
  assert.deepEqual(headers, {
    ApiKey: "test-api-key",
    "Request-Time": "1700000000000",
    Signature: "1c180ffa87474956312379744802927f0f6153574590f016b1c7c60abdef25c6",
    "Content-Type": "application/json",
    "Recv-Window": "5",
  });
  assert.equal(JSON.stringify(headers).includes(credentials.apiSecret), false);
  assert.throws(
    () =>
      signMexcPrivateReadRequest({
        credentials,
        requestTimeMs: 1_700_000_000_000,
        query: "",
        receiveWindowSeconds: 61,
      }),
    /between 1 and 60 seconds/i,
  );
});

test("endpoint builder accepts only declared read parameters and identities", () => {
  const assets = buildMexcPrivateReadUrl({ endpoint: "all-assets" });
  assert.equal(assets.url.href, `${MEXC_CONTRACT_PRIVATE_BASE_URL}/api/v1/private/account/assets`);
  assert.equal(assets.query, "");

  const asset = buildMexcPrivateReadUrl({
    endpoint: "single-asset",
    parameters: { currency: "USDT" },
  });
  assert.equal(
    asset.url.href,
    `${MEXC_CONTRACT_PRIVATE_BASE_URL}/api/v1/private/account/asset/USDT`,
  );
  assert.equal(asset.endpoint.permission, "account-read");

  const positions = buildMexcPrivateReadUrl({
    endpoint: "open-positions",
    parameters: { symbol: "BTC_USDT" },
  });
  assert.equal(
    positions.url.href,
    `${MEXC_CONTRACT_PRIVATE_BASE_URL}/api/v1/private/position/open_positions?symbol=BTC_USDT`,
  );
  assert.equal(positions.endpoint.permission, "trade-read");

  assert.throws(
    () =>
      buildMexcPrivateReadUrl({
        endpoint: "open-positions",
        parameters: { symbol: "../../order/submit" },
      }),
    MexcPrivateReadOnlyError,
  );
  assert.throws(
    () =>
      buildMexcPrivateReadUrl({
        endpoint: "all-assets",
        parameters: { method: "POST" },
      }),
    /not allowed/i,
  );
  assert.throws(
    () =>
      buildMexcPrivateReadUrl({
        endpoint: "single-asset",
        parameters: {},
      }),
    /required parameter/i,
  );
  assert.throws(
    () => buildMexcPrivateReadUrl({ endpoint: "order-submit" }),
    /not in the read-only allowlist/i,
  );
});

test("transport sends one signed no-store GET without a body or redirect", async () => {
  let observed = null;
  const result = await requestMexcPrivateRead(
    {
      endpoint: "open-positions",
      parameters: { symbol: "BTC_USDT" },
      credentials,
      requestTimeMs: 1_700_000_000_000,
    },
    {
      now: () => 1_700_000_000_123,
      fetch: async (url, init) => {
        observed = { url: String(url), init };
        return new Response(
          JSON.stringify({
            success: true,
            code: 0,
            data: [{ symbol: "BTC_USDT", holdVol: 2 }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  );

  assert.equal(
    observed.url,
    `${MEXC_CONTRACT_PRIVATE_BASE_URL}/api/v1/private/position/open_positions?symbol=BTC_USDT`,
  );
  assert.equal(observed.init.method, "GET");
  assert.equal(observed.init.cache, "no-store");
  assert.equal(observed.init.redirect, "error");
  assert.equal("body" in observed.init, false);
  assert.equal(observed.init.headers.ApiKey, credentials.apiKey);
  assert.equal(observed.init.headers["Request-Time"], "1700000000000");
  assert.equal("Recv-Window" in observed.init.headers, false);
  assert.match(observed.init.headers.Signature, /^[a-f0-9]{64}$/);
  assert.deepEqual(result, {
    endpoint: "open-positions",
    permission: "trade-read",
    requestTimeMs: 1_700_000_000_000,
    receivedAtMs: 1_700_000_000_123,
    data: [{ symbol: "BTC_USDT", holdVol: 2 }],
  });
  assert.equal(JSON.stringify(result).includes(credentials.apiKey), false);
  assert.equal(JSON.stringify(result).includes(credentials.apiSecret), false);
});

test("provider permission and authentication failures remain typed and sanitised", async () => {
  assert.equal(classifyMexcPrivateFailure(701), "account-read-permission-required");
  assert.equal(classifyMexcPrivateFailure(703), "trade-read-permission-required");
  assert.equal(classifyMexcPrivateFailure(704), "write-permission-required");
  assert.equal(classifyMexcPrivateFailure(406), "ip-whitelist");
  assert.equal(classifyMexcPrivateFailure(510), "rate-limit");

  await assert.rejects(
    () =>
      requestMexcPrivateRead(
        {
          endpoint: "all-assets",
          credentials,
          requestTimeMs: 1_700_000_000_000,
        },
        {
          fetch: async () =>
            new Response(
              JSON.stringify({
                success: false,
                code: 703,
                message: "Trade read permission required\nsecret=test-secret",
              }),
              { status: 200 },
            ),
        },
      ),
    (error) => {
      assert.ok(error instanceof MexcPrivateReadOnlyError);
      assert.equal(error.kind, "trade-read-permission-required");
      assert.equal(error.providerCode, 703);
      assert.equal(error.message.includes("\n"), false);
      assert.equal(error.message.length <= 240, true);
      assert.equal(error.message.includes(credentials.apiKey), false);
      return true;
    },
  );
});

test("invalid credentials, responses and timeouts fail without exposing secrets", async () => {
  await assert.rejects(
    () =>
      requestMexcPrivateRead(
        {
          endpoint: "all-assets",
          credentials: { apiKey: "", apiSecret: "" },
        },
        { fetch: async () => new Response("{}") },
      ),
    (error) =>
      error instanceof MexcPrivateReadOnlyError && error.kind === "authentication",
  );

  await assert.rejects(
    () =>
      requestMexcPrivateRead(
        {
          endpoint: "all-assets",
          credentials,
          requestTimeMs: 1_700_000_000_000,
        },
        { fetch: async () => new Response("not json", { status: 200 }) },
      ),
    (error) =>
      error instanceof MexcPrivateReadOnlyError &&
      error.kind === "invalid-response" &&
      !error.message.includes(credentials.apiSecret),
  );

  await assert.rejects(
    () =>
      requestMexcPrivateRead(
        {
          endpoint: "all-assets",
          credentials,
          requestTimeMs: 1_700_000_000_000,
          timeoutMs: 500,
        },
        {
          fetch: async (_url, init) =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              );
            }),
        },
      ),
    (error) =>
      error instanceof MexcPrivateReadOnlyError && error.kind === "timeout",
  );
});
