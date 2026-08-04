import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("temporary branch tree probe", () => {
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    encoding: "utf8",
  }).trim();
  console.log(`DIZY_TEMP_TREE_SHA=${tree}`);
  assert.match(tree, /^[0-9a-f]{40}$/);
});
