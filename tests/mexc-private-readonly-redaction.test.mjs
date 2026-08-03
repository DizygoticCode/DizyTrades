import assert from "node:assert/strict";
import test from "node:test";

import {
  MexcPrivateReadOnlyError,
  requestMexcPrivateRead,
} from "../app/lib/mexc-private-readonly.ts";

test("provider errors redact exact credential values and secret-labelled text", async () => {
  const credentials = {
    apiKey: "visible-test-api-key",
    apiSecret: "visible-test-api-secret",
  };
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
                message:
                  "apiKey=visible-test-api-key secret=visible-test-api-secret signature=provider-value token=provider-token",
              }),
              { status: 200 },
            ),
        },
      ),
    (error) => {
      assert.ok(error instanceof MexcPrivateReadOnlyError);
      assert.equal(error.kind, "trade-read-permission-required");
      assert.equal(error.message.includes(credentials.apiKey), false);
      assert.equal(error.message.includes(credentials.apiSecret), false);
      assert.equal(error.message.includes("provider-value"), false);
      assert.equal(error.message.includes("provider-token"), false);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
});
