import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Manual Paper fetches funding history only for mutable open positions", async () => {
  const source = await readFile(
    new URL("../app/api/manual-paper/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /publicFunding\(symbol:string,includeHistory=false\)/);
  assert.match(
    source,
    /publicFunding\(symbol,hasPosition&&user\.role!=="viewer"\)/,
  );
  assert.match(
    source,
    /publicFunding\(symbol,Boolean\(before\.positions\[symbol\]\)\)/,
  );
  assert.match(source, /count:old\.count\+1/);
});
